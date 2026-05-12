import Link from "next/link";
import { Clock3, LogOut } from "lucide-react";
import { getCurrentUserOrRedirect } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export default async function ClientPendingPage({
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

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <span className="auth-icon" aria-hidden="true">
          <Clock3 size={30} />
        </span>
        <p className="eyebrow">Pending</p>
        <h1>承認待ちです</h1>
        <p>
          {account?.customer_name || "登録済みの顧客"} 様の利用申請を受け付けました。
          管理者が承認すると、資料送信画面を利用できます。
        </p>
        <Link className="secondary-action" href="/">
          <LogOut size={18} />
          トップへ戻る
        </Link>
      </section>
    </main>
  );
}
