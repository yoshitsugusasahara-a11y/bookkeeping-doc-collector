import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  ExternalLink,
  FileText,
  History,
  ImageIcon,
  LogOut,
  Settings,
} from "lucide-react";
import { getCurrentUserOrRedirect } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { logoutClient } from "../actions";

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

function getOcrStatusLabel(status?: string | null) {
  if (status === "completed") return "OCR解析済み";
  if (status === "failed") return "OCR失敗";
  if (status === "skipped") return "OCR未設定";
  return "OCR待ち";
}

function formatAmount(value?: number | null) {
  if (typeof value !== "number") return "未取得";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function ClientSubmissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const { clientSlug } = await params;
  const { sent } = await searchParams;
  const supabase = await createClient();
  const user = await getCurrentUserOrRedirect(
    supabase,
    `/client/${clientSlug}`,
  );

  const { data: account } = await supabase
    .from("customer_accounts")
    .select("id, approval_status")
    .eq("user_id", user.id)
    .eq("client_slug", clientSlug)
    .maybeSingle();

  if (!account) {
    redirect(`/client/${clientSlug}/signup`);
  }

  if (account.approval_status !== "approved") {
    redirect(`/client/${clientSlug}/pending`);
  }

  const { data: submissionRows } = await supabase
    .from("submissions")
    .select(
      "id, transaction_note, file_name, mime_type, file_size, drive_view_url, thumbnail_url, submitted_at, ocr_status, ocr_error, ocr_date, ocr_amount, ocr_store, ocr_summary, ocr_is_credit_card",
    )
    .eq("customer_account_id", account.id)
    .order("submitted_at", { ascending: false });
  const submissions = submissionRows ?? [];

  return (
    <main className="app-frame">
      <header className="topbar">
        <div>
          <p className="eyebrow">顧客画面</p>
          <h1>送信履歴</h1>
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
        <Link className="tab active" href={`/client/${clientSlug}/submissions`}>
          <History size={18} />
          <span>履歴</span>
        </Link>
        <Link className="tab" href={`/client/${clientSlug}/settings`}>
          <Settings size={18} />
          <span>設定</span>
        </Link>
      </nav>

      {sent === "1" && (
        <section className="success-banner">
          <CheckCircle2 size={18} />
          <span>送信が完了しました。</span>
        </section>
      )}

      <section className="history-list" aria-label="送信済み資料">
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
                    className="drive-link"
                    href={item.drive_view_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={15} />
                    Driveで開く
                  </a>
                )}
                <dl className="ocr-summary">
                  <div>
                    <dt>状態</dt>
                    <dd>{getOcrStatusLabel(item.ocr_status)}</dd>
                  </div>
                  <div>
                    <dt>取引日</dt>
                    <dd>{item.ocr_date || "未取得"}</dd>
                  </div>
                  <div>
                    <dt>金額</dt>
                    <dd>{formatAmount(item.ocr_amount)}</dd>
                  </div>
                  <div>
                    <dt>店舗名</dt>
                    <dd>{item.ocr_store || "未取得"}</dd>
                  </div>
                  <div>
                    <dt>概要</dt>
                    <dd>{item.ocr_summary || "未取得"}</dd>
                  </div>
                  <div>
                    <dt>支払方法</dt>
                    <dd>
                      {item.ocr_is_credit_card === null
                        ? "未取得"
                        : item.ocr_is_credit_card
                          ? "クレカ等"
                          : "現金"}
                    </dd>
                  </div>
                </dl>
                {item.ocr_error && (
                  <small className="warning-text">OCR: {item.ocr_error}</small>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
