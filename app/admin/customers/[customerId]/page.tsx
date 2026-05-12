import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  FileText,
  ImageIcon,
  ShieldCheck,
} from "lucide-react";
import { ensureProfile, getCurrentUserOrRedirect } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { updateCustomerDriveSettings } from "./actions";

function getFileTypeLabel(mimeType: string) {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.includes("heic") || mimeType.includes("heif")) return "HEIC";
  if (mimeType.includes("png")) return "PNG";
  return "JPG";
}

function getThumbTone(mimeType: string) {
  if (mimeType === "application/pdf") return "blue";
  if (mimeType.includes("heic") || mimeType.includes("heif")) return "yellow";
  return "green";
}

function formatSubmittedAt(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
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

  const { data: customer } = await supabase
    .from("customer_accounts")
    .select(
      "id, user_id, customer_name, client_slug, approval_status, drive_folder_id, drive_folder_name, created_at",
    )
    .eq("id", customerId)
    .maybeSingle();

  if (!customer) {
    return (
      <main className="app-frame">
        <Link className="text-link" href="/admin/customers">
          <ArrowLeft size={16} />
          顧客一覧へ戻る
        </Link>
        <section className="empty-state">顧客が見つかりません。</section>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", customer.user_id)
    .maybeSingle();

  const { data: submissionRows } = await supabase
    .from("submissions")
    .select(
      "id, transaction_note, file_name, mime_type, file_size, drive_view_url, thumbnail_url, submitted_at",
    )
    .eq("customer_account_id", customer.id)
    .order("submitted_at", { ascending: false });
  const submissions = submissionRows ?? [];

  return (
    <main className="admin-detail-shell">
      <header className="detail-header">
        <Link className="text-link" href="/admin/customers">
          <ArrowLeft size={16} />
          顧客一覧へ戻る
        </Link>
        <div>
          <p className="eyebrow">Customer Detail</p>
          <h1>{customer.customer_name}</h1>
          <p className="muted">{profile?.email || "メール未取得"}</p>
        </div>
      </header>

      <section className="metric-grid" aria-label="顧客情報">
        <div className="metric">
          <small>状態</small>
          <strong>
            {customer.approval_status === "approved" ? "承認済み" : "承認待ち"}
          </strong>
        </div>
        <div className="metric">
          <small>送信数</small>
          <strong>{submissions.length}</strong>
        </div>
        <div className="metric">
          <small>Drive</small>
          <strong>{customer.drive_folder_name || "未設定"}</strong>
        </div>
      </section>

      {!customer.drive_folder_id && (
        <section className="warning-banner">
          <AlertTriangle size={18} />
          <span>
            この顧客はDrive保存先が未設定です。設定するまで、送信履歴は保存されますがファイル本体はDriveに保存されません。
          </span>
        </section>
      )}

      <section className="settings-panel" aria-label="Google Drive保存先">
        <div>
          <p className="eyebrow">Google Drive</p>
          <h2>保存先フォルダ</h2>
          <p className="muted">
            顧客の送信ファイルを保存するGoogle DriveフォルダIDを登録します。
          </p>
        </div>
        <form className="drive-form" action={updateCustomerDriveSettings}>
          <input type="hidden" name="customerId" value={customer.id} />
          <label className="field">
            <span>フォルダID</span>
            <input
              name="driveFolderId"
              defaultValue={customer.drive_folder_id || ""}
              placeholder="例: 1AbCdEfGhIjKlMnOpQrStUvWxYz"
            />
          </label>
          <label className="field">
            <span>表示名</span>
            <input
              name="driveFolderName"
              defaultValue={customer.drive_folder_name || ""}
              placeholder="例: 東京商会 証憑フォルダ"
            />
          </label>
          <button className="primary-action" type="submit">
            Drive設定を保存
          </button>
        </form>
      </section>

      <section className="history-list" aria-label="顧客の送信履歴">
        {submissions.length === 0 && (
          <div className="empty-state">送信履歴はまだありません。</div>
        )}
        {submissions.map((item) => {
          const typeLabel = getFileTypeLabel(item.mime_type);
          const tone = getThumbTone(item.mime_type);

          return (
            <article className="submission-row" key={item.id}>
              <div className={`thumb ${tone}`}>
                {item.thumbnail_url ? (
                  <img
                    className="history-thumb-image"
                    src={item.thumbnail_url}
                    alt={`${item.file_name}のサムネイル`}
                  />
                ) : typeLabel === "PDF" ? (
                  <FileText size={28} />
                ) : (
                  <ImageIcon size={28} />
                )}
                {!item.thumbnail_url && <span>{typeLabel}</span>}
              </div>
              <div className="submission-copy">
                <strong>{item.transaction_note}</strong>
                <small>{item.file_name}</small>
                <small>
                  {formatSubmittedAt(item.submitted_at)} /{" "}
                  {(item.file_size / 1024).toFixed(1)} KB
                </small>
                {item.drive_view_url && (
                  <a
                    className="inline-link"
                    href={item.drive_view_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={14} />
                    Driveで開く
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
