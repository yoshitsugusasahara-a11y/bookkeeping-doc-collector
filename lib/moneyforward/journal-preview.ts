import type { SupabaseClient } from "@supabase/supabase-js";
import { generateMfJournalWithGemini } from "@/lib/gemini/mf-journal";
import type { ReceiptOcrResult } from "@/lib/gemini/receipt-ocr";
import type { Database } from "@/lib/supabase/types";
import {
  buildVoucherFileName,
  getExtensionFromMimeType,
  getMoneyForwardAccounts,
  getMoneyForwardTaxes,
} from "./client";
import { resolveMoneyForwardAccessToken } from "./connection";

/**
 * MFへ実際にPOSTする仕訳と、その画面表示用の情報。
 *
 * 利用者が画面で見て承認した仕訳が、そのままMFへ送られる必要があるため、
 * payload は生成時のまま保存し、送信時に作り直さない。Gemini の出力は
 * temperature を下げていても完全には決定的ではなく、モデルのフォールバックも
 * あるため、再生成すると承認した内容と別の仕訳が送られ得る。
 *
 * display は科目ID・税区分IDを名称へ解決したもの。画面表示のたびに
 * MF APIを叩かなくて済むよう、生成時点の名称を一緒に保存する。
 */
export type MfJournalPreviewLine = {
  accountName: string;
  subAccountName: string | null;
  taxName: string | null;
  value: number;
};

export type MfJournalPreviewDisplay = {
  transactionDate: string;
  memo: string;
  tags: string[];
  voucherFileName: string;
  branches: Array<{
    remark: string;
    debit: MfJournalPreviewLine;
    credit: MfJournalPreviewLine;
  }>;
};

export type MfJournalPreview = {
  payload: Record<string, unknown>;
  display: MfJournalPreviewDisplay;
};

export type MfJournalPreviewStatus =
  | "pending"
  | "completed"
  | "failed"
  | "skipped";

type MfAccountLike = {
  id?: unknown;
  name?: unknown;
  sub_accounts?: Array<{ id?: unknown; name?: unknown }>;
};

type MfTaxLike = { id: string; name?: string; tax_rate?: number };

function formatSubmittedAt(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

function formatSubmittedAtDate(value: string) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

function buildNameLookups(accounts: MfAccountLike[], taxes: MfTaxLike[]) {
  const accountNameById = new Map<string, string>();
  const subAccountNameById = new Map<string, string>();
  const taxNameById = new Map<string, string>();

  for (const account of accounts) {
    if (typeof account.id === "string" && typeof account.name === "string") {
      accountNameById.set(account.id, account.name);
    }
    for (const subAccount of account.sub_accounts ?? []) {
      if (
        typeof subAccount.id === "string" &&
        typeof subAccount.name === "string"
      ) {
        subAccountNameById.set(subAccount.id, subAccount.name);
      }
    }
  }

  for (const tax of taxes) {
    if (typeof tax.id === "string" && typeof tax.name === "string") {
      taxNameById.set(tax.id, tax.name);
    }
  }

  return { accountNameById, subAccountNameById, taxNameById };
}

type JournalLine = {
  value: number;
  account_id: string;
  sub_account_id?: string | null;
  tax_id?: string | null;
};

function toDisplayLine(
  line: JournalLine,
  lookups: ReturnType<typeof buildNameLookups>,
): MfJournalPreviewLine {
  return {
    accountName:
      lookups.accountNameById.get(line.account_id) ?? "（不明な科目）",
    subAccountName: line.sub_account_id
      ? lookups.subAccountNameById.get(line.sub_account_id) ?? null
      : null,
    taxName: line.tax_id
      ? lookups.taxNameById.get(line.tax_id) ?? null
      : null,
    value: line.value,
  };
}

/**
 * レシート1件分の予測仕訳を生成する。MF連携が未完了の場合は null を返す
 * （呼び出し側で status を skipped として扱う）。生成に失敗した場合は例外を投げる。
 */
export async function generateMfJournalPreview({
  supabase,
  customerAccountId,
  submittedAt,
  fileName,
  mimeType,
  transactionNote,
  ocr,
  customerJournalPrompt = null,
  suspenseAccountId = null,
  suspenseAccountName = null,
  businessContextLines = [],
}: {
  supabase: SupabaseClient<Database>;
  customerAccountId: string;
  submittedAt: string;
  fileName: string;
  mimeType: string;
  transactionNote: string;
  ocr: ReceiptOcrResult;
  customerJournalPrompt?: string | null;
  suspenseAccountId?: string | null;
  suspenseAccountName?: string | null;
  businessContextLines?: string[];
}): Promise<MfJournalPreview | null> {
  const accessToken = await resolveMoneyForwardAccessToken({
    supabase,
    customerAccountId,
  });

  if (!accessToken) return null;

  const accountsResponse = await getMoneyForwardAccounts(accessToken);
  const accounts = Array.isArray(accountsResponse.accounts)
    ? (accountsResponse.accounts as MfAccountLike[])
    : [];

  // 借方が複数科目に分かれる可能性があるレシートは、科目を自動確定せず
  // 顧客ごとに設定した仮計上科目へ計上する。設定がない、または設定済みの科目が
  // MF側で削除されている場合は、誤った科目で計上せずここで失敗させる。
  let resolvedSuspenseAccountId: string | null = null;
  if (ocr.has_multiple_account_candidates) {
    if (!suspenseAccountId) {
      throw new Error(
        "複数の勘定科目に分かれる可能性があるレシートですが、仮計上科目が未設定のため仕訳を作成できません。管理者にご連絡ください。",
      );
    }

    const suspenseAccountExists = accounts.some(
      (account) => account?.id === suspenseAccountId,
    );

    if (!suspenseAccountExists) {
      throw new Error(
        `複数の勘定科目に分かれる可能性があるレシートですが、仮計上科目「${suspenseAccountName ?? "未設定"}」がマネーフォワード上に見つかりません。管理者にご連絡ください。`,
      );
    }

    resolvedSuspenseAccountId = suspenseAccountId;
  }

  // 税区分は画面表示で名称が必要になるため、軽減税率の判定要否に関わらず取得する。
  const taxesResponse = await getMoneyForwardTaxes(accessToken);
  const taxes = Array.isArray(taxesResponse.taxes)
    ? (taxesResponse.taxes as MfTaxLike[])
    : [];

  const voucherFileName = buildVoucherFileName({
    date: ocr.date,
    amount: ocr.amount,
    isCreditCard: ocr.is_credit_card,
    extension: getExtensionFromMimeType(mimeType, fileName || "receipt"),
  });
  const transactionDate = ocr.date || formatSubmittedAtDate(submittedAt);

  const journal = await generateMfJournalWithGemini({
    ocr,
    transactionNote,
    voucherFileName,
    transactionDate,
    needsDateConfirmation: !ocr.date,
    submissionTimestampLabel: formatSubmittedAt(submittedAt),
    customerJournalPrompt,
    accounts: accounts as never[],
    taxes,
    suspenseAccountId: resolvedSuspenseAccountId,
    businessContextLines,
  });

  const lookups = buildNameLookups(accounts, taxes);

  const display: MfJournalPreviewDisplay = {
    transactionDate: journal.transaction_date,
    memo: journal.memo ?? "",
    tags: journal.tags ?? [],
    voucherFileName,
    branches: journal.branches.map((branch) => ({
      remark: branch.remark ?? "",
      debit: toDisplayLine(branch.debitor as JournalLine, lookups),
      credit: toDisplayLine(branch.creditor as JournalLine, lookups),
    })),
  };

  return {
    payload: journal as unknown as Record<string, unknown>,
    display,
  };
}

/**
 * 予測仕訳を生成してDBへ保存する。失敗しても例外を投げず、状態として記録する。
 * OCR直後のバックグラウンド処理から呼ばれ、ここでの失敗が
 * OCR自体の成功を打ち消さないようにするため。
 */
export async function generateAndStoreMfJournalPreview({
  supabase,
  customerAccountId,
  submissionId,
  submittedAt,
  fileName,
  mimeType,
  transactionNote,
  ocr,
  customerJournalPrompt = null,
  suspenseAccountId = null,
  suspenseAccountName = null,
  businessContextLines = [],
}: {
  supabase: SupabaseClient<Database>;
  customerAccountId: string;
  submissionId: string;
  submittedAt: string;
  fileName: string;
  mimeType: string;
  transactionNote: string;
  ocr: ReceiptOcrResult;
  customerJournalPrompt?: string | null;
  suspenseAccountId?: string | null;
  suspenseAccountName?: string | null;
  businessContextLines?: string[];
}): Promise<MfJournalPreview | null> {
  try {
    const preview = await generateMfJournalPreview({
      supabase,
      customerAccountId,
      submittedAt,
      fileName,
      mimeType,
      transactionNote,
      ocr,
      customerJournalPrompt,
      suspenseAccountId,
      suspenseAccountName,
      businessContextLines,
    });

    if (!preview) {
      await supabase
        .from("submissions")
        .update({
          mf_journal_preview: null,
          mf_journal_preview_status: "skipped",
          mf_journal_preview_error:
            "MF連携が未完了のため、予測仕訳を作成できません。",
          mf_journal_preview_generated_at: new Date().toISOString(),
        })
        .eq("id", submissionId);
      return null;
    }

    await supabase
      .from("submissions")
      .update({
        mf_journal_preview: preview,
        mf_journal_preview_status: "completed",
        mf_journal_preview_error: null,
        mf_journal_preview_generated_at: new Date().toISOString(),
      })
      .eq("id", submissionId);

    return preview;
  } catch (error) {
    console.error("Failed to generate MF journal preview", error);
    await supabase
      .from("submissions")
      .update({
        mf_journal_preview: null,
        mf_journal_preview_status: "failed",
        mf_journal_preview_error:
          error instanceof Error
            ? error.message
            : "予測仕訳の作成中にエラーが発生しました。",
        mf_journal_preview_generated_at: new Date().toISOString(),
      })
      .eq("id", submissionId);
    return null;
  }
}

/**
 * OCR結果が編集されたときなど、保存済みの予測仕訳が古くなった場合に破棄する。
 * 次のバックグラウンド処理または手動再生成で作り直される。
 */
export function buildClearedMfJournalPreviewFields() {
  return {
    mf_journal_preview: null,
    mf_journal_preview_status: "pending",
    mf_journal_preview_error: null,
    mf_journal_preview_generated_at: null,
  } as const;
}
