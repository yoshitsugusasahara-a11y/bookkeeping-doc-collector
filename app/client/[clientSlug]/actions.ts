"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserOrRedirect } from "@/lib/auth/profile";
import { processSubmissionToMoneyForward } from "@/lib/receipts/process-submissions";
import { createClient } from "@/lib/supabase/server";

export type OcrUpdateState = {
  status: "idle" | "success" | "error" | "locked" | "conflict";
  message?: string;
  updatedAt?: number;
};

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

function parsePaymentMethod(value: FormDataEntryValue | null) {
  if (value === "credit_card") return "credit_card";
  if (value === "cashless") return "cashless";
  return "cash";
}

export async function updateSubmissionOcr(
  clientSlug: string,
  _prevState: OcrUpdateState,
  formData: FormData,
): Promise<OcrUpdateState> {
  const submissionId = String(formData.get("submissionId") || "");
  const ocrDate = String(formData.get("ocrDate") || "").trim() || null;
  const ocrAmount = parseAmount(formData.get("ocrAmount"));
  const ocrStore = String(formData.get("ocrStore") || "").trim() || null;
  const ocrSummary = String(formData.get("ocrSummary") || "").trim() || null;
  const ocrPaymentMethod = parsePaymentMethod(formData.get("ocrPaymentMethod"));
  const ocrUpdatedAtBefore =
    String(formData.get("ocrUpdatedAt") || "").trim() || null;

  if (!submissionId) {
    return {
      status: "error",
      message: "保存対象の資料を確認できませんでした。",
      updatedAt: Date.now(),
    };
  }

  const { supabase, account } = await getApprovedClientAccount(clientSlug);

  const { data: submission } = await supabase
    .from("submissions")
    .select("id, mf_status, ocr_updated_at")
    .eq("id", submissionId)
    .eq("customer_account_id", account.id)
    .maybeSingle();

  if (!submission || submission.mf_status === "sent") {
    revalidatePath(`/client/${clientSlug}/submissions`);
    return {
      status: "locked",
      message: "MF送信済みのため、OCR結果は変更できません。",
      updatedAt: Date.now(),
    };
  }

  if ((submission.ocr_updated_at || null) !== ocrUpdatedAtBefore) {
    revalidatePath(`/client/${clientSlug}/submissions`);
    return {
      status: "conflict",
      message:
        "編集中に他の変更がありました。最新の内容を確認してから再度編集してください。",
      updatedAt: Date.now(),
    };
  }

  const ocrUpdatedAtNow = new Date().toISOString();
  const { error } = await supabase
    .from("submissions")
    .update({
      ocr_status: "completed",
      ocr_error: null,
      ocr_date: ocrDate,
      ocr_amount: ocrAmount,
      ocr_store: ocrStore,
      ocr_summary: ocrSummary,
      ocr_payment_method: ocrPaymentMethod,
      ocr_is_credit_card: ocrPaymentMethod === "credit_card",
      ocr_updated_at: ocrUpdatedAtNow,
      mf_status: "not_sent",
      mf_error: null,
    })
    .eq("id", submissionId)
    .eq("customer_account_id", account.id);

  if (error) {
    console.error("Failed to update OCR result", error);
    revalidatePath(`/client/${clientSlug}/submissions`);
    return {
      status: "error",
      message: "OCR結果の保存に失敗しました。時間をおいて再度お試しください。",
      updatedAt: Date.now(),
    };
  }

  revalidatePath(`/client/${clientSlug}/submissions`);
  return {
    status: "success",
    message: "OCR結果を保存しました。",
    updatedAt: Date.now(),
  };
}

export async function sendSubmissionToMoneyForward(
  clientSlug: string,
  submissionId: string,
): Promise<{ status: "success" | "error"; message?: string }> {
  if (!submissionId) {
    return { status: "error", message: "対象の資料を確認できませんでした。" };
  }

  const { supabase, account } = await getApprovedClientAccount(clientSlug);

  try {
    await processSubmissionToMoneyForward({
      supabase,
      customerId: account.id,
      submissionId,
      source: "client_manual",
    });
    revalidatePath(`/client/${clientSlug}/submissions`);
    revalidatePath("/admin/customers");
    return { status: "success" };
  } catch (error) {
    console.error("Money Forward submission failed", error);
    revalidatePath(`/client/${clientSlug}/submissions`);
    revalidatePath("/admin/customers");
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "マネーフォワードへの送信に失敗しました。",
    };
  }
}

export async function hideSubmissionAsCustomer(
  clientSlug: string,
  submissionId: string,
) {
  if (!submissionId) return;

  const { supabase, account } = await getApprovedClientAccount(clientSlug);

  await supabase
    .from("submissions")
    .update({ hidden_at: new Date().toISOString() })
    .eq("id", submissionId)
    .eq("customer_account_id", account.id)
    .neq("mf_status", "sent");

  revalidatePath(`/client/${clientSlug}/submissions`);
  revalidatePath("/admin/customers");
}
