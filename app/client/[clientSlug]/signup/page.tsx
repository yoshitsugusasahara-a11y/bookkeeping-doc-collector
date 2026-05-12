import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { ensureProfile, getCurrentUserOrRedirect } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { CustomerSignupForm } from "./customer-signup-form";

export default async function ClientSignupPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const { clientSlug } = await params;
  const supabase = await createClient();
  const user = await getCurrentUserOrRedirect(
    supabase,
    `/client/${clientSlug}`,
  );

  await ensureProfile(supabase, user);

  const { data: account } = await supabase
    .from("customer_accounts")
    .select("approval_status")
    .eq("user_id", user.id)
    .eq("client_slug", clientSlug)
    .maybeSingle();

  if (account?.approval_status === "approved") {
    redirect(`/client/${clientSlug}/upload`);
  }

  if (account) {
    redirect(`/client/${clientSlug}/pending`);
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <span className="auth-icon" aria-hidden="true">
          <ClipboardList size={30} />
        </span>
        <p className="eyebrow">Customer Signup</p>
        <h1>利用申請</h1>
        <p>
          初回利用のため、顧客名を登録してください。管理者が承認すると資料を送信できます。
        </p>
        <CustomerSignupForm
          clientSlug={clientSlug}
          email={user.email || ""}
        />
      </section>
    </main>
  );
}
