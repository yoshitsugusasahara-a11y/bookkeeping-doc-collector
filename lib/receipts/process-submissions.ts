import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeReceiptWithGemini } from "@/lib/gemini/receipt-ocr";
import { isGoogleDriveConfigured, uploadFileToDrive } from "@/lib/google/drive";
import { submitReceiptToMoneyForward } from "@/lib/moneyforward/auto-submit";
import type { Database } from "@/lib/supabase/types";

const receiptUploadBucket = "receipt_uploads";

type SubmissionRow = {
  id: string;
  customer_account_id: string;
  transaction_note: string;
  file_name: string;
  mime_type: string;
  source_storage_path: string | null;
  submitted_at: string;
  drive_file_id: string | null;
  ocr_status: string;
  ocr_date: string | null;
  ocr_amount: number | null;
  ocr_store: string | null;
  ocr_summary: string | null;
  ocr_is_credit_card: boolean | null;
};

function fileFromBlob(blob: Blob, fileName: string, mimeType: string) {
  return new File([blob], fileName, { type: mimeType || blob.type });
}

function getCompletedOcr(submission: SubmissionRow) {
  if (submission.ocr_status !== "completed") return null;
  return {
    date: submission.ocr_date,
    amount: submission.ocr_amount,
    store: submission.ocr_store,
    summary: submission.ocr_summary,
    is_credit_card: submission.ocr_is_credit_card,
  };
}

export async function processCustomerPendingSubmissions({
  supabase,
  customerId,
  limit = 20,
}: {
  supabase: SupabaseClient<Database>;
  customerId: string;
  limit?: number;
}) {
  const { data: customer } = await supabase
    .from("customer_accounts")
    .select("id, drive_folder_id")
    .eq("id", customerId)
    .maybeSingle();

  if (!customer) {
    throw new Error("顧客が見つかりません。");
  }

  const { data: submissions, error } = await supabase
    .from("submissions")
    .select(
      "id, customer_account_id, transaction_note, file_name, mime_type, source_storage_path, submitted_at, drive_file_id, ocr_status, ocr_date, ocr_amount, ocr_store, ocr_summary, ocr_is_credit_card",
    )
    .eq("customer_account_id", customerId)
    .neq("mf_status", "sent")
    .not("source_storage_path", "is", null)
    .order("submitted_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  let processed = 0;

  for (const submission of submissions ?? []) {
    try {
      const { data: storedFile, error: downloadError } = await supabase.storage
        .from(receiptUploadBucket)
        .download(submission.source_storage_path || "");

      if (downloadError || !storedFile) {
        throw new Error("一時保存ファイルを取得できませんでした。");
      }

      const file = fileFromBlob(
        storedFile,
        submission.file_name,
        submission.mime_type,
      );

      let driveFileId = submission.drive_file_id;
      let driveViewUrl: string | null = null;

      if (!driveFileId && customer.drive_folder_id && isGoogleDriveConfigured()) {
        const uploadedFile = await uploadFileToDrive({
          file,
          folderId: customer.drive_folder_id,
          fileName: submission.file_name || "uploaded-file",
        });
        driveFileId = uploadedFile.fileId;
        driveViewUrl = uploadedFile.viewUrl;

        await supabase
          .from("submissions")
          .update({
            drive_file_id: driveFileId,
            drive_view_url: driveViewUrl,
          })
          .eq("id", submission.id);
      }

      const existingOcr = getCompletedOcr(submission);
      const ocr = existingOcr
        ? { status: "completed" as const, result: existingOcr }
        : await analyzeReceiptWithGemini({
            file,
            mimeType: submission.mime_type,
            transactionNote: submission.transaction_note,
          });

      if (ocr.status !== "completed") {
        await supabase
          .from("submissions")
          .update({
            ocr_status: ocr.status,
            ocr_error: ocr.error,
            ocr_raw_response: ocr.rawResponse,
            mf_status: "failed",
            mf_error: "OCRに失敗したため、MF会計へ送信できませんでした。",
          })
          .eq("id", submission.id);
        continue;
      }

      await supabase
        .from("submissions")
        .update({
          ocr_status: "completed",
          ocr_error: null,
          ocr_raw_response: existingOcr
            ? null
            : "rawResponse" in ocr
              ? ocr.rawResponse
              : null,
          ocr_processed_at: new Date().toISOString(),
          ocr_date: ocr.result.date,
          ocr_amount: ocr.result.amount,
          ocr_store: ocr.result.store,
          ocr_summary: ocr.result.summary,
          ocr_is_credit_card: ocr.result.is_credit_card,
          mf_status: "not_sent",
          mf_error: null,
        })
        .eq("id", submission.id);

      await submitReceiptToMoneyForward({
        supabase,
        customerAccountId: customerId,
        submissionId: submission.id,
        submittedAt: submission.submitted_at,
        file,
        mimeType: submission.mime_type,
        transactionNote: submission.transaction_note,
        ocr: ocr.result,
      });

      processed += 1;
    } catch (processError) {
      console.error("Failed to process pending submission", processError);
      await supabase
        .from("submissions")
        .update({
          mf_status: "failed",
          mf_error:
            processError instanceof Error
              ? processError.message
              : "処理中にエラーが発生しました。",
        })
        .eq("id", submission.id);
    }
  }

  return processed;
}
