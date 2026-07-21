import Link from "next/link";
import { AlertTriangle, ArrowLeft, ShieldCheck } from "lucide-react";
import { ensureProfile, getCurrentUserOrRedirect } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import {
  GOOGLE_DRIVE_TOKEN_LIFETIME_DAYS,
  getGoogleDriveTokenExpiry,
} from "@/lib/google/token-status";

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(value);
}

export default async function AdminSettingsPage() {
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

  const { data: tokenStatus } = await supabase
    .from("google_drive_token_status")
    .select("issued_at")
    .eq("id", true)
    .maybeSingle();

  const issuedAt = tokenStatus ? new Date(tokenStatus.issued_at) : null;
  const expiresAt = tokenStatus
    ? getGoogleDriveTokenExpiry(tokenStatus.issued_at)
    : null;
  const remainingHours = expiresAt
    ? Math.round((expiresAt.getTime() - Date.now()) / (60 * 60 * 1000))
    : null;
  const isExpired = remainingHours !== null && remainingHours <= 0;
  const isExpiringSoon =
    remainingHours !== null && remainingHours > 0 && remainingHours <= 24;

  return (
    <main className="admin-detail-shell">
      <header className="detail-header">
        <Link className="text-link" href="/admin/customers">
          <ArrowLeft size={16} />
          顧客一覧へ戻る
        </Link>
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Google Driveトークン管理</h1>
          <p className="muted">
            Google CloudのOAuthアプリがテスト公開中のため、リフレッシュトークンは発行から
            {GOOGLE_DRIVE_TOKEN_LIFETIME_DAYS}
            日で失効します。期限が近づいたら再認証してください。
          </p>
        </div>
      </header>

      <section className="settings-panel" aria-label="トークン状態">
        {!issuedAt && (
          <div className="empty-state">
            トークンの発行記録がまだありません。下のボタンから認証を行ってください。
          </div>
        )}
        {issuedAt && expiresAt && (
          <dl className="ocr-summary compact-summary">
            <div>
              <dt>発行日時</dt>
              <dd>{formatDateTime(issuedAt)}</dd>
            </div>
            <div>
              <dt>有効期限（目安）</dt>
              <dd>{formatDateTime(expiresAt)}</dd>
            </div>
            <div>
              <dt>状態</dt>
              <dd>
                <span
                  className={
                    isExpired
                      ? "pill stopped"
                      : isExpiringSoon
                        ? "pill pending"
                        : "pill approved"
                  }
                >
                  {isExpired
                    ? "期限切れの可能性"
                    : isExpiringSoon
                      ? "まもなく期限切れ"
                      : "有効"}
                </span>
              </dd>
            </div>
          </dl>
        )}

        {(isExpired || isExpiringSoon) && (
          <section className="warning-banner">
            <AlertTriangle size={18} />
            <span>
              リフレッシュトークンの有効期限が近づいています。早めに再認証してください。
            </span>
          </section>
        )}
      </section>

      <section className="settings-panel" aria-label="再認証手順">
        <h2>再認証手順</h2>
        <ol>
          <li>
            下のリンクからGoogleの認可画面を開き、資料保存用のGoogleアカウントで許可してください。
          </li>
          <li>
            認可完了後に表示されるリフレッシュトークンをコピーし、Vercelの環境変数
            <code>GOOGLE_DRIVE_REFRESH_TOKEN</code>
            に上書き保存してください（自動で再デプロイされます）。
          </li>
          <li>再デプロイ後、この画面をリロードすると発行日時が更新されています。</li>
        </ol>
        <a
          className="primary-action"
          href="/api/google-drive/start"
          target="_blank"
          rel="noreferrer"
        >
          Googleを再認証する
        </a>
      </section>
    </main>
  );
}
