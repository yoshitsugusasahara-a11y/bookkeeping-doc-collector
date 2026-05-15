"use server";

import { revalidatePath } from "next/cache";
import { processCustomerPendingSubmissions } from "@/lib/receipts/process-submissions";
import { createClient } from "@/lib/supabase/server";

export type DriveSettingsState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function updateCustomerDriveSettings(
  _prevState: DriveSettingsState,
  formData: FormData,
): Promise<DriveSettingsState> {
  const customerId = String(formData.get("customerId") || "");
  const driveFolderId = String(formData.get("driveFolderId") || "").trim();
  const driveFolderName = String(formData.get("driveFolderName") || "").trim();
  const errorDriveFolderId = String(formData.get("errorDriveFolderId") || "").trim();
  const errorDriveFolderName = String(formData.get("errorDriveFolderName") || "").trim();

  if (!customerId) {
    return { status: "error", message: "顧客情報を取得できませんでした。" };
  }

  const supabase = await createClient();

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

export async function disconnectMoneyForward(formData: FormData) {
  const customerId = String(formData.get("customerId") || "");

  if (!customerId) {
    return;
  }

  const supabase = await createClient();

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

  const supabase = await createClient();
  const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");

  if (adminError || !isAdmin) {
    return;
  }

  await processCustomerPendingSubmissions({
    supabase,
    customerId,
  });

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
}
