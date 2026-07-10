import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { ensureProfile, getCurrentUserOrRedirect } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

const logFetchLimit = 200;

type ActivityLogRow = {
  id: string;
  created_at: string;
  customer_account_id: string | null;
  submission_id: string | null;
  event_type: string;
  status: string;
  message: string;
  source: string | null;
};

function formatLogDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

function getEventTypeLabel(eventType: string) {
  if (eventType === "ocr") return "OCR解析";
  if (eventType === "classification") return "資料分類";
  if (eventType === "drive_upload") return "Drive保存";
  if (eventType === "drive_move") return "Drive移動";
  if (eventType === "mf_submit") return "MF送信";
  if (eventType === "cron_run") return "Cron実行";
  return eventType;
}

function getSourceLabel(source: string | null) {
  if (source === "cron") return "Cron";
  if (source === "admin_manual") return "管理者手動";
  if (source === "client_manual") return "顧客ボタン";
  if (source === "upload_background") return "アップロード後処理";
  return "—";
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const errorsOnly = status === "error";
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
          <p>この画面を表示するには管理者登録が必要です。</p>
          <Link className="secondary-action" href="/">
            トップへ戻る
          </Link>
        </section>
      </main>
    );
  }

  let logQuery = supabase
    .from("activity_logs")
    .select(
      "id, created_at, customer_account_id, submission_id, event_type, status, message, source",
    )
    .order("created_at", { ascending: false })
    .limit(logFetchLimit);

  if (errorsOnly) {
    logQuery = logQuery.eq("status", "error");
  }

  const { data: logRows, error: logError } = await logQuery;
  const logs = (logRows ?? []) as ActivityLogRow[];

  const customerIds = Array.from(
    new Set(
      logs
        .map((log) => log.customer_account_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const { data: customerRows } = customerIds.length
    ? await supabase
        .from("customer_accounts")
        .select("id, customer_name")
        .in("id", customerIds)
    : { data: [] };
  const customerNameById = new Map(
    (customerRows ?? []).map((customer) => [customer.id, customer.customer_name]),
  );

  return (
    <main className="admin-detail-shell">
      <header className="detail-header">
        <Link className="text-link" href="/admin/customers">
          <ArrowLeft size={16} />
          顧客一覧へ戻る
        </Link>
        <div>
          <p className="eyebrow">Activity Logs</p>
          <h1>実行ログ</h1>
          <p className="muted">
            OCR・資料分類・Drive保存・MF送信・Cron実行の結果を表示します（直近
            {logFetchLimit}件・30日で自動削除）。
          </p>
        </div>
      </header>

      <section className="settings-panel" aria-label="ログの絞り込み">
        <div className="account-control-actions">
          <Link
            className={errorsOnly ? "secondary-action" : "primary-action"}
            href="/admin/logs"
          >
            すべて表示
          </Link>
          <Link
            className={errorsOnly ? "primary-action" : "secondary-action"}
            href="/admin/logs?status=error"
          >
            エラーのみ表示
          </Link>
        </div>
      </section>

      {logError && (
        <section className="warning-banner">
          <span>
            ログの取得に失敗しました。activity_logsテーブルが作成済みか確認してください。（{logError.message}）
          </span>
        </section>
      )}

      <section className="history-list" aria-label="実行ログ一覧">
        {logs.length === 0 && !logError && (
          <div className="empty-state">
            {errorsOnly
              ? "エラーのログはありません。"
              : "ログはまだありません。"}
          </div>
        )}
        {logs.map((log) => (
          <article className="submission-row" key={log.id}>
            <div className="submission-copy">
              <div className="status-line">
                <span
                  className={
                    log.status === "success" ? "pill approved" : "pill stopped"
                  }
                >
                  {log.status === "success" ? "成功" : "エラー"}
                </span>
                <span>{getEventTypeLabel(log.event_type)}</span>
                <span>
                  {log.customer_account_id
                    ? customerNameById.get(log.customer_account_id) ||
                      "（削除済み顧客）"
                    : "全体"}
                </span>
              </div>
              <strong>{log.message}</strong>
              <small>
                {formatLogDateTime(log.created_at)} / 実行契機:{" "}
                {getSourceLabel(log.source)}
              </small>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
