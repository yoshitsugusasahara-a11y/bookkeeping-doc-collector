"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserOrRedirect } from "@/lib/auth/profile";
import { processSubmissionToMoneyForward } from "@/lib/receipts/process-submissions";
import { createClient } from "@/lib/supabase/server";

export async function logoutClient(clientSlug: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/client/${clientSlug}`);
}

async function getApprovedClientAccount(clientSlug: string) {
  const supabase = await createClient();
  const user = await getCurrentUserOrRedirect(
    supabase,
    `/client/${clientSlug}`,
  );

  const { data: account } = await supabase
    .from("customer_accounts")
    .select("id, approval_status")
    .eq("user_id", user.id)
    .eq("client_slug", clientSlug)
    .maybeSingle();

  if (!account) {
    redirect(`/client/${clientSlug}/signup`);
  }

  if (account.approval_status !== "approved") {
    redirect(`/client/${clientSlug}/pending`);
  }

  return { supabase, account };
}

function parseAmount(value: FormDataEntryValue | null) {
  const text = String(value || "").replace(/[^\d-]/g, "");
  if (!text) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCreditCard(value: FormDataEntryValue | null) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export async function updateSubmissionOcr(clientSlug: string, formData: FormData) {
  const submissionId = String(formData.get("submissionId") || "");
  const ocrDate = String(formData.get("ocrDate") || "").trim() || null;
  const ocrAmount = parseAmount(formData.get("ocrAmount"));
  const ocrStore = String(formData.get("ocrStore") || "").trim() || null;
  const ocrSummary = String(formData.get("ocrSummary") || "").trim() || null;
  const ocrIsCreditCard = parseCreditCard(formData.get("ocrIsCreditCard"));

  if (!submissionId) return;

  const { supabase, account } = await getApprovedClientAccount(clientSlug);

  const { data: submission } = await supabase
    .from("submissions")
    .select("id, mf_status")
    .eq("id", submissionId)
    .eq("customer_account_id", account.id)
    .maybeSingle();

  if (!submission || submission.mf_status === "sent") {
    revalidatePath(`/client/${clientSlug}/submissions`);
    return;
  }

  await supabase
    .from("submissions")
    .update({
      ocr_status: "completed",
      ocr_error: null,
      ocr_date: ocrDate,
      ocr_amount: ocrAmount,
      ocr_store: ocrStore,
      ocr_summary: ocrSummary,
      ocr_is_credit_card: ocrIsCreditCard,
      mf_status: "not_sent",
      mf_error: null,
    })
    .eq("id", submissionId)
    .eq("customer_account_id", account.id);

  revalidatePath(`/client/${clientSlug}/submissions`);
}

export async function sendSubmissionToMoneyForward(
  clientSlug: string,
  formData: FormData,
) {
  const submissionId = String(formData.get("submissionId") || "");
  if (!submissionId) return;

  const { supabase, account } = await getApprovedClientAccount(clientSlug);

  await processSubmissionToMoneyForward({
    supabase,
    customerId: account.id,
    submissionId,
  });

  revalidatePath(`/client/${clientSlug}/submissions`);
  revalidatePath("/admin/customers");
}
