import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReceiptOcrResult } from "@/lib/gemini/receipt-ocr";
import type { Database } from "@/lib/supabase/types";
import { postMoneyForwardJournal, postMoneyForwardVouchers } from "./client";
import { resolveMoneyForwardAccessToken } from "./connection";
import {
  generateAndStoreMfJournalPreview,
  type MfJournalPreview,
} from "./journal-preview";

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
  submittedAt,
  file = null,
  mimeType,
  transactionNote,
  ocr,
  customerJournalPrompt = null,
  suspenseAccountId = null,
  suspenseAccountName = null,
  storedPreview = null,
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
  storedPreview?: MfJournalPreview | null;
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

  // 画面に表示され、利用者が承認した仕訳をそのまま送るため、保存済みの
  // 予測仕訳があれば再生成しない。未生成の場合（予測仕訳の導入前に
  // 取り込まれた資料など）に限り、ここで生成して保存する。
  const preview =
    storedPreview ??
    (await generateAndStoreMfJournalPreview({
      supabase,
      customerAccountId,
      submissionId,
      submittedAt,
      fileName: file?.name ?? "receipt",
      mimeType,
      transactionNote,
      ocr,
      customerJournalPrompt,
      suspenseAccountId,
      suspenseAccountName,
    }));

  if (!preview) {
    throw new Error(
      "予測仕訳を作成できなかったため送信できません。履歴画面のエラー内容をご確認ください。",
    );
  }

  const voucherFileName = file
    ? preview.display.voucherFileName
    : "証憑ファイル添付なし";
  const journalResponse = await postMoneyForwardJournal({
    accessToken,
    journal: preview.payload,
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
