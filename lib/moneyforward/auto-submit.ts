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

export async function submitReceiptToMoneyForward({
  supabase,
  customerAccountId,
  submissionId,
  file,
  mimeType,
  transactionNote,
  ocr,
}: {
  supabase: SupabaseClient<Database>;
  customerAccountId: string;
  submissionId: string;
  file: File;
  mimeType: string;
  transactionNote: string;
  ocr: ReceiptOcrResult;
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

  const refreshed = await getValidMoneyForwardAccessToken(connection);
  const accessToken = refreshed?.access_token ?? connection.access_token;

  if (refreshed) {
    await supabase
      .from("mf_connections")
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        token_type: refreshed.token_type,
        scope: refreshed.scope,
        expires_at: refreshed.expires_at,
      })
      .eq("customer_account_id", customerAccountId);
  }

  const [accountsResponse, taxesResponse] = await Promise.all([
    getMoneyForwardAccounts(accessToken),
    getMoneyForwardTaxes(accessToken),
  ]);
  const accounts = Array.isArray(accountsResponse.accounts)
    ? accountsResponse.accounts
    : [];
  const taxes = Array.isArray(taxesResponse.taxes) ? taxesResponse.taxes : [];
  const journal = await generateMfJournalWithGemini({
    ocr,
    transactionNote,
    originalFileName: file.name || "receipt",
    accounts: accounts as never[],
    taxes: taxes as never[],
  });
  const journalResponse = await postMoneyForwardJournal({
    accessToken,
    journal,
  });
  const journalId = extractJournalId(journalResponse);
  const extension = getExtensionFromMimeType(mimeType, file.name || "receipt");
  const voucherFileName = buildVoucherFileName({
    date: ocr.date,
    amount: ocr.amount,
    isCreditCard: ocr.is_credit_card,
    extension,
  });
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
  const voucherFileId = voucherResponse.voucher_file_ids?.[0]?.file_id ?? null;

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
