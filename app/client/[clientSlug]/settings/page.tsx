import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  History,
  LinkIcon,
  LogOut,
  Settings,
  TriangleAlert,
} from "lucide-react";
import { getCurrentUserOrRedirect } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { logoutClient } from "../actions";

function formatDateTime(value?: string | null) {
  if (!value) return "未取得";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function ClientSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string }>;
  searchParams: Promise<{ mf?: string }>;
}) {
  const { clientSlug } = await params;
  const { mf } = await searchParams;
  const supabase = await createClient();
  const user = await getCurrentUserOrRedirect(
    supabase,
    `/client/${clientSlug}`,
  );

  const { data: account } = await supabase
    .from("customer_accounts")
    .select("id, customer_name, approval_status")
    .eq("user_id", user.id)
    .eq("client_slug", clientSlug)
    .maybeSingle();

  if (!account) {
    redirect(`/client/${clientSlug}/signup`);
  }

  if (account.approval_status !== "approved") {
    redirect(`/client/${clientSlug}/pending`);
  }

  const { data: connection } = await supabase
    .from("mf_connections")
    .select("connected_at, expires_at, scope")
    .eq("customer_account_id", account.id)
    .maybeSingle();
  const isConnected = Boolean(connection);

  return (
    <main className="app-frame">
      <header className="topbar">
        <div>
          <p className="eyebrow">顧客画面</p>
          <h1>設定</h1>
        </div>
        <form action={logoutClient.bind(null, clientSlug)}>
          <button className="icon-button" type="submit" aria-label="ログアウト">
            <LogOut size={20} />
          </button>
        </form>
      </header>

      <nav className="mobile-tabs three-tabs" aria-label="顧客メニュー">
        <Link className="tab" href={`/client/${clientSlug}/upload`}>
          <Camera size={18} />
          <span>送信</span>
        </Link>
        <Link className="tab" href={`/client/${clientSlug}/submissions`}>
          <History size={18} />
          <span>履歴</span>
        </Link>
        <Link className="tab active" href={`/client/${clientSlug}/settings`}>
          <Settings size={18} />
          <span>設定</span>
        </Link>
      </nav>

      <section className="status-strip">
        <CheckCircle2 size={18} />
        <span>{account.customer_name} 様は承認済みです</span>
      </section>

      {mf === "connected" && (
        <section className="success-banner">
          <CheckCircle2 size={18} />
          <span>マネーフォワード連携が完了しました。</span>
        </section>
      )}
      {mf === "missing_config" && (
        <section className="warning-banner">
          <TriangleAlert size={18} />
          <span>マネーフォワード連携のシステム設定が未完了です。</span>
        </section>
      )}
      {mf === "error" && (
        <section className="warning-banner">
          <TriangleAlert size={18} />
          <span>マネーフォワード連携に失敗しました。時間をおいて再度お試しください。</span>
        </section>
      )}

      <section className="settings-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Money Forward</p>
            <h2>マネーフォワード連携</h2>
          </div>
          <span className={`pill ${isConnected ? "approved" : "pending"}`}>
            {isConnected ? "連携済み" : "未連携"}
          </span>
        </div>

        <p className="muted">
          領収書のOCR結果をもとに、次の段階でマネーフォワードへ仕訳を送信できるようにするための連携設定です。
        </p>

        {isConnected && (
          <dl className="connection-details">
            <div>
              <dt>連携日時</dt>
              <dd>{formatDateTime(connection?.connected_at)}</dd>
            </div>
            <div>
              <dt>有効期限</dt>
              <dd>{formatDateTime(connection?.expires_at)}</dd>
            </div>
          </dl>
        )}

        <a
          className="primary-action"
          href={`/api/moneyforward/start?clientSlug=${clientSlug}`}
        >
          <LinkIcon size={18} />
          {isConnected ? "マネーフォワードと再連携" : "マネーフォワードと連携"}
        </a>
      </section>
    </main>
  );
}
