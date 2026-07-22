import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyDocumentWithGemini,
  type DocumentRuleForClassification,
} from "@/lib/gemini/document-classifier";
import {
  analyzeReceiptWithGemini,
  type ReceiptOcrResult,
} from "@/lib/gemini/receipt-ocr";
import {
  isGoogleDriveConfigured,
  moveDriveFile,
  renameDriveFile,
  uploadFileToDrive,
} from "@/lib/google/drive";
import {
  getErrorMessageForLog,
  logActivity,
  type ActivitySource,
} from "@/lib/logging/activity-log";
import { submitReceiptToMoneyForward } from "@/lib/moneyforward/auto-submit";
import {
  buildVoucherFileName,
  getExtensionFromMimeType,
} from "@/lib/moneyforward/client";
import type { Database } from "@/lib/supabase/types";

const receiptUploadBucket = "receipt_uploads";
const submissionProcessingColumns =
  "id, customer_account_id, transaction_note, file_name, mime_type, source_storage_path, submitted_at, drive_file_id, drive_view_url, document_classification_status, document_kind, document_rule_id, document_confidence, document_error, document_drive_file_name, ocr_status, ocr_date, ocr_amount, ocr_store, ocr_summary, ocr_payment_method, ocr_is_credit_card, mf_status";

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
  document_classification_status: string;
  document_kind: string | null;
  document_rule_id: string | null;
  document_confidence: number | null;
  document_error: string | null;
  document_drive_file_name: string | null;
  ocr_status: string;
  ocr_date: string | null;
  ocr_amount: number | null;
  ocr_store: string | null;
  ocr_summary: string | null;
  ocr_payment_method: "cash" | "credit_card" | "cashless" | null;
  ocr_is_credit_card: boolean | null;
  mf_status: string;
};

type CustomerDriveSettings = {
  id: string;
  drive_folder_id: string | null;
  error_drive_folder_id: string | null;
  irregular_drive_folder_id: string | null;
  journal_prompt: string | null;
};

type DocumentRule = DocumentRuleForClassification & {
  drive_folder_id: string | null;
  drive_folder_name: string | null;
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
    payment_method: submission.ocr_payment_method || "cash",
    is_credit_card: submission.ocr_is_credit_card,
  };
}

function sanitizeDriveFileName(fileName: string) {
  return (fileName || "uploaded-file")
    .replace(/[\\/:*?"<>|#%{}[\]^~`]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 160);
}

function getOriginalExtension(fileName: string) {
  const match = fileName.match(/(\.[a-z0-9]{1,10})$/i);
  return match?.[1] ?? "";
}

function formatRuleDate(value: string | null, fallback: string) {
  const date = value ? new Date(`${value}T00:00:00+09:00`) : new Date(fallback);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return {
    YYYY: year,
    yyyy: year,
    YY: year.slice(-2),
    yy: year.slice(-2),
    MM: month,
    mm: month,
    DD: day,
    dd: day,
    YYYYMM: `${year}${month}`,
    yyyymm: `${year}${month}`,
    YYMM: `${year.slice(-2)}${month}`,
    yymm: `${year.slice(-2)}${month}`,
    YYYYMMDD: `${year}${month}${day}`,
    yyyymmdd: `${year}${month}${day}`,
    YYMMDD: `${year.slice(-2)}${month}${day}`,
    yymmdd: `${year.slice(-2)}${month}${day}`,
  };
}

function buildDocumentFileName({
  rule,
  documentDate,
  submittedAt,
  originalFileName,
}: {
  rule: DocumentRule;
  documentDate: string | null;
  submittedAt: string;
  originalFileName: string;
}) {
  const dateParts = formatRuleDate(documentDate, submittedAt);
  let fileName = rule.file_name_rule;

  Object.entries(dateParts)
    .sort(([a], [b]) => b.length - a.length)
    .forEach(([token, value]) => {
    fileName = fileName.replaceAll(token, value);
    });

  if (!/\.[a-z0-9]{1,10}$/i.test(fileName)) {
    fileName += getOriginalExtension(originalFileName);
  }

  return sanitizeDriveFileName(fileName);
}

function normalizeForMatching(value: string | null | undefined) {
  return (value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function findRuleMentionedInReason({
  rules,
  reason,
}: {
  rules: DocumentRule[];
  reason: string | null;
}) {
  const normalizedReason = normalizeForMatching(reason);
  if (!normalizedReason) return null;

  return (
    rules.find((rule) => {
      const ruleName = normalizeForMatching(rule.document_name);
      if (ruleName && normalizedReason.includes(ruleName)) return true;

      const features = normalizeForMatching(rule.match_features);
      if (!features) return false;

      return features
        .split(/[、,・/／]+/)
        .map((feature) => feature.trim())
        .filter((feature) => feature.length >= 2)
        .some((feature) => normalizedReason.includes(feature));
    }) ?? null
  );
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
    .select(
      "id, drive_folder_id, error_drive_folder_id, irregular_drive_folder_id, journal_prompt",
    )
    .eq("id", customerId)
    .maybeSingle();

  if (error) throw error;
  if (!customer) {
    throw new Error("顧客情報を取得できませんでした。");
  }

  return customer as CustomerDriveSettings;
}

async function getDocumentRules({
  supabase,
  customerId,
}: {
  supabase: SupabaseClient<Database>;
  customerId: string;
}) {
  const { data, error } = await supabase
    .from("document_rules")
    .select(
      "id, document_name, match_features, file_name_rule, drive_folder_id, drive_folder_name",
    )
    .eq("customer_account_id", customerId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []) as DocumentRule[];
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

async function moveToPrimaryFolderIfPossible({
  supabase,
  submissionId,
  driveFileId,
  primaryDriveFolderId,
}: {
  supabase: SupabaseClient<Database>;
  submissionId: string;
  driveFileId: string | null;
  primaryDriveFolderId: string | null;
}) {
  if (!driveFileId || !primaryDriveFolderId || !isGoogleDriveConfigured()) return;

  const movedFile = await moveDriveFile({
    fileId: driveFileId,
    folderId: primaryDriveFolderId,
  });

  await supabase
    .from("submissions")
    .update({
      drive_file_id: movedFile.fileId,
      drive_view_url: movedFile.viewUrl,
    })
    .eq("id", submissionId);
}

function buildReceiptDriveFileName({
  submission,
  ocr,
}: {
  submission: SubmissionRow;
  ocr: ReceiptOcrResult;
}) {
  const extension = getExtensionFromMimeType(
    submission.mime_type,
    submission.file_name || "receipt",
  );
  return buildVoucherFileName({
    date: ocr.date,
    amount: ocr.amount,
    isCreditCard: ocr.is_credit_card,
    extension,
  });
}

async function uploadToDriveIfNeeded({
  supabase,
  submission,
  customer,
  file,
  ocr,
}: {
  supabase: SupabaseClient<Database>;
  submission: SubmissionRow;
  customer: CustomerDriveSettings;
  file: File;
  ocr: ReceiptOcrResult;
}) {
  if (submission.drive_file_id) return submission.drive_file_id;
  if (!customer.drive_folder_id || !isGoogleDriveConfigured()) return null;

  const driveFileName = buildReceiptDriveFileName({ submission, ocr });

  const uploadedFile = await uploadFileToDrive({
    file,
    folderId: customer.drive_folder_id,
    fileName: driveFileName,
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
      ocr_payment_method: ocr.result.payment_method,
      ocr_is_credit_card: ocr.result.is_credit_card,
      ocr_updated_at: new Date().toISOString(),
    })
    .eq("id", submission.id);

  return ocr.result;
}

async function classifyAndFileNonReceiptIfNeeded({
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
  const rules = await getDocumentRules({
    supabase,
    customerId: submission.customer_account_id,
  });

  const outcome = await classifyDocumentWithGemini({
    file,
    mimeType: submission.mime_type,
    transactionNote: submission.transaction_note,
    rules,
  });

  if (outcome.status !== "completed") {
    await supabase
      .from("submissions")
      .update({
        document_classification_status: "failed",
        document_error: outcome.error,
        document_processed_at: new Date().toISOString(),
      })
      .eq("id", submission.id);
    await logActivity({
      supabase,
      eventType: "classification",
      status: "error",
      message: `${submission.file_name} の資料分類に失敗しました。${outcome.error ?? ""}`,
      customerAccountId: submission.customer_account_id,
      submissionId: submission.id,
      source: "upload_background",
    });
    return false;
  }

  const classification = outcome.result;
  const explicitMatchedRule = classification.matched_rule_id
    ? rules.find((rule) => rule.id === classification.matched_rule_id) ?? null
    : null;
  const inferredMatchedRule =
    !explicitMatchedRule && classification.confidence >= 0.85
      ? findRuleMentionedInReason({
          rules,
          reason: classification.reason,
        })
      : null;
  const matchedRule = explicitMatchedRule || inferredMatchedRule;
  const isMatchedDocument =
    classification.kind !== "receipt" &&
    matchedRule &&
    classification.confidence >= 0.6;
  const isReceipt = classification.kind === "receipt";
  const documentKind = isReceipt
    ? "receipt"
    : isMatchedDocument
      ? "matched_document"
      : "unmatched_document";

  await supabase
    .from("submissions")
    .update({
      document_classification_status: "completed",
      document_kind: documentKind,
      document_rule_id: isMatchedDocument ? matchedRule.id : null,
      document_confidence: classification.confidence,
      document_error: classification.reason,
      document_processed_at: new Date().toISOString(),
    })
    .eq("id", submission.id);

  if (isReceipt) return false;

  const folderId = isMatchedDocument
    ? matchedRule.drive_folder_id || customer.drive_folder_id
    : customer.irregular_drive_folder_id || customer.drive_folder_id;

  if (!folderId || !isGoogleDriveConfigured()) {
    await supabase
      .from("submissions")
      .update({
        ocr_status: "skipped",
        mf_status: "not_ready",
        document_error:
          "レシート以外の資料として分類されましたが、保存先Google Driveフォルダが未設定です。",
      })
      .eq("id", submission.id);
    await logActivity({
      supabase,
      eventType: "drive_upload",
      status: "error",
      message: `${submission.file_name} はレシート以外の資料と判定されましたが、保存先Driveフォルダが未設定のため保存できませんでした。`,
      customerAccountId: submission.customer_account_id,
      submissionId: submission.id,
      source: "upload_background",
    });
    return true;
  }

  const driveFileName = isMatchedDocument
    ? buildDocumentFileName({
        rule: matchedRule,
        documentDate: classification.document_date,
        submittedAt: submission.submitted_at,
        originalFileName: submission.file_name,
      })
    : sanitizeDriveFileName(submission.file_name);

  const uploadedFile = await uploadFileToDrive({
    file,
    folderId,
    fileName: driveFileName,
  });

  await supabase
    .from("submissions")
    .update({
      drive_file_id: uploadedFile.fileId,
      drive_view_url: uploadedFile.viewUrl,
      document_drive_file_name: driveFileName,
      ocr_status: "skipped",
      mf_status: "not_ready",
    })
    .eq("id", submission.id);

  await deleteStoredSource({
    supabase,
    submissionId: submission.id,
    storagePath: submission.source_storage_path,
  });

  return true;
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
    .select(submissionProcessingColumns)
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
    .select(submissionProcessingColumns)
    .eq("customer_account_id", customerId)
    .in("ocr_status", ["pending", "failed"])
    .not("source_storage_path", "is", null)
    .is("hidden_at", null)
    .order("submitted_at", { ascending: true })
    .limit(limit);

  if (error) throw error;

  let processed = 0;
  for (const submission of (submissions ?? []) as SubmissionRow[]) {
    try {
      const file = await downloadStoredFile({ supabase, submission });
      const customer = await getCustomerDriveSettings({
        supabase,
        customerId,
      });
      const filedAsDocument = await classifyAndFileNonReceiptIfNeeded({
        supabase,
        submission,
        customer,
        file,
      });
      if (filedAsDocument) {
        processed += 1;
        continue;
      }
      await runOcrForSubmission({ supabase, submission, file });
      processed += 1;
    } catch (error) {
      console.error("Failed to process OCR", error);
      await logActivity({
        supabase,
        eventType: "ocr",
        status: "error",
        message: `${submission.file_name} のOCR処理に失敗しました。${getErrorMessageForLog(error)}`,
        customerAccountId: customerId,
        submissionId: submission.id,
        source: "upload_background",
      });
    }
  }

  return processed;
}

export async function processSubmissionToMoneyForward({
  supabase,
  customerId,
  submissionId,
  source = null,
}: {
  supabase: SupabaseClient<Database>;
  customerId: string;
  submissionId: string;
  source?: ActivitySource | null;
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
    const hadExistingDriveFile = Boolean(submission.drive_file_id);

    driveFileId = await uploadToDriveIfNeeded({
      supabase,
      submission,
      customer,
      file,
      ocr,
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
      customerJournalPrompt: customer.journal_prompt,
    });

    // ドライブへのアップロードは一度成功すると再アップロードされないため、
    // 前回の失敗時にアップロード済みだったファイルは、今回の送信で
    // 使われた読み取り結果（証憑ファイル名と同じ内容）に合わせてリネームする。
    if (driveFileId && hadExistingDriveFile) {
      try {
        const driveFileName = buildReceiptDriveFileName({ submission, ocr });
        const renamedFile = await renameDriveFile({
          fileId: driveFileId,
          fileName: driveFileName,
        });
        driveFileId = renamedFile.fileId;
        await supabase
          .from("submissions")
          .update({
            drive_file_id: renamedFile.fileId,
            drive_view_url: renamedFile.viewUrl,
          })
          .eq("id", submission.id);
      } catch (renameError) {
        console.error("Failed to rename Drive file after retrying MF send", renameError);
        await logActivity({
          supabase,
          eventType: "drive_move",
          status: "error",
          message: `${submission.file_name} のドライブ上のファイル名更新に失敗しました。${getErrorMessageForLog(renameError)}`,
          customerAccountId: customerId,
          submissionId: submission.id,
          source,
        });
      }
    }

    try {
      await moveToPrimaryFolderIfPossible({
        supabase,
        submissionId: submission.id,
        driveFileId,
        primaryDriveFolderId: customer.drive_folder_id,
      });
    } catch (moveError) {
      console.error("Failed to move succeeded receipt back to primary folder", moveError);
      await logActivity({
        supabase,
        eventType: "drive_move",
        status: "error",
        message: `${submission.file_name} の通常フォルダへの移動に失敗しました。${getErrorMessageForLog(moveError)}`,
        customerAccountId: customerId,
        submissionId: submission.id,
        source,
      });
    }

    if (driveFileId) {
      await deleteStoredSource({
        supabase,
        submissionId: submission.id,
        storagePath: submission.source_storage_path,
      });
    }

    await logActivity({
      supabase,
      eventType: "mf_submit",
      status: "success",
      message: `${submission.file_name} をマネーフォワードへ送信しました。`,
      customerAccountId: customerId,
      submissionId: submission.id,
      source,
    });
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
      await logActivity({
        supabase,
        eventType: "drive_move",
        status: "error",
        message: `${submission.file_name} のエラーフォルダへの移動に失敗しました。${getErrorMessageForLog(moveError)}`,
        customerAccountId: customerId,
        submissionId: submission.id,
        source,
      });
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

    await logActivity({
      supabase,
      eventType: "mf_submit",
      status: "error",
      message: `${submission.file_name} のマネーフォワード送信に失敗しました。${getErrorMessageForLog(error)}`,
      customerAccountId: customerId,
      submissionId: submission.id,
      source,
    });

    throw error;
  }
}

export async function processCustomerPendingSubmissions({
  supabase,
  customerId,
  limit = 20,
  source = null,
}: {
  supabase: SupabaseClient<Database>;
  customerId: string;
  limit?: number;
  source?: ActivitySource | null;
}) {
  const { data: submissions, error } = await supabase
    .from("submissions")
    .select("id")
    .eq("customer_account_id", customerId)
    .neq("mf_status", "sent")
    .not("source_storage_path", "is", null)
    .is("hidden_at", null)
    .order("submitted_at", { ascending: true })
    .limit(limit);

  if (error) throw error;

  let processed = 0;
  const errors: string[] = [];
  for (const submission of submissions ?? []) {
    try {
      await processSubmissionToMoneyForward({
        supabase,
        customerId,
        submissionId: submission.id,
        source,
      });
      processed += 1;
    } catch (submissionError) {
      console.error("Failed to process pending submission", submissionError);
      errors.push(
        submissionError instanceof Error
          ? submissionError.message
          : "処理中にエラーが発生しました。",
      );
    }
  }

  return { processed, failed: errors.length, errors };
}
