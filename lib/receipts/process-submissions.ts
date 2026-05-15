import type { SupabaseClient } from "@supabase/supabase-js";
import {
  analyzeReceiptWithGemini,
  type ReceiptOcrResult,
} from "@/lib/gemini/receipt-ocr";
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
  mf_status: string;
};

type CustomerDriveSettings = {
  id: string;
  drive_folder_id: string | null;
  error_drive_folder_id: string | null;
};

function fileFromBlob(blob: Blob, fileName: string, mimeType: string) {
  return new File([blob], fileName, { type: mimeType || blob.type });
}

function getCompletedOcr(submission: SubmissionRow): ReceiptOcrResult | null {
  if (submission.ocr_status !== "completed") return null;
  return {
    date: submission.ocr_date,
    amount: submission.ocr_amount,
    store: submission.ocr_store,
    summary: submission.ocr_summary,
    is_credit_card: submission.ocr_is_credit_card,
  };
}

async function getCustomerDriveSettings({
  supabase,
  customerId,
}: {
  supabase: SupabaseClient<Database>;
  customerId: string;
}) {
  const { data: customer, error } = await supabase
    .from("customer_accounts")
    .select("id, drive_folder_id, error_drive_folder_id")
    .eq("id", customerId)
    .maybeSingle();

  if (error) throw error;
  if (!customer) {
    throw new Error("顧客情報を取得できませんでした。");
  }

  return customer as CustomerDriveSettings;
}

async function downloadStoredFile({
  supabase,
  submission,
}: {
  supabase: SupabaseClient<Database>;
  submission: SubmissionRow;
}) {
  if (!submission.source_storage_path) {
    throw new Error("一時保存ファイルがありません。");
  }

  const { data: storedFile, error } = await supabase.storage
    .from(receiptUploadBucket)
    .download(submission.source_storage_path);

  if (error || !storedFile) {
    throw new Error("一時保存ファイルを取得できませんでした。");
  }

  return fileFromBlob(storedFile, submission.file_name, submission.mime_type);
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

async function uploadToDriveIfNeeded({
  supabase,
  submission,
  customer,
  file,
}: {
  supabase: SupabaseClient<Database>;
  submission: SubmissionRow;
  customer: CustomerDriveSettings;
  file: File;
}) {
  if (submission.drive_file_id) return submission.drive_file_id;
  if (!customer.drive_folder_id || !isGoogleDriveConfigured()) return null;

  const uploadedFile = await uploadFileToDrive({
    file,
    folderId: customer.drive_folder_id,
    fileName: submission.file_name || "uploaded-file",
  });

  await supabase
    .from("submissions")
    .update({
      drive_file_id: uploadedFile.fileId,
      drive_view_url: uploadedFile.viewUrl,
    })
    .eq("id", submission.id);

  return uploadedFile.fileId;
}

async function runOcrForSubmission({
  supabase,
  submission,
  file,
}: {
  supabase: SupabaseClient<Database>;
  submission: SubmissionRow;
  file: File;
}) {
  const existingOcr = getCompletedOcr(submission);
  if (existingOcr) return existingOcr;

  const ocr = await analyzeReceiptWithGemini({
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
      })
      .eq("id", submission.id);

    throw new Error(`OCRに失敗しました。${ocr.error}`);
  }

  await supabase
    .from("submissions")
    .update({
      ocr_status: "completed",
      ocr_error: null,
      ocr_raw_response: ocr.rawResponse,
      ocr_processed_at: new Date().toISOString(),
      ocr_date: ocr.result.date,
      ocr_amount: ocr.result.amount,
      ocr_store: ocr.result.store,
      ocr_summary: ocr.result.summary,
      ocr_is_credit_card: ocr.result.is_credit_card,
    })
    .eq("id", submission.id);

  return ocr.result;
}

async function getSubmissionForProcessing({
  supabase,
  submissionId,
  customerId,
}: {
  supabase: SupabaseClient<Database>;
  submissionId: string;
  customerId: string;
}) {
  const { data, error } = await supabase
    .from("submissions")
    .select(
      "id, customer_account_id, transaction_note, file_name, mime_type, source_storage_path, submitted_at, drive_file_id, drive_view_url, ocr_status, ocr_date, ocr_amount, ocr_store, ocr_summary, ocr_is_credit_card, mf_status",
    )
    .eq("id", submissionId)
    .eq("customer_account_id", customerId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("送信データを取得できませんでした。");

  return data as SubmissionRow;
}

export async function processCustomerPendingOcr({
  supabase,
  customerId,
  limit = 10,
}: {
  supabase: SupabaseClient<Database>;
  customerId: string;
  limit?: number;
}) {
  const { data: submissions, error } = await supabase
    .from("submissions")
    .select(
      "id, customer_account_id, transaction_note, file_name, mime_type, source_storage_path, submitted_at, drive_file_id, drive_view_url, ocr_status, ocr_date, ocr_amount, ocr_store, ocr_summary, ocr_is_credit_card, mf_status",
    )
    .eq("customer_account_id", customerId)
    .in("ocr_status", ["pending", "failed"])
    .not("source_storage_path", "is", null)
    .order("submitted_at", { ascending: true })
    .limit(limit);

  if (error) throw error;

  let processed = 0;
  for (const submission of (submissions ?? []) as SubmissionRow[]) {
    try {
      const file = await downloadStoredFile({ supabase, submission });
      await runOcrForSubmission({ supabase, submission, file });
      processed += 1;
    } catch (error) {
      console.error("Failed to process OCR", error);
    }
  }

  return processed;
}

export async function processSubmissionToMoneyForward({
  supabase,
  customerId,
  submissionId,
}: {
  supabase: SupabaseClient<Database>;
  customerId: string;
  submissionId: string;
}) {
  const customer = await getCustomerDriveSettings({ supabase, customerId });
  const submission = await getSubmissionForProcessing({
    supabase,
    submissionId,
    customerId,
  });

  if (submission.mf_status === "sent") {
    return;
  }

  let driveFileId = submission.drive_file_id;

  try {
    const file = await downloadStoredFile({ supabase, submission });
    const ocr = await runOcrForSubmission({ supabase, submission, file });

    driveFileId = await uploadToDriveIfNeeded({
      supabase,
      submission,
      customer,
      file,
    });

    await submitReceiptToMoneyForward({
      supabase,
      customerAccountId: customerId,
      submissionId: submission.id,
      submittedAt: submission.submitted_at,
      file,
      mimeType: submission.mime_type,
      transactionNote: submission.transaction_note,
      ocr,
    });

    if (driveFileId) {
      await deleteStoredSource({
        supabase,
        submissionId: submission.id,
        storagePath: submission.source_storage_path,
      });
    }
  } catch (error) {
    console.error("Failed to send receipt to Money Forward", error);

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
          error instanceof Error
            ? error.message
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

    throw error;
  }
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
  const { data: submissions, error } = await supabase
    .from("submissions")
    .select("id")
    .eq("customer_account_id", customerId)
    .neq("mf_status", "sent")
    .not("source_storage_path", "is", null)
    .order("submitted_at", { ascending: true })
    .limit(limit);

  if (error) throw error;

  let processed = 0;
  for (const submission of submissions ?? []) {
    try {
      await processSubmissionToMoneyForward({
        supabase,
        customerId,
        submissionId: submission.id,
      });
      processed += 1;
    } catch (error) {
      console.error("Failed to process pending submission", error);
    }
  }

  return processed;
}
