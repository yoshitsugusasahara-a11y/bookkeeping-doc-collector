import Link from "next/link";
import { ArrowLeft, ExternalLink, RotateCcw, ShieldCheck } from "lucide-react";
import { ensureProfile, getCurrentUserOrRedirect } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { restoreSubmission } from "../actions";

function formatSubmittedAt(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

function formatAmount(value?: number | null) {
  if (typeof value !== "number") return "未取得";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function AdminCustomerTrashPage({
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
    .select("id, customer_name")
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

  const { data: submissionRows } = await supabase
    .from("submissions")
    .select(
      "id, transaction_note, file_name, drive_view_url, submitted_at, ocr_date, ocr_amount, ocr_store, mf_status, hidden_at",
    )
    .eq("customer_account_id", customer.id)
    .not("hidden_at", "is", null)
    .order("hidden_at", { ascending: false });
  const submissions = submissionRows ?? [];

  return (
    <main className="admin-detail-shell">
      <header className="detail-header">
        <Link className="text-link" href={`/admin/customers/${customer.id}`}>
          <ArrowLeft size={16} />
          {customer.customer_name}の詳細へ戻る
        </Link>
        <div>
          <p className="eyebrow">Trash</p>
          <h1>ゴミ箱</h1>
          <p className="muted">
            削除（非表示）した送信履歴です。データベース上は保持されており、いつでも復元できます。ただし資料保存上限を超えた古い履歴は、これまで通り自動的に完全削除されます。
          </p>
        </div>
      </header>

      <section className="history-list" aria-label="削除済みの送信履歴">
        {submissions.length === 0 && (
          <div className="empty-state">ゴミ箱には何もありません。</div>
        )}
        {submissions.map((item) => (
          <article className="submission-row" key={item.id}>
            <div className="submission-copy">
              <strong>{item.transaction_note}</strong>
              <small>{item.file_name}</small>
              <small>
                送信: {formatSubmittedAt(item.submitted_at)} / 削除:{" "}
                {item.hidden_at ? formatSubmittedAt(item.hidden_at) : "未取得"}
              </small>
              <small>
                {item.ocr_date || "日付未取得"} / {formatAmount(item.ocr_amount)}{" "}
                / {item.ocr_store || "店舗未取得"}
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
              <form action={restoreSubmission}>
                <input type="hidden" name="customerId" value={customer.id} />
                <input type="hidden" name="submissionId" value={item.id} />
                <button className="secondary-action compact-action" type="submit">
                  <RotateCcw size={16} />
                  復元する
                </button>
              </form>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
