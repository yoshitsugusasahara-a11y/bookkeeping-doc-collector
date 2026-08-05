import type { SupabaseClient } from "@supabase/supabase-js";
import { generateMfJournalWithGemini } from "@/lib/gemini/mf-journal";
import type { ReceiptOcrResult } from "@/lib/gemini/receipt-ocr";
import type { Database } from "@/lib/supabase/types";
import {
  buildVoucherFileName,
  getExtensionFromMimeType,
  getMoneyForwardAccounts,
  getMoneyForwardTaxes,
  postMoneyForwardJournal,
  postMoneyForwardVouchers,
} from "./client";
import { resolveMoneyForwardAccessToken } from "./connection";

function fileToBase64(buffer: ArrayBuffer) {
  return Buffer.from(buffer).toString("base64");
}

function extractJournalId(payload: unknown) {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const journal = record.journal && typeof record.journal === "object"
    ? record.journal as Record<string, unknown>
    : null;

  if (journal && typeof journal.id === "string") return journal.id;
  if (typeof record.id === "string") return record.id;
  throw new Error("Money Forward journal response did not include journal ID.");
}

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

export async function submitReceiptToMoneyForward({
  supabase,
  customerAccountId,
  submissionId,
  submittedAt,
  file = null,
  mimeType,
  transactionNote,
  ocr,
  customerJournalPrompt = null,
  suspenseAccountId = null,
  suspenseAccountName = null,
}: {
  supabase: SupabaseClient<Database>;
  customerAccountId: string;
  submissionId: string;
  submittedAt: string;
  file?: File | null;
  mimeType: string;
  transactionNote: string;
  ocr: ReceiptOcrResult;
  customerJournalPrompt?: string | null;
  suspenseAccountId?: string | null;
  suspenseAccountName?: string | null;
}) {
  const accessToken = await resolveMoneyForwardAccessToken({
    supabase,
    customerAccountId,
  });

  if (!accessToken) {
    await supabase
      .from("submissions")
      .update({
        mf_status: "not_ready",
        mf_error: "MF連携が未完了です。設定画面でマネーフォワード連携を完了してください。",
      })
      .eq("id", submissionId);
    return;
  }

  const accountsResponse = await getMoneyForwardAccounts(accessToken);
  const accounts = Array.isArray(accountsResponse.accounts)
    ? accountsResponse.accounts
    : [];

  // 借方が複数科目に分かれる可能性があるレシートは、科目を自動確定せず
  // 顧客ごとに設定した仮計上科目へ計上する。設定がない、または設定済みの科目が
  // MF側で削除されている場合は、誤った科目で計上せずここで送信を止める。
  let resolvedSuspenseAccountId: string | null = null;
  if (ocr.has_multiple_account_candidates) {
    if (!suspenseAccountId) {
      throw new Error(
        "複数の勘定科目に分かれる可能性があるレシートですが、仮計上科目が未設定のため送信できません。管理者にご連絡ください。",
      );
    }

    const suspenseAccountExists = (
      accounts as Array<{ id?: unknown }>
    ).some((account) => account?.id === suspenseAccountId);

    if (!suspenseAccountExists) {
      throw new Error(
        `複数の勘定科目に分かれる可能性があるレシートですが、仮計上科目「${suspenseAccountName ?? "未設定"}」がマネーフォワード上に見つかりません。管理者にご連絡ください。`,
      );
    }

    resolvedSuspenseAccountId = suspenseAccountId;
  }

  // 混在レシートに限らず、単一税率が8%のみと判明しているレシートでも
  // 軽減税率区分への差し替えが必要なため、tax_breakdown に8%が含まれる場合は取得する。
  const needsTaxLookup =
    ocr.has_multiple_tax_rates ||
    (ocr.tax_breakdown?.some((entry) => entry.rate === 8) ?? false);

  let taxes: Array<{ id: string; name?: string; tax_rate?: number }> = [];
  if (needsTaxLookup) {
    const taxesResponse = await getMoneyForwardTaxes(accessToken);
    taxes = Array.isArray(taxesResponse.taxes)
      ? (taxesResponse.taxes as Array<{ id: string; name?: string; tax_rate?: number }>)
      : [];
  }

  const voucherFileName = file
    ? buildVoucherFileName({
        date: ocr.date,
        amount: ocr.amount,
        isCreditCard: ocr.is_credit_card,
        extension: getExtensionFromMimeType(mimeType, file.name || "receipt"),
      })
    : "証憑ファイル添付なし";
  const transactionDate = ocr.date || formatSubmittedAtDate(submittedAt);
  const needsDateConfirmation = !ocr.date;
  const journal = await generateMfJournalWithGemini({
    ocr,
    transactionNote,
    voucherFileName,
    transactionDate,
    needsDateConfirmation,
    submissionTimestampLabel: formatSubmittedAt(submittedAt),
    customerJournalPrompt,
    accounts: accounts as never[],
    taxes,
    suspenseAccountId: resolvedSuspenseAccountId,
  });
  const journalResponse = await postMoneyForwardJournal({
    accessToken,
    journal,
  });
  const journalId = extractJournalId(journalResponse);

  let voucherFileId: string | null = null;
  if (file) {
    const voucherResponse = await postMoneyForwardVouchers({
      accessToken,
      journalId,
      voucherFiles: [
        {
          file_name: voucherFileName,
          file_data: fileToBase64(await file.arrayBuffer()),
        },
      ],
    });
    voucherFileId = voucherResponse.voucher_file_ids?.[0]?.file_id ?? null;
  }

  await supabase
    .from("submissions")
    .update({
      mf_status: "sent",
      mf_error: null,
      mf_journal_id: journalId,
      mf_voucher_file_id: voucherFileId,
      mf_sent_at: new Date().toISOString(),
    })
    .eq("id", submissionId);
}
