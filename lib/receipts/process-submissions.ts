import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyDocumentWithGemini,
  type DocumentRuleForClassification,
} from "@/lib/gemini/document-classifier";
import {
  analyzeReceiptWithGemini,
  type ReceiptOcrResult,
  type TaxBreakdown,
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
  generateAndStoreMfJournalPreview,
  type MfJournalPreview,
} from "@/lib/moneyforward/journal-preview";
import {
  buildVoucherFileName,
  getExtensionFromMimeType,
} from "@/lib/moneyforward/client";
import { resolveSendMode } from "@/lib/receipts/send-mode";
import type { Database } from "@/lib/supabase/types";

const receiptUploadBucket = "receipt_uploads";
const submissionProcessingColumns =
  "id, customer_account_id, transaction_note, file_name, mime_type, source_storage_path, submitted_at, drive_file_id, drive_view_url, document_classification_status, document_kind, document_rule_id, document_confidence, document_error, document_drive_file_name, ocr_status, ocr_date, ocr_amount, ocr_store, ocr_summary, ocr_payment_method, ocr_is_credit_card, ocr_tax_rate_8_subtotal, ocr_tax_rate_10_subtotal, ocr_has_multiple_tax_rates, ocr_needs_tax_rate_review, ocr_has_multiple_account_candidates, ocr_account_review_reason, mf_journal_preview, mf_journal_preview_status, mf_status";

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
  ocr_tax_rate_8_subtotal?: number | null;
  ocr_tax_rate_10_subtotal?: number | null;
  ocr_has_multiple_tax_rates?: boolean;
  ocr_needs_tax_rate_review?: boolean;
  ocr_has_multiple_account_candidates?: boolean;
  ocr_account_review_reason?: string | null;
  mf_journal_preview?: MfJournalPreview | null;
  mf_journal_preview_status?: string;
  mf_status: string;
};

type CustomerDriveSettings = {
  id: string;
  drive_folder_id: string | null;
  error_drive_folder_id: string | null;
  irregular_drive_folder_id: string | null;
  journal_prompt: string | null;
  suspense_account_id: string | null;
  suspense_account_name: string | null;
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

  const taxBreakdown: TaxBreakdown[] = [];
  if (submission.ocr_tax_rate_8_subtotal != null) {
    taxBreakdown.push({ rate: 8, subtotal: submission.ocr_tax_rate_8_subtotal });
  }
  if (submission.ocr_tax_rate_10_subtotal != null) {
    taxBreakdown.push({ rate: 10, subtotal: submission.ocr_tax_rate_10_subtotal });
  }

  return {
    date: submission.ocr_date,
    amount: submission.ocr_amount,
    store: submission.ocr_store,
    summary: submission.ocr_summary,
    payment_method: submission.ocr_payment_method || "cash",
    is_credit_card: submission.ocr_is_credit_card,
    tax_breakdown: taxBreakdown.length > 0 ? taxBreakdown : null,
    has_multiple_tax_rates: submission.ocr_has_multiple_tax_rates ?? false,
    needs_tax_rate_review: submission.ocr_needs_tax_rate_review ?? false,
    has_multiple_account_candidates:
      submission.ocr_has_multiple_account_candidates ?? false,
    account_review_reason: submission.ocr_account_review_reason ?? null,
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
      "id, drive_folder_id, error_drive_folder_id, irregular_drive_folder_id, journal_prompt, suspense_account_id, suspense_account_name",
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
  customerJournalPrompt = null,
}: {
  supabase: SupabaseClient<Database>;
  submission: SubmissionRow;
  file: File;
  customerJournalPrompt?: string | null;
}) {
  const existingOcr = getCompletedOcr(submission);
  if (existingOcr) return existingOcr;

  const ocr = await analyzeReceiptWithGemini({
    file,
    mimeType: submission.mime_type,
    transactionNote: submission.transaction_note,
    customerJournalPrompt,
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
      ocr_tax_rate_8_subtotal: ocr.result.tax_breakdown?.find((b) => b.rate === 8)?.subtotal ?? null,
      ocr_tax_rate_10_subtotal: ocr.result.tax_breakdown?.find((b) => b.rate === 10)?.subtotal ?? null,
      ocr_has_multiple_tax_rates: ocr.result.has_multiple_tax_rates,
      ocr_needs_tax_rate_review: ocr.result.needs_tax_rate_review,
      ocr_has_multiple_account_candidates:
        ocr.result.has_multiple_account_candidates,
      ocr_account_review_reason: ocr.result.account_review_reason,
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
      const ocr = await runOcrForSubmission({
        supabase,
        submission,
        file,
        customerJournalPrompt: customer.journal_prompt,
      });

      // 予測仕訳はOCR直後に作って保存する。利用者が履歴画面で内容を確認し、
      // 承認したものがそのまま送信されるようにするため、送信時には作り直さない。
      // ここでの失敗はOCRの成功を打ち消さないよう、関数内で状態として記録される。
      await generateAndStoreMfJournalPreview({
        supabase,
        customerAccountId: customerId,
        submissionId: submission.id,
        submittedAt: submission.submitted_at,
        fileName: submission.file_name,
        mimeType: submission.mime_type,
        transactionNote: submission.transaction_note,
        ocr,
        customerJournalPrompt: customer.journal_prompt,
        suspenseAccountId: customer.suspense_account_id,
        suspenseAccountName: customer.suspense_account_name,
      });
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

  await processCustomerPendingJournalPreviews({ supabase, customerId });

  return processed;
}

/**
 * 予測仕訳が未生成・生成失敗のまま残っている資料を拾って作り直す。
 *
 * OCR結果が編集されると保存済みの予測仕訳は破棄されるが、そのとき
 * ocr_status は completed のままなので、OCR待ちを対象とする通常の
 * バックグラウンド処理では拾われない。この関数がその穴を埋める。
 */
export async function processCustomerPendingJournalPreviews({
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
    .select(submissionProcessingColumns)
    .eq("customer_account_id", customerId)
    .eq("ocr_status", "completed")
    .neq("mf_status", "sent")
    .in("mf_journal_preview_status", ["pending", "failed"])
    .is("hidden_at", null)
    .order("submitted_at", { ascending: true })
    .limit(limit);

  if (error) throw error;

  const rows = (submissions ?? []) as SubmissionRow[];
  if (rows.length === 0) return 0;

  const customer = await getCustomerDriveSettings({ supabase, customerId });

  let processed = 0;
  for (const submission of rows) {
    const ocr = getCompletedOcr(submission);
    if (!ocr) continue;

    await generateAndStoreMfJournalPreview({
      supabase,
      customerAccountId: customerId,
      submissionId: submission.id,
      submittedAt: submission.submitted_at,
      fileName: submission.file_name,
      mimeType: submission.mime_type,
      transactionNote: submission.transaction_note,
      ocr,
      customerJournalPrompt: customer.journal_prompt,
      suspenseAccountId: customer.suspense_account_id,
      suspenseAccountName: customer.suspense_account_name,
    });
    processed += 1;
  }

  return processed;
}

export async function forceSendJournalOnly({
  supabase,
  customerId,
  submissionId,
  source = null,
}: {
  supabase: SupabaseClient<Database>;
  customerId: string;
  submissionId: string;
  source?: ActivitySource | null;
}): Promise<{ status: "success" | "skipped" | "error"; message?: string }> {
  const customer = await getCustomerDriveSettings({ supabase, customerId });
  const submission = await getSubmissionForProcessing({
    supabase,
    submissionId,
    customerId,
  });

  if (submission.mf_status === "sent") {
    return { status: "skipped", message: "すでにMF送信済みです。" };
  }

  const ocr = getCompletedOcr(submission);
  if (!ocr) {
    return {
      status: "skipped",
      message: "OCR解析が完了していないため送信できません。",
    };
  }

  try {
    await submitReceiptToMoneyForward({
      supabase,
      customerAccountId: customerId,
      submissionId: submission.id,
      submittedAt: submission.submitted_at,
      mimeType: submission.mime_type,
      transactionNote: submission.transaction_note,
      ocr,
      customerJournalPrompt: customer.journal_prompt,
      suspenseAccountId: customer.suspense_account_id,
      suspenseAccountName: customer.suspense_account_name,
      storedPreview:
        submission.mf_journal_preview_status === "completed"
          ? submission.mf_journal_preview ?? null
          : null,
    });

    await logActivity({
      supabase,
      eventType: "mf_submit",
      status: "success",
      message: `${submission.file_name} を証憑ファイルなしで強制的にマネーフォワードへ送信しました。`,
      customerAccountId: customerId,
      submissionId: submission.id,
      source,
    });

    return { status: "success" };
  } catch (error) {
    console.error("Failed to force send journal without attachment", error);

    await supabase
      .from("submissions")
      .update({
        mf_status: "failed",
        mf_error:
          error instanceof Error
            ? error.message
            : "証憑なし送信中にエラーが発生しました。",
      })
      .eq("id", submission.id);

    await logActivity({
      supabase,
      eventType: "mf_submit",
      status: "error",
      message: `${submission.file_name} の証憑なし強制送信に失敗しました。${getErrorMessageForLog(error)}`,
      customerAccountId: customerId,
      submissionId: submission.id,
      source,
    });

    return {
      status: "error",
      message: error instanceof Error ? error.message : "送信に失敗しました。",
    };
  }
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
    const ocr = await runOcrForSubmission({
      supabase,
      submission,
      file,
      customerJournalPrompt: customer.journal_prompt,
    });
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
      suspenseAccountId: customer.suspense_account_id,
      suspenseAccountName: customer.suspense_account_name,
      storedPreview:
        submission.mf_journal_preview_status === "completed"
          ? submission.mf_journal_preview ?? null
          : null,
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
  // 自動送信の可否は顧客ごとの設定で決まる。既定（manual）では自動送信を行わず、
  // 利用者が資料ごとに送信を指示したときだけ送る。
  const { data: sendSettings, error: sendSettingsError } = await supabase
    .from("customer_accounts")
    .select("auto_send_enabled, skip_approval")
    .eq("id", customerId)
    .maybeSingle();

  if (sendSettingsError) throw sendSettingsError;

  const sendMode = resolveSendMode(sendSettings ?? {});
  if (sendMode === "manual") {
    return { processed: 0, failed: 0, errors: [], skippedByMode: true };
  }

  let submissionQuery = supabase
    .from("submissions")
    .select("id, approved_at")
    .eq("customer_account_id", customerId)
    .neq("mf_status", "sent")
    .not("source_storage_path", "is", null)
    .is("hidden_at", null);

  // 承認が必要なモードでは、承認済みの資料だけを自動送信の対象にする。
  if (sendMode === "approval") {
    submissionQuery = submissionQuery.not("approved_at", "is", null);
  }

  const { data: submissions, error } = await submissionQuery
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

  return { processed, failed: errors.length, errors, skippedByMode: false };
}
