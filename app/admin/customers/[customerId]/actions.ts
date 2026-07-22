"use server";

import { revalidatePath } from "next/cache";
import { processSubmissionToMoneyForward } from "@/lib/receipts/process-submissions";
import {
  cleanupCustomerOldSubmissions,
  normalizeSubmissionRetentionLimit,
} from "@/lib/receipts/retention";
import { createClient } from "@/lib/supabase/server";

export type DriveSettingsState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type OcrUpdateState = {
  status: "idle" | "success" | "error" | "locked" | "conflict";
  message: string;
};

export type JournalPromptState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type RetentionSettingsState = {
  status: "idle" | "success" | "error";
  message: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error);
}

async function ensureAdmin() {
  const supabase = await createClient();
  const { data: isAdmin, error } = await supabase.rpc("is_admin");

  if (error || !isAdmin) {
    return null;
  }

  return supabase;
}

export async function updateCustomerDriveSettings(
  _prevState: DriveSettingsState,
  formData: FormData,
): Promise<DriveSettingsState> {
  const customerId = String(formData.get("customerId") || "");
  const driveFolderId = String(formData.get("driveFolderId") || "").trim();
  const driveFolderName = String(formData.get("driveFolderName") || "").trim();
  const errorDriveFolderId = String(
    formData.get("errorDriveFolderId") || "",
  ).trim();
  const errorDriveFolderName = String(
    formData.get("errorDriveFolderName") || "",
  ).trim();
  const irregularDriveFolderId = String(
    formData.get("irregularDriveFolderId") || "",
  ).trim();
  const irregularDriveFolderName = String(
    formData.get("irregularDriveFolderName") || "",
  ).trim();

  if (!customerId) {
    return { status: "error", message: "顧客情報を取得できませんでした。" };
  }

  const supabase = await ensureAdmin();
  if (!supabase) {
    return { status: "error", message: "管理者権限を確認できませんでした。" };
  }

  const { error } = await supabase
    .from("customer_accounts")
    .update({
      drive_folder_id: driveFolderId || null,
      drive_folder_name: driveFolderName || null,
      error_drive_folder_id: errorDriveFolderId || null,
      error_drive_folder_name: errorDriveFolderName || null,
      irregular_drive_folder_id: irregularDriveFolderId || null,
      irregular_drive_folder_name: irregularDriveFolderName || null,
    })
    .eq("id", customerId);

  if (error) {
    return {
      status: "error",
      message: `Drive設定を保存できませんでした。${getErrorMessage(error)}`,
    };
  }

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
  return { status: "success", message: "Drive設定を保存しました。" };
}

export type DocumentRuleState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function createDocumentRule(
  formData: FormData,
): Promise<DocumentRuleState> {
  const customerId = String(formData.get("customerId") || "");
  const documentName = String(formData.get("documentName") || "").trim();
  const matchFeatures = String(formData.get("matchFeatures") || "").trim();
  const fileNameRule = String(formData.get("fileNameRule") || "").trim();
  const driveFolderId = String(formData.get("driveFolderId") || "").trim();
  const driveFolderName = String(formData.get("driveFolderName") || "").trim();

  if (!customerId || !documentName || !fileNameRule) {
    return {
      status: "error",
      message: "資料名とファイル名ルールを入力してください。",
    };
  }

  const supabase = await ensureAdmin();
  if (!supabase) {
    return { status: "error", message: "管理者権限を確認できませんでした。" };
  }

  const { error } = await supabase.from("document_rules").insert({
    customer_account_id: customerId,
    document_name: documentName,
    match_features: matchFeatures || null,
    file_name_rule: fileNameRule,
    drive_folder_id: driveFolderId || null,
    drive_folder_name: driveFolderName || null,
    is_active: true,
  });

  if (error) {
    return {
      status: "error",
      message: `資料分類ルールを保存できませんでした。${getErrorMessage(error)}`,
    };
  }

  revalidatePath(`/admin/customers/${customerId}`);
  return { status: "success", message: "資料分類ルールを追加しました。" };
}

export async function toggleDocumentRuleActive(
  customerId: string,
  ruleId: string,
  isActive: boolean,
) {
  if (!customerId || !ruleId) return;

  const supabase = await ensureAdmin();
  if (!supabase) return;

  await supabase
    .from("document_rules")
    .update({ is_active: !isActive })
    .eq("id", ruleId)
    .eq("customer_account_id", customerId);

  revalidatePath(`/admin/customers/${customerId}`);
}

export async function deleteDocumentRuleById(customerId: string, ruleId: string) {
  if (!customerId || !ruleId) return;

  const supabase = await ensureAdmin();
  if (!supabase) return;

  await supabase
    .from("document_rules")
    .delete()
    .eq("id", ruleId)
    .eq("customer_account_id", customerId);

  revalidatePath(`/admin/customers/${customerId}`);
}

export async function updateCustomerJournalPrompt(
  _prevState: JournalPromptState,
  formData: FormData,
): Promise<JournalPromptState> {
  const customerId = String(formData.get("customerId") || "");
  const journalPrompt = String(formData.get("journalPrompt") || "").trim();

  if (!customerId) {
    return { status: "error", message: "顧客情報を取得できませんでした。" };
  }

  const supabase = await ensureAdmin();
  if (!supabase) {
    return { status: "error", message: "管理者権限を確認できませんでした。" };
  }

  const { error } = await supabase
    .from("customer_accounts")
    .update({
      journal_prompt: journalPrompt || null,
    })
    .eq("id", customerId);

  if (error) {
    return {
      status: "error",
      message: `仕訳生成指示を保存できませんでした。${getErrorMessage(error)}`,
    };
  }

  revalidatePath(`/admin/customers/${customerId}`);
  return { status: "success", message: "仕訳生成指示を保存しました。" };
}

export async function updateCustomerRetentionSettings(
  _prevState: RetentionSettingsState,
  formData: FormData,
): Promise<RetentionSettingsState> {
  const customerId = String(formData.get("customerId") || "");
  const retentionLimit = normalizeSubmissionRetentionLimit(
    formData.get("submissionRetentionLimit"),
  );

  if (!customerId) {
    return { status: "error", message: "顧客情報を取得できませんでした。" };
  }

  const supabase = await ensureAdmin();
  if (!supabase) {
    return { status: "error", message: "管理者権限を確認できませんでした。" };
  }

  const { error } = await supabase
    .from("customer_accounts")
    .update({
      submission_retention_limit: retentionLimit,
    })
    .eq("id", customerId);

  if (error) {
    return {
      status: "error",
      message: `資料保存上限を保存できませんでした。${getErrorMessage(error)}`,
    };
  }

  try {
    const deletedCount = await cleanupCustomerOldSubmissions({
      supabase,
      customerId,
      limit: retentionLimit,
    });

    revalidatePath(`/admin/customers/${customerId}`);
    revalidatePath("/admin/customers");
    return {
      status: "success",
      message:
        deletedCount > 0
          ? `資料保存上限を保存し、古い資料を${deletedCount}件削除しました。`
          : "資料保存上限を保存しました。",
    };
  } catch (cleanupError) {
    const cleanupMessage = getErrorMessage(cleanupError);
    console.error("Failed to clean up old submissions", cleanupError);
    revalidatePath(`/admin/customers/${customerId}`);
    return {
      status: "error",
      message: `資料保存上限は保存しましたが、古い資料の整理に失敗しました。原因: ${cleanupMessage}`,
    };
  }
}


export async function disconnectMoneyForward(customerId: string) {
  if (!customerId) {
    return;
  }

  const supabase = await ensureAdmin();
  if (!supabase) return;

  await supabase
    .from("mf_connections")
    .delete()
    .eq("customer_account_id", customerId);

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
}

export type PendingMfSubmission = {
  id: string;
  fileName: string;
};

export type PendingMfSubmissionsResult =
  | { status: "ok"; submissions: PendingMfSubmission[] }
  | { status: "error"; message: string };

export async function listPendingMfSubmissions(
  customerId: string,
): Promise<PendingMfSubmissionsResult> {
  if (!customerId) {
    return { status: "error", message: "顧客情報を取得できませんでした。" };
  }

  const supabase = await ensureAdmin();
  if (!supabase) {
    return { status: "error", message: "管理者権限を確認できませんでした。" };
  }

  const { data, error } = await supabase
    .from("submissions")
    .select("id, file_name")
    .eq("customer_account_id", customerId)
    .neq("mf_status", "sent")
    .not("source_storage_path", "is", null)
    .is("hidden_at", null)
    .order("submitted_at", { ascending: true })
    .limit(100);

  if (error) {
    return {
      status: "error",
      message: `処理対象の取得に失敗しました。${error.message}`,
    };
  }

  return {
    status: "ok",
    submissions: (data ?? []).map((row) => ({
      id: row.id,
      fileName: row.file_name,
    })),
  };
}

export async function processSingleMfSubmission(
  customerId: string,
  submissionId: string,
): Promise<{ status: "success" | "error"; message: string }> {
  if (!customerId || !submissionId) {
    return { status: "error", message: "処理対象を特定できませんでした。" };
  }

  const supabase = await ensureAdmin();
  if (!supabase) {
    return { status: "error", message: "管理者権限を確認できませんでした。" };
  }

  try {
    await processSubmissionToMoneyForward({
      supabase,
      customerId,
      submissionId,
      source: "admin_manual",
    });
    return { status: "success", message: "送信しました。" };
  } catch (error) {
    return { status: "error", message: getErrorMessage(error) };
  }
}

export async function hideSubmission(customerId: string, submissionId: string) {
  if (!customerId || !submissionId) return;

  const supabase = await ensureAdmin();
  if (!supabase) return;

  await supabase
    .from("submissions")
    .update({ hidden_at: new Date().toISOString() })
    .eq("id", submissionId)
    .eq("customer_account_id", customerId)
    .neq("mf_status", "sent");

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath(`/admin/customers/${customerId}/trash`);
}

export async function restoreSubmission(
  customerId: string,
  submissionId: string,
) {
  if (!customerId || !submissionId) return;

  const supabase = await ensureAdmin();
  if (!supabase) return;

  await supabase
    .from("submissions")
    .update({ hidden_at: null })
    .eq("id", submissionId)
    .eq("customer_account_id", customerId);

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath(`/admin/customers/${customerId}/trash`);
}

function parseOcrAmount(value: string) {
  const text = value.replace(/[^\d-]/g, "");
  if (!text) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOcrPaymentMethod(value: string) {
  if (value === "credit_card") return "credit_card";
  if (value === "cashless") return "cashless";
  return "cash";
}

export async function updateSubmissionOcrAsAdmin(
  customerId: string,
  submissionId: string,
  values: {
    ocrDate: string;
    ocrAmount: string;
    ocrStore: string;
    ocrSummary: string;
    ocrPaymentMethod: string;
    ocrUpdatedAt: string | null;
  },
): Promise<OcrUpdateState> {
  if (!customerId || !submissionId) {
    return { status: "error", message: "保存対象の資料を確認できませんでした。" };
  }

  const supabase = await ensureAdmin();
  if (!supabase) {
    return { status: "error", message: "管理者権限を確認できませんでした。" };
  }

  const { data: submission } = await supabase
    .from("submissions")
    .select("id, mf_status, ocr_updated_at")
    .eq("id", submissionId)
    .eq("customer_account_id", customerId)
    .maybeSingle();

  if (!submission || submission.mf_status === "sent") {
    revalidatePath(`/admin/customers/${customerId}`);
    return {
      status: "locked",
      message: "MF送信済みのため、OCR結果は変更できません。",
    };
  }

  if ((submission.ocr_updated_at || null) !== (values.ocrUpdatedAt || null)) {
    revalidatePath(`/admin/customers/${customerId}`);
    return {
      status: "conflict",
      message:
        "編集中に他の変更がありました。最新の内容を確認してから再度編集してください。",
    };
  }

  const ocrPaymentMethod = parseOcrPaymentMethod(values.ocrPaymentMethod);
  const { error } = await supabase
    .from("submissions")
    .update({
      ocr_status: "completed",
      ocr_error: null,
      ocr_date: values.ocrDate.trim() || null,
      ocr_amount: parseOcrAmount(values.ocrAmount),
      ocr_store: values.ocrStore.trim() || null,
      ocr_summary: values.ocrSummary.trim() || null,
      ocr_payment_method: ocrPaymentMethod,
      ocr_is_credit_card: ocrPaymentMethod === "credit_card",
      ocr_updated_at: new Date().toISOString(),
      mf_status: "not_sent",
      mf_error: null,
    })
    .eq("id", submissionId)
    .eq("customer_account_id", customerId);

  if (error) {
    console.error("Failed to update OCR result as admin", error);
    return {
      status: "error",
      message: "OCR結果の保存に失敗しました。時間をおいて再度お試しください。",
    };
  }

  revalidatePath(`/admin/customers/${customerId}`);
  return { status: "success", message: "OCR結果を保存しました。" };
}
