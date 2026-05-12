"use server";

import { redirect } from "next/navigation";
import { ensureProfile, getCurrentUserOrRedirect } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

type SignupState = {
  message: string;
};

export async function registerCustomerAccount(
  clientSlug: string,
  _prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const customerName = String(formData.get("customerName") || "").trim();

  if (!customerName) {
    return { message: "顧客名を入力してください。" };
  }

  const supabase = await createClient();
  const user = await getCurrentUserOrRedirect(
    supabase,
    `/client/${clientSlug}`,
  );

  await ensureProfile(supabase, user);

  const { error } = await supabase.from("customer_accounts").insert({
    user_id: user.id,
    customer_name: customerName,
    client_slug: clientSlug,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        message:
          "この顧客専用URLはすでに登録されています。管理者に確認してください。",
      };
    }

    return {
      message: "登録できませんでした。時間をおいてもう一度お試しください。",
    };
  }

  redirect(`/client/${clientSlug}/pending`);
}
