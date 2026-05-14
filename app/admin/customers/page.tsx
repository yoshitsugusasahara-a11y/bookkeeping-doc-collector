import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Search,
  ShieldCheck,
} from "lucide-react";
import { ensureProfile, getCurrentUserOrRedirect } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { approveCustomerAccount, logoutAdmin } from "./actions";
import { CustomerUrlBuilder, CustomerUrlTools } from "./customer-url-builder";

type CustomerRow = {
  id: string;
  user_id: string;
  customer_name: string;
  client_slug: string;
  approval_status: "pending" | "approved" | "rejected";
  drive_folder_id: string | null;
  drive_folder_name: string | null;
  created_at: string;
};

type MfConnectionRow = {
  customer_account_id: string;
  connected_at: string;
  expires_at: string | null;
};

function formatAdminDateTime(value?: string | null) {
  if (!value) return "未連携";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function AdminCustomersPage() {
  const supabase = await createClient();
  const user = await getCurrentUserOrRedirect(supabase, "/admin/login");

  try {
    await ensureProfile(supabase, user);
  } catch (profileError) {
    console.error("Failed to save admin profile", profileError);
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");

  if (adminError) {
    throw adminError;
  }

  if (!isAdmin) {
    return (
      <main className="auth-shell admin-auth">
        <section className="auth-panel">
          <span className="auth-icon error" aria-hidden="true">
            <ShieldCheck size={30} />
          </span>
          <p className="eyebrow">Admin Only</p>
          <h1>管理者権限が必要です</h1>
          <p>
            このGoogleアカウントはまだ管理者として登録されていません。
            Supabaseの`admin_users`にメールアドレスを登録してください。
          </p>
          <Link className="secondary-action" href="/">
            トップへ戻る
          </Link>
        </section>
      </main>
    );
  }

  const { data: customerRows } = await supabase
    .from("customer_accounts")
    .select(
      "id, user_id, customer_name, client_slug, approval_status, drive_folder_id, drive_folder_name, created_at",
    )
    .order("created_at", { ascending: false })
    .returns<CustomerRow[]>();
  const customers = customerRows ?? [];

  const userIds = customers.map((customer) => customer.user_id);
  const accountIds = customers.map((customer) => customer.id);

  const { data: profileRows } = userIds.length
    ? await supabase.from("profiles").select("id, email").in("id", userIds)
    : { data: [] };
  const profiles = profileRows ?? [];

  const { data: submissionRows } = accountIds.length
    ? await supabase
        .from("submissions")
        .select("customer_account_id")
        .in("customer_account_id", accountIds)
    : { data: [] };
  const submissions = submissionRows ?? [];

  const { data: mfConnectionRows } = accountIds.length
    ? await supabase
        .from("mf_connections")
        .select("customer_account_id, connected_at, expires_at")
        .in("customer_account_id", accountIds)
        .returns<MfConnectionRow[]>()
    : { data: [] };
  const mfConnections = mfConnectionRows ?? [];

  const emailByUserId = new Map(
    profiles.map((profile) => [profile.id, profile.email]),
  );
  const mfConnectionByAccountId = new Map(
    mfConnections.map((connection) => [
      connection.customer_account_id,
      connection,
    ]),
  );
  const submissionCountByAccountId = submissions.reduce(
    (counts, submission) => {
      const current = counts.get(submission.customer_account_id) || 0;
      counts.set(submission.customer_account_id, current + 1);
      return counts;
    },
    new Map<string, number>(),
  );

  const pendingCount = customers.filter(
    (customer) => customer.approval_status === "pending",
  ).length;
  const driveMissingCount = customers.filter(
    (customer) => !customer.drive_folder_id,
  ).length;
  const mfMissingCount = customers.filter(
    (customer) => !mfConnectionByAccountId.has(customer.id),
  ).length;
  const submissionTotal = submissions.length;
  const appBaseUrl =
    process.env.APP_BASE_URL || "https://bookkeeping-doc-collector.vercel.app";

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">管理者</p>
          <h1>資料回収管理</h1>
        </div>
        <div className="sidebar-summary">
          <strong>顧客管理</strong>
          <span>顧客URLの発行、承認、Drive設定、送信履歴をこの画面で管理します。</span>
        </div>
        <form action={logoutAdmin}>
          <button className="secondary-action sidebar-action" type="submit">
            ログアウト
          </button>
        </form>
      </aside>

      <section className="admin-content">
        <header className="admin-header">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h2>顧客アカウント</h2>
          </div>
          <label className="search-box">
            <Search size={18} />
            <input placeholder="顧客名・メールで検索" />
          </label>
        </header>

        <CustomerUrlBuilder baseUrl={appBaseUrl} />

        <section className="metric-grid" aria-label="集計">
          <div className="metric">
            <small>承認待ち</small>
            <strong>{pendingCount}</strong>
          </div>
          <div className="metric">
            <small>送信数</small>
            <strong>{submissionTotal}</strong>
          </div>
          <div className="metric">
            <small>MF未連携</small>
            <strong>{mfMissingCount}</strong>
          </div>
        </section>

        {driveMissingCount > 0 && (
          <section className="warning-banner">
            <AlertTriangle size={18} />
            <span>
              Drive未設定の顧客が{driveMissingCount}件あります。顧客詳細から保存先フォルダを設定してください。
            </span>
          </section>
        )}

        <section className="customer-table" id="customers">
          <div className="table-head">
            <span>顧客 / 専用URL</span>
            <span>状態</span>
            <span>MF連携</span>
            <span>Drive</span>
            <span>送信数</span>
            <span>操作</span>
          </div>
          {customers.length === 0 && (
            <div className="empty-state">顧客アカウントはまだありません。</div>
          )}
          {customers.map((customer) => {
            const isApproved = customer.approval_status === "approved";
            const statusLabel = isApproved ? "承認済み" : "承認待ち";
            const driveLabel = customer.drive_folder_id
              ? customer.drive_folder_name || "Drive設定済み"
              : "未設定";
            const mfConnection = mfConnectionByAccountId.get(customer.id);

            return (
              <article className="table-row" key={customer.id}>
                <div className="customer-cell">
                  <strong>{customer.customer_name}</strong>
                  <small>
                    {emailByUserId.get(customer.user_id) || "メール未取得"}
                  </small>
                  <CustomerUrlTools
                    baseUrl={appBaseUrl}
                    clientSlug={customer.client_slug}
                  />
                </div>
                <span
                  className={isApproved ? "pill approved" : "pill pending"}
                >
                  {statusLabel}
                </span>
                <span
                  className={mfConnection ? "mf-status connected" : "mf-status missing"}
                >
                  <strong>{mfConnection ? "連携済み" : "未連携"}</strong>
                  <small>{formatAdminDateTime(mfConnection?.connected_at)}</small>
                </span>
                <span
                  className={customer.drive_folder_id ? "muted" : "warning-text"}
                >
                  {driveLabel}
                </span>
                <strong>
                  {submissionCountByAccountId.get(customer.id) || 0}件
                </strong>
                <div className="row-actions">
                  {!isApproved && (
                    <form action={approveCustomerAccount}>
                      <input
                        type="hidden"
                        name="accountId"
                        value={customer.id}
                      />
                      <button className="small-button" type="submit">
                        <Check size={16} />
                        承認
                      </button>
                    </form>
                  )}
                  <Link
                    className="icon-button"
                    href={`/admin/customers/${customer.id}`}
                    aria-label="詳細を開く"
                  >
                    <ExternalLink size={18} />
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      </section>
    </main>
  );
}
