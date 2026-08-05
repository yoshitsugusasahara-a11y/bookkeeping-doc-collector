"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getCurrentUserOrRedirect } from "@/lib/auth/profile";
import { buildClearedMfJournalPreviewFields } from "@/lib/moneyforward/journal-preview";
import {
  processCustomerPendingJournalPreviews,
  processSubmissionToMoneyForward,
} from "@/lib/receipts/process-submissions";
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

  return { supabase, account, user };
}

/**
 * 自動送信のON/OFF。承認は引き続き必要なので、管理者が代理で設定してもよい。
 */
export async function updateAutoSendEnabled(
  clientSlug: string,
  enabled: boolean,
): Promise<{ status: "success" | "error"; message?: string }> {
  const { supabase, account } = await getApprovedClientAccount(clientSlug);

  const { error } = await supabase
    .from("customer_accounts")
    .update(
      enabled
        ? { auto_send_enabled: true }
        : // 自動送信を止めるときは、承認スキップの同意も併せて解除する。
          // 再度自動送信を有効にした際に、同意なしでスキップが復活しないようにするため。
          {
            auto_send_enabled: false,
            skip_approval: false,
            skip_approval_consented_at: null,
            skip_approval_consented_by: null,
          },
    )
    .eq("id", account.id);

  if (error) {
    console.error("Failed to update auto send setting", error);
    return { status: "error", message: "設定を保存できませんでした。" };
  }

  revalidatePath(`/client/${clientSlug}/settings`);
  revalidatePath(`/client/${clientSlug}/submissions`);
  return { status: "success" };
}

/**
 * 承認のスキップ。利用者本人がMF上で修正することを引き受ける選択なので、
 * 顧客画面からのみ設定でき、同意した本人と日時を記録する。
 */
export async function updateSkipApproval(
  clientSlug: string,
  skip: boolean,
): Promise<{ status: "success" | "error"; message?: string }> {
  const { supabase, account, user } = await getApprovedClientAccount(clientSlug);

  const { data: current } = await supabase
    .from("customer_accounts")
    .select("auto_send_enabled")
    .eq("id", account.id)
    .maybeSingle();

  if (skip && !current?.auto_send_enabled) {
    return {
      status: "error",
      message: "先に自動送信を有効にしてください。",
    };
  }

  const { error } = await supabase
    .from("customer_accounts")
    .update(
      skip
        ? {
            skip_approval: true,
            skip_approval_consented_at: new Date().toISOString(),
            skip_approval_consented_by: user.id,
          }
        : {
            skip_approval: false,
            skip_approval_consented_at: null,
            skip_approval_consented_by: null,
          },
    )
    .eq("id", account.id);

  if (error) {
    console.error("Failed to update skip approval setting", error);
    return { status: "error", message: "設定を保存できませんでした。" };
  }

  revalidatePath(`/client/${clientSlug}/settings`);
  revalidatePath(`/client/${clientSlug}/submissions`);
  return { status: "success" };
}

function parseAmount(value: FormDataEntryValue | null) {
  const text = String(value || "").replace(/[^\d-]/g, "");
  if (!text) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTaxRateSubtotal(value: FormDataEntryValue | null) {
  const parsed = parseAmount(value);
  return parsed !== null && parsed > 0 ? parsed : null;
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
  const ocrTaxRate8Subtotal = parseTaxRateSubtotal(
    formData.get("ocrTaxRate8Subtotal"),
  );
  const ocrTaxRate10Subtotal = parseTaxRateSubtotal(
    formData.get("ocrTaxRate10Subtotal"),
  );
  const ocrHasMultipleAccountCandidates =
    formData.get("ocrHasMultipleAccountCandidates") !== null;
  const previousAccountReviewReason =
    String(formData.get("ocrAccountReviewReason") || "").trim() || null;
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
      ocr_tax_rate_8_subtotal: ocrTaxRate8Subtotal,
      ocr_tax_rate_10_subtotal: ocrTaxRate10Subtotal,
      ocr_has_multiple_tax_rates:
        ocrTaxRate8Subtotal !== null && ocrTaxRate10Subtotal !== null,
      ocr_needs_tax_rate_review: false,
      ocr_has_multiple_account_candidates: ocrHasMultipleAccountCandidates,
      ocr_account_review_reason: ocrHasMultipleAccountCandidates
        ? previousAccountReviewReason ?? "手動で指定"
        : null,
      ocr_updated_at: ocrUpdatedAtNow,
      mf_status: "not_sent",
      mf_error: null,
      // 読み取り結果が変わると予測仕訳も変わるため、保存済みのものを破棄する。
      // 次のバックグラウンド処理または送信時に作り直される。
      ...buildClearedMfJournalPreviewFields(),
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

  // 破棄した予測仕訳を、修正後の読み取り結果で作り直す。
  after(async () => {
    try {
      await processCustomerPendingJournalPreviews({
        supabase,
        customerId: account.id,
      });
    } catch (previewError) {
      console.error("Failed to rebuild journal preview", previewError);
    }
  });

  return {
    status: "success",
    message: "OCR結果を保存しました。",
    updatedAt: Date.now(),
  };
}

/**
 * 資料を承認する（自動送信＋承認モードでの送信対象にする）。
 * 誰がいつ承認したかを記録し、送信済みの仕訳の根拠として残す。
 */
export async function setSubmissionApproval(
  clientSlug: string,
  submissionIds: string[],
  approved: boolean,
): Promise<{ status: "success" | "error"; message?: string; count?: number }> {
  const targetIds = submissionIds.filter(Boolean);
  if (targetIds.length === 0) {
    return { status: "error", message: "対象の資料を確認できませんでした。" };
  }

  const { supabase, account, user } = await getApprovedClientAccount(clientSlug);

  const { data, error } = await supabase
    .from("submissions")
    .update(
      approved
        ? {
            approved_at: new Date().toISOString(),
            approved_by_user_id: user.id,
          }
        : { approved_at: null, approved_by_user_id: null },
    )
    .in("id", targetIds)
    .eq("customer_account_id", account.id)
    .neq("mf_status", "sent")
    .select("id");

  if (error) {
    console.error("Failed to update submission approval", error);
    return {
      status: "error",
      message: "承認状態を保存できませんでした。時間をおいて再度お試しください。",
    };
  }

  revalidatePath(`/client/${clientSlug}/submissions`);
  return { status: "success", count: data?.length ?? 0 };
}

export async function sendSubmissionToMoneyForward(
  clientSlug: string,
  submissionId: string,
): Promise<{ status: "success" | "error"; message?: string }> {
  if (!submissionId) {
    return { status: "error", message: "対象の資料を確認できませんでした。" };
  }

  const { supabase, account, user } = await getApprovedClientAccount(clientSlug);

  try {
    // 送信ボタンを押す行為そのものが承認にあたるため、送信前に記録しておく。
    // 送信が失敗しても、利用者が内容を承認した事実は残る。
    await supabase
      .from("submissions")
      .update({
        approved_at: new Date().toISOString(),
        approved_by_user_id: user.id,
      })
      .eq("id", submissionId)
      .eq("customer_account_id", account.id)
      .is("approved_at", null);

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
