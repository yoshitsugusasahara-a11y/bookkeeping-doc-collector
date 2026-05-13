"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function approveCustomerAccount(formData: FormData) {
  const accountId = String(formData.get("accountId") || "");

  if (!accountId) {
    return;
  }

  const supabase = await createClient();

  await supabase
    .from("customer_accounts")
    .update({
      approval_status: "approved",
      approved_at: new Date().toISOString(),
    })
    .eq("id", accountId);

  revalidatePath("/admin/customers");
}

export async function logoutAdmin() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
