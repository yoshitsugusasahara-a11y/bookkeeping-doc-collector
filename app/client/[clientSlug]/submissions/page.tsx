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
import {
  logoutClient,
  sendSubmissionToMoneyForward,
  updateSubmissionOcr,
} from "../actions";
import {
  MoneyForwardSendButton,
  OcrSaveButton,
} from "./submission-actions";

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

function getMfStatusLabel(status?: string | null) {
  if (status === "sent") return "MF送信済み";
  if (status === "failed") return "MF送信失敗";
  if (status === "not_ready") return "MF未連携";
  return "MF未送信";
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
      "id, transaction_note, file_name, mime_type, file_size, drive_view_url, thumbnail_url, submitted_at, ocr_status, ocr_error, ocr_date, ocr_amount, ocr_store, ocr_summary, ocr_is_credit_card, mf_status, mf_error, mf_journal_id, mf_voucher_file_id, mf_sent_at",
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
          const isSent = item.mf_status === "sent";
          const canSendToMf =
            item.ocr_status === "completed" && item.mf_status !== "sent";

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

                <div className="ocr-edit-panel">
                  <div className="status-line">
                    <span>{getOcrStatusLabel(item.ocr_status)}</span>
                    <span>{getMfStatusLabel(item.mf_status)}</span>
                  </div>

                  <form
                    className={isSent ? "ocr-edit-form locked" : "ocr-edit-form"}
                    action={updateSubmissionOcr.bind(null, clientSlug)}
                  >
                    <input type="hidden" name="submissionId" value={item.id} />
                    <label className="field">
                      <span>取引日</span>
                      <input
                        type="date"
                        name="ocrDate"
                        defaultValue={item.ocr_date || ""}
                        disabled={isSent}
                      />
                    </label>
                    <label className="field">
                      <span>金額</span>
                      <input
                        inputMode="numeric"
                        name="ocrAmount"
                        defaultValue={item.ocr_amount ?? ""}
                        placeholder="例: 1500"
                        disabled={isSent}
                      />
                    </label>
                    <label className="field">
                      <span>店舗名</span>
                      <input
                        name="ocrStore"
                        defaultValue={item.ocr_store || ""}
                        placeholder="例: コンビニ"
                        disabled={isSent}
                      />
                    </label>
                    <label className="field">
                      <span>概要</span>
                      <input
                        name="ocrSummary"
                        defaultValue={item.ocr_summary || ""}
                        placeholder="例: 備品"
                        disabled={isSent}
                      />
                    </label>
                    <label className="field">
                      <span>支払方法</span>
                      <select
                        name="ocrIsCreditCard"
                        defaultValue={
                          item.ocr_is_credit_card === null
                            ? ""
                            : String(item.ocr_is_credit_card)
                        }
                        disabled={isSent}
                      >
                        <option value="">未取得</option>
                        <option value="false">現金</option>
                        <option value="true">クレカ等</option>
                      </select>
                    </label>
                    <div className="action-row">
                      <OcrSaveButton disabled={isSent} />
                    </div>
                  </form>

                  <dl className="ocr-summary compact-summary">
                    <div>
                      <dt>金額</dt>
                      <dd>{formatAmount(item.ocr_amount)}</dd>
                    </div>
                    <div>
                      <dt>MF送信日時</dt>
                      <dd>
                        {item.mf_sent_at
                          ? formatSubmittedAt(item.mf_sent_at)
                          : "未送信"}
                      </dd>
                    </div>
                  </dl>

                  <form
                    className="action-row"
                    action={sendSubmissionToMoneyForward.bind(null, clientSlug)}
                  >
                    <input type="hidden" name="submissionId" value={item.id} />
                    <MoneyForwardSendButton disabled={!canSendToMf} />
                  </form>
                </div>

                {item.ocr_error && (
                  <small className="warning-text">OCR: {item.ocr_error}</small>
                )}
                {item.mf_error && (
                  <small className="warning-text">MF: {item.mf_error}</small>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
