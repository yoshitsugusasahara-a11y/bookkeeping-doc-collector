"use server";

import { revalidatePath } from "next/cache";
import { processCustomerPendingSubmissions } from "@/lib/receipts/process-submissions";
import {
  cleanupCustomerOldSubmissions,
  normalizeSubmissionRetentionLimit,
} from "@/lib/receipts/retention";
import { createClient } from "@/lib/supabase/server";

export type DriveSettingsState = {
  status: "idle" | "success" | "error";
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
    })
    .eq("id", customerId);

  if (error) {
    return { status: "error", message: "Drive設定を保存できませんでした。" };
  }

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
  return { status: "success", message: "Drive設定を保存しました。" };
}

export async function createDocumentRule(formData: FormData) {
  const customerId = String(formData.get("customerId") || "");
  const documentName = String(formData.get("documentName") || "").trim();
  const matchFeatures = String(formData.get("matchFeatures") || "").trim();
  const fileNameRule = String(formData.get("fileNameRule") || "").trim();
  const driveFolderId = String(formData.get("driveFolderId") || "").trim();
  const driveFolderName = String(formData.get("driveFolderName") || "").trim();

  if (!customerId || !documentName || !fileNameRule) {
    return;
  }

  const supabase = await ensureAdmin();
  if (!supabase) return;

  await supabase.from("document_rules").insert({
    customer_account_id: customerId,
    document_name: documentName,
    match_features: matchFeatures || null,
    file_name_rule: fileNameRule,
    drive_folder_id: driveFolderId || null,
    drive_folder_name: driveFolderName || null,
    is_active: true,
  });

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
    return { status: "error", message: "仕訳生成指示を保存できませんでした。" };
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
    return { status: "error", message: "資料保存上限を保存できませんでした。" };
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
    console.error("Failed to clean up old submissions", cleanupError);
    revalidatePath(`/admin/customers/${customerId}`);
    return {
      status: "error",
      message:
        "資料保存上限は保存しましたが、古い資料の整理に失敗しました。時間をおいて再度保存してください。",
    };
  }
}

export async function toggleDocumentRule(formData: FormData) {
  const customerId = String(formData.get("customerId") || "");
  const ruleId = String(formData.get("ruleId") || "");
  const isActive = String(formData.get("isActive") || "") === "true";

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

export async function deleteDocumentRule(formData: FormData) {
  const customerId = String(formData.get("customerId") || "");
  const ruleId = String(formData.get("ruleId") || "");

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

export async function disconnectMoneyForward(formData: FormData) {
  const customerId = String(formData.get("customerId") || "");

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

export async function runMoneyForwardSubmissionProcess(formData: FormData) {
  const customerId = String(formData.get("customerId") || "");

  if (!customerId) {
    return;
  }

  const supabase = await ensureAdmin();
  if (!supabase) return;

  await processCustomerPendingSubmissions({
    supabase,
    customerId,
  });

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
}
