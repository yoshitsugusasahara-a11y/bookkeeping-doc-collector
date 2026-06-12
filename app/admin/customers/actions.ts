"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

const receiptUploadBucket = "receipt_uploads";

async function ensureAdmin() {
  const supabase = await createClient();
  const { data: isAdmin, error } = await supabase.rpc("is_admin");

  if (error || !isAdmin) {
    return null;
  }

  return supabase;
}

async function removeStorageFiles({
  supabase,
  paths,
}: {
  supabase: SupabaseClient<Database>;
  paths: string[];
}) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));

  for (let index = 0; index < uniquePaths.length; index += 100) {
    const chunk = uniquePaths.slice(index, index + 100);
    const { error } = await supabase.storage
      .from(receiptUploadBucket)
      .remove(chunk);

    if (error) {
      console.error("Failed to remove customer storage files", error);
    }
  }
}

export async function approveCustomerAccount(formData: FormData) {
  const accountId = String(formData.get("accountId") || "");

  if (!accountId) {
    return;
  }

  const supabase = await ensureAdmin();
  if (!supabase) return;

  await supabase
    .from("customer_accounts")
    .update({
      approval_status: "approved",
      approved_at: new Date().toISOString(),
    })
    .eq("id", accountId);

  revalidatePath("/admin/customers");
}

export async function suspendCustomerAccount(formData: FormData) {
  const accountId = String(formData.get("accountId") || "");

  if (!accountId) return;

  const supabase = await ensureAdmin();
  if (!supabase) return;

  await supabase
    .from("customer_accounts")
    .update({ approval_status: "suspended" })
    .eq("id", accountId);

  await supabase
    .from("mf_connections")
    .delete()
    .eq("customer_account_id", accountId);

  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${accountId}`);
}

export async function resumeCustomerAccount(formData: FormData) {
  const accountId = String(formData.get("accountId") || "");

  if (!accountId) return;

  const supabase = await ensureAdmin();
  if (!supabase) return;

  await supabase
    .from("customer_accounts")
    .update({
      approval_status: "approved",
      approved_at: new Date().toISOString(),
    })
    .eq("id", accountId);

  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${accountId}`);
}

export async function deleteCustomerAccount(formData: FormData) {
  const accountId = String(formData.get("accountId") || "");
  const confirmed = String(formData.get("confirmDelete") || "") === "true";

  if (!accountId || !confirmed) return;

  const supabase = await ensureAdmin();
  if (!supabase) return;

  const { data: customer } = await supabase
    .from("customer_accounts")
    .select("id")
    .eq("id", accountId)
    .maybeSingle();

  if (!customer) {
    revalidatePath("/admin/customers");
    redirect("/admin/customers");
  }

  const { data: sourceRows } = await supabase
    .from("submissions")
    .select("source_storage_path")
    .eq("customer_account_id", accountId)
    .not("source_storage_path", "is", null);

  await removeStorageFiles({
    supabase,
    paths:
      sourceRows
        ?.map((row) => row.source_storage_path)
        .filter((path): path is string => Boolean(path)) ?? [],
  });

  await supabase
    .from("customer_accounts")
    .delete()
    .eq("id", accountId);

  revalidatePath("/admin/customers");
  redirect("/admin/customers");
}

export async function logoutAdmin() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
