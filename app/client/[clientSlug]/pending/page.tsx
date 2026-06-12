import Link from "next/link";
import { Ban, Clock3, RefreshCw } from "lucide-react";
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

  const isSuspended = account?.approval_status === "suspended";

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <span className={isSuspended ? "auth-icon error" : "auth-icon"} aria-hidden="true">
          {isSuspended ? <Ban size={30} /> : <Clock3 size={30} />}
        </span>
        <p className="eyebrow">{isSuspended ? "Suspended" : "Pending"}</p>
        <h1>{isSuspended ? "利用停止中です" : "承認待ちです"}</h1>
        <p>
          {isSuspended
            ? `${account?.customer_name || "この顧客アカウント"} は現在利用停止中です。必要な場合は管理者へお問い合わせください。`
            : `${account?.customer_name || "登録済みの顧客"} 様の利用申請を受け付けました。管理者が承認すると、この顧客専用URLから資料送信画面を利用できます。`}
        </p>
        <Link className="secondary-action" href={`/client/${clientSlug}`}>
          <RefreshCw size={18} />
          {isSuspended ? "ログイン画面へ戻る" : "承認状況を確認する"}
        </Link>
      </section>
    </main>
  );
}
