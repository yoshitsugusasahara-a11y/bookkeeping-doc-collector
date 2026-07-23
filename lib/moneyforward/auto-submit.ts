import type { SupabaseClient } from "@supabase/supabase-js";
import { generateMfJournalWithGemini } from "@/lib/gemini/mf-journal";
import type { ReceiptOcrResult } from "@/lib/gemini/receipt-ocr";
import type { Database } from "@/lib/supabase/types";
import {
  buildVoucherFileName,
  getExtensionFromMimeType,
  getMoneyForwardAccounts,
  getMoneyForwardTaxes,
  getValidMoneyForwardAccessToken,
  postMoneyForwardJournal,
  postMoneyForwardVouchers,
} from "./client";

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
}) {
  const { data: connection } = await supabase
    .from("mf_connections")
    .select("access_token, refresh_token, token_type, scope, expires_at")
    .eq("customer_account_id", customerAccountId)
    .maybeSingle();

  if (!connection) {
    await supabase
      .from("submissions")
      .update({
        mf_status: "not_ready",
        mf_error: "MF連携が未完了です。設定画面でマネーフォワード連携を完了してください。",
      })
      .eq("id", submissionId);
    return;
  }

  let activeConnection = connection;
  let refreshed;

  try {
    refreshed = await getValidMoneyForwardAccessToken(activeConnection);
  } catch (refreshError) {
    // 他の処理（Cron・手動実行など）が直前に同じrefresh_tokenを使って
    // ローテーション済みの場合、DBには新しいトークンが保存されている。
    // 再読込して自分の持っていたトークンと違えば、そちらでやり直す。
    const { data: latestConnection } = await supabase
      .from("mf_connections")
      .select("access_token, refresh_token, token_type, scope, expires_at")
      .eq("customer_account_id", customerAccountId)
      .maybeSingle();

    if (
      !latestConnection ||
      latestConnection.refresh_token === activeConnection.refresh_token
    ) {
      throw refreshError;
    }

    activeConnection = latestConnection;
    refreshed = await getValidMoneyForwardAccessToken(activeConnection);
  }

  const accessToken = refreshed?.access_token ?? activeConnection.access_token;

  if (refreshed) {
    const { data: savedRows, error: saveError } = await supabase
      .from("mf_connections")
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        token_type: refreshed.token_type,
        scope: refreshed.scope,
        expires_at: refreshed.expires_at,
      })
      .eq("customer_account_id", customerAccountId)
      .select("customer_account_id");

    if (saveError || !savedRows || savedRows.length === 0) {
      // 保存に失敗したまま処理を続けると、DBに残った古いrefresh_tokenが
      // 次回以降 invalid_grant で失敗し続けるため、ここで明示的に失敗させる。
      throw new Error(
        `MFトークンの保存に失敗しました。${saveError?.message ?? "更新対象の連携情報が見つかりませんでした。"}`,
      );
    }
  }

  const [accountsResponse, taxesResponse] = await Promise.all([
    getMoneyForwardAccounts(accessToken),
    getMoneyForwardTaxes(accessToken),
  ]);
  const accounts = Array.isArray(accountsResponse.accounts)
    ? accountsResponse.accounts
    : [];
  const taxes = Array.isArray(taxesResponse.taxes) ? taxesResponse.taxes : [];
  const voucherFileName = file
    ? buildVoucherFileName({
        date: ocr.date,
        amount: ocr.amount,
        isCreditCard: ocr.is_credit_card,
        extension: getExtensionFromMimeType(mimeType, file.name || "receipt"),
      })
    : "証憑ファイル添付なし";
  const journal = await generateMfJournalWithGemini({
    ocr,
    transactionNote,
    voucherFileName,
    submissionTimestampLabel: formatSubmittedAt(submittedAt),
    customerJournalPrompt,
    accounts: accounts as never[],
    taxes: taxes as never[],
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
