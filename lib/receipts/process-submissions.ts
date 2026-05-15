import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeReceiptWithGemini } from "@/lib/gemini/receipt-ocr";
import {
  isGoogleDriveConfigured,
  moveDriveFile,
  uploadFileToDrive,
} from "@/lib/google/drive";
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
  drive_view_url: string | null;
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

async function deleteStoredSource({
  supabase,
  submissionId,
  storagePath,
}: {
  supabase: SupabaseClient<Database>;
  submissionId: string;
  storagePath: string | null;
}) {
  if (!storagePath) return;

  const { error } = await supabase.storage
    .from(receiptUploadBucket)
    .remove([storagePath]);

  if (error) {
    console.error("Failed to delete stored source file", error);
    return;
  }

  await supabase
    .from("submissions")
    .update({
      source_storage_path: null,
      source_deleted_at: new Date().toISOString(),
    })
    .eq("id", submissionId);
}

async function moveToErrorFolderIfPossible({
  supabase,
  submissionId,
  driveFileId,
  errorDriveFolderId,
}: {
  supabase: SupabaseClient<Database>;
  submissionId: string;
  driveFileId: string | null;
  errorDriveFolderId: string | null;
}) {
  if (!driveFileId || !errorDriveFolderId || !isGoogleDriveConfigured()) return;

  const movedFile = await moveDriveFile({
    fileId: driveFileId,
    folderId: errorDriveFolderId,
  });

  await supabase
    .from("submissions")
    .update({
      drive_file_id: movedFile.fileId,
      drive_view_url: movedFile.viewUrl,
    })
    .eq("id", submissionId);
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
    .select("id, drive_folder_id, error_drive_folder_id")
    .eq("id", customerId)
    .maybeSingle();

  if (!customer) {
    throw new Error("顧客が見つかりません。");
  }

  const { data: submissions, error } = await supabase
    .from("submissions")
    .select(
      "id, customer_account_id, transaction_note, file_name, mime_type, source_storage_path, submitted_at, drive_file_id, drive_view_url, ocr_status, ocr_date, ocr_amount, ocr_store, ocr_summary, ocr_is_credit_card",
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
    let driveFileId = submission.drive_file_id;
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

      if (!driveFileId && customer.drive_folder_id && isGoogleDriveConfigured()) {
        const uploadedFile = await uploadFileToDrive({
          file,
          folderId: customer.drive_folder_id,
          fileName: submission.file_name || "uploaded-file",
        });
        driveFileId = uploadedFile.fileId;

        await supabase
          .from("submissions")
          .update({
            drive_file_id: driveFileId,
            drive_view_url: uploadedFile.viewUrl,
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
        await moveToErrorFolderIfPossible({
          supabase,
          submissionId: submission.id,
          driveFileId,
          errorDriveFolderId: customer.error_drive_folder_id,
        });

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

        if (driveFileId) {
          await deleteStoredSource({
            supabase,
            submissionId: submission.id,
            storagePath: submission.source_storage_path,
          });
        }
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

      if (driveFileId) {
        await deleteStoredSource({
          supabase,
          submissionId: submission.id,
          storagePath: submission.source_storage_path,
        });
      }

      processed += 1;
    } catch (processError) {
      console.error("Failed to process pending submission", processError);
      try {
        await moveToErrorFolderIfPossible({
          supabase,
          submissionId: submission.id,
          driveFileId,
          errorDriveFolderId: customer.error_drive_folder_id,
        });
      } catch (moveError) {
        console.error("Failed to move failed receipt to error folder", moveError);
      }

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

      if (driveFileId) {
        await deleteStoredSource({
          supabase,
          submissionId: submission.id,
          storagePath: submission.source_storage_path,
        });
      }
    }
  }

  return processed;
}
