import Link from "next/link";
import { redirect } from "next/navigation";
import { Camera, CheckCircle2, History, LogOut, Settings } from "lucide-react";
import { getCurrentUserOrRedirect } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { logoutClient } from "../actions";
import { SubmissionForm } from "./submission-form";

export default async function ClientUploadPage({
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

  const { data: account } = await supabase
    .from("customer_accounts")
    .select("customer_name, approval_status")
    .eq("user_id", user.id)
    .eq("client_slug", clientSlug)
    .maybeSingle();

  if (!account) {
    redirect(`/client/${clientSlug}/signup`);
  }

  if (account.approval_status !== "approved") {
    redirect(`/client/${clientSlug}/pending`);
  }

  return (
    <main className="app-frame">
      <header className="topbar">
        <div>
          <p className="eyebrow">顧客画面</p>
          <h1>証憑を送信</h1>
        </div>
        <form action={logoutClient.bind(null, clientSlug)}>
          <button className="icon-button" type="submit" aria-label="ログアウト">
            <LogOut size={20} />
          </button>
        </form>
      </header>

      <nav className="mobile-tabs three-tabs" aria-label="顧客メニュー">
        <Link className="tab active" href={`/client/${clientSlug}/upload`}>
          <Camera size={18} />
          <span>送信</span>
        </Link>
        <Link className="tab" href={`/client/${clientSlug}/submissions`}>
          <History size={18} />
          <span>履歴</span>
        </Link>
        <Link className="tab" href={`/client/${clientSlug}/settings`}>
          <Settings size={18} />
          <span>設定</span>
        </Link>
      </nav>

      <section className="status-strip">
        <CheckCircle2 size={18} />
        <span>{account.customer_name} 様は承認済みです</span>
      </section>

      <SubmissionForm clientSlug={clientSlug} />
    </main>
  );
}
