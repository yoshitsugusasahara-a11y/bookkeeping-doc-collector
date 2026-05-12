import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function getCurrentUserOrRedirect(
  supabase: SupabaseServerClient,
  redirectTo: string,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(redirectTo);
  }

  return user;
}

export async function ensureProfile(
  supabase: SupabaseServerClient,
  user: User,
) {
  const email = user.email;

  if (!email) {
    throw new Error("Googleアカウントのメールアドレスを取得できませんでした。");
  }

  const displayName =
    typeof user.user_metadata.name === "string"
      ? user.user_metadata.name
      : typeof user.user_metadata.full_name === "string"
        ? user.user_metadata.full_name
        : null;

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    email,
    display_name: displayName,
  });

  if (error) {
    throw error;
  }
}
