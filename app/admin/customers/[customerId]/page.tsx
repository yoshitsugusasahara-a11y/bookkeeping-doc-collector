import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  ShieldCheck,
} from "lucide-react";
import { ensureProfile, getCurrentUserOrRedirect } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { DeleteSubmissionButton } from "@/components/delete-submission-button";
import { hideSubmission } from "./actions";
import { deleteCustomerAccount } from "../actions";
import { CustomerAccountActionButton } from "../customer-account-action-button";
import { CustomerAccountToggleButton } from "../customer-account-toggle-button";
import { AdminOcrEditForm } from "./admin-ocr-edit-form";
import { DisconnectMfButton } from "./disconnect-mf-button";
import { DocumentRuleActions } from "./document-rule-actions";
import { DocumentRuleForm } from "./document-rule-form";
import { DriveSettingsForm } from "./drive-settings-form";
import { JournalPromptForm } from "./journal-prompt-form";
import { MfProcessForm } from "./mf-process-form";
import { RetentionSettingsForm } from "./retention-settings-form";

export const maxDuration = 60;

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
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

function getCustomerStatusLabel(status?: string | null) {
  if (status === "approved") return "承認済み";
  if (status === "suspended") return "利用停止中";
  if (status === "rejected") return "却下";
  return "承認待ち";
}

function getCustomerStatusClass(status?: string | null) {
  if (status === "approved") return "pill approved";
  if (status === "suspended" || status === "rejected") return "pill stopped";
  return "pill pending";
}

function getOcrStatusLabel(status?: string | null) {
  if (status === "completed") return "OCR解析済み";
  if (status === "failed") return "OCR失敗";
  if (status === "skipped") return "OCR未設定";
  return "OCR待ち";
}

function getMfStatusLabel(status?: string | null) {
  if (status === "sent") return "MF送信済み";
  if (status === "failed") return "MF送信失敗";
  if (status === "not_ready") return "MF未送信";
  return "MF送信待ち";
}

function getDocumentClassificationStatusLabel(
  status: string | null | undefined,
  hasRules: boolean,
) {
  if (status === "completed") return "分類済み";
  if (status === "failed") return "分類失敗";
  if (status === "skipped") return "分類対象外";
  return hasRules ? "分類待ち" : "分類ルールなし";
}

function getDocumentKindLabel(kind?: string | null) {
  if (kind === "receipt") return "領収書・レシート";
  if (kind === "matched_document") return "登録ルールに一致";
  if (kind === "unmatched_document") return "未分類";
  return "未判定";
}

function formatConfidence(value?: number | null) {
  if (typeof value !== "number") return "未取得";
  return `${Math.round(value * 100)}%`;
}

function formatAdminDateTime(value?: string | null) {
  if (!value) return "未取得";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

export default async function AdminCustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ filter?: "unsent" | "mf_failed" | "sent" }>;
}) {
  const { customerId } = await params;
  const { filter } = await searchParams;
  const unsentOnly = filter === "unsent";
  const mfFailedOnly = filter === "mf_failed";
  const sentOnly = filter === "sent";
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

  const { data: customer, error: customerError } = await supabase
    .from("customer_accounts")
    .select(
      "id, user_id, customer_name, client_slug, approval_status, drive_folder_id, drive_folder_name, error_drive_folder_id, error_drive_folder_name, irregular_drive_folder_id, irregular_drive_folder_name, journal_prompt, submission_retention_limit, created_at",
    )
    .eq("id", customerId)
    .maybeSingle();

  if (customerError) {
    console.error("Failed to fetch admin customer detail", customerError);

    return (
      <main className="app-frame">
        <Link className="text-link" href="/admin/customers">
          <ArrowLeft size={16} />
          顧客一覧へ戻る
        </Link>
        <section className="empty-state">
          <h1>顧客情報の取得に失敗しました</h1>
          <p>
            データベースの設定とアプリの項目が一致していない可能性があります。
          </p>
          <p className="muted">{customerError.message}</p>
        </section>
      </main>
    );
  }

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

  let submissionQuery = supabase
    .from("submissions")
    .select(
      "id, transaction_note, file_name, mime_type, file_size, drive_view_url, thumbnail_url, submitted_at, document_classification_status, document_kind, document_rule_id, document_confidence, document_error, document_drive_file_name, ocr_status, ocr_error, ocr_date, ocr_amount, ocr_store, ocr_summary, ocr_payment_method, ocr_is_credit_card, ocr_updated_at, mf_status, mf_error, mf_journal_id, mf_voucher_file_id, mf_sent_at",
    )
    .eq("customer_account_id", customer.id)
    .is("hidden_at", null)
    .order("submitted_at", { ascending: false });

  if (mfFailedOnly) {
    submissionQuery = submissionQuery.eq("mf_status", "failed");
  } else if (sentOnly) {
    submissionQuery = submissionQuery.eq("mf_status", "sent");
  } else if (unsentOnly) {
    submissionQuery = submissionQuery.neq("mf_status", "sent");
  }

  const { data: submissionRows } = await submissionQuery;
  const submissions = submissionRows ?? [];

  const [
    { count: allCount },
    { count: unsentCount },
    { count: mfFailedCount },
    { count: sentCount },
    { count: trashCount },
  ] = await Promise.all([
    supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("customer_account_id", customer.id)
      .is("hidden_at", null),
    supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("customer_account_id", customer.id)
      .is("hidden_at", null)
      .neq("mf_status", "sent"),
    supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("customer_account_id", customer.id)
      .is("hidden_at", null)
      .eq("mf_status", "failed"),
    supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("customer_account_id", customer.id)
      .is("hidden_at", null)
      .eq("mf_status", "sent"),
    supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("customer_account_id", customer.id)
      .not("hidden_at", "is", null),
  ]);

  const { data: mfConnection } = await supabase
    .from("mf_connections")
    .select("connected_at, expires_at, scope")
    .eq("customer_account_id", customer.id)
    .maybeSingle();

  const { data: documentRuleRows } = await supabase
    .from("document_rules")
    .select(
      "id, document_name, match_features, file_name_rule, drive_folder_id, drive_folder_name, is_active, created_at",
    )
    .eq("customer_account_id", customer.id)
    .order("created_at", { ascending: true });
  const documentRules = documentRuleRows ?? [];
  const documentRuleNameById = new Map(
    documentRules.map((rule) => [rule.id, rule.document_name]),
  );
  const isApproved = customer.approval_status === "approved";
  const isSuspended = customer.approval_status === "suspended";

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
          <small>MF連携</small>
          <strong>{mfConnection ? "連携済み" : "未連携"}</strong>
        </div>
      </section>

      <section className="settings-panel" aria-label="顧客アカウント操作">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Account Control</p>
            <h2>顧客アカウント操作</h2>
            <p className="muted">
              利用停止にすると顧客側の送信・履歴・設定・MF送信を停止し、MF連携も解除します。
              削除はアプリ内データを消す不可逆操作です。
            </p>
          </div>
          <span className={getCustomerStatusClass(customer.approval_status)}>
            {getCustomerStatusLabel(customer.approval_status)}
          </span>
        </div>
        <div className="account-control-actions">
          {isApproved && (
            <CustomerAccountToggleButton
              action="suspend"
              accountId={customer.id}
              className="danger-action"
            />
          )}
          {isSuspended && (
            <>
              <CustomerAccountToggleButton
                action="resume"
                accountId={customer.id}
                className="primary-action"
              />
              <form className="delete-confirm-form" action={deleteCustomerAccount}>
                <input type="hidden" name="accountId" value={customer.id} />
                <label>
                  <input
                    type="checkbox"
                    name="confirmDelete"
                    value="true"
                    required
                  />
                  削除することを確認
                </label>
                <CustomerAccountActionButton
                  action="delete"
                  className="danger-action"
                />
              </form>
            </>
          )}
          {!isApproved && !isSuspended && (
            <p className="muted">
              承認待ちまたは却下状態の顧客です。承認は顧客一覧から行えます。
            </p>
          )}
        </div>
      </section>

      {!(
        customer.drive_folder_id &&
        customer.error_drive_folder_id &&
        customer.irregular_drive_folder_id
      ) && (
        <section className="warning-banner">
          <AlertTriangle size={18} />
          <span>
            この顧客は「レシート保存フォルダ」「エラーフォルダ」「ルールが存在しない資料フォルダ」のいずれかが未設定です。3つすべて設定するまで、顧客側で資料をアップロードできません。
          </span>
        </section>
      )}

      <section className="settings-panel" aria-label="マネーフォワード連携">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Money Forward</p>
            <h2>マネーフォワード連携</h2>
          </div>
          <span className={mfConnection ? "pill approved" : "pill pending"}>
            {mfConnection ? "連携済み" : "未連携"}
          </span>
        </div>
        {mfConnection ? (
          <>
            <dl className="connection-details">
              <div>
                <dt>連携日時</dt>
                <dd>{formatAdminDateTime(mfConnection.connected_at)}</dd>
              </div>
              <div>
                <dt>有効期限</dt>
                <dd>{formatAdminDateTime(mfConnection.expires_at)}</dd>
              </div>
            </dl>
            <DisconnectMfButton customerId={customer.id} />
            <p className="muted">
              解除すると、このアプリから当該顧客のMFへ送信できなくなります。MF側の連携中アプリ一覧でも、必要に応じて連携解除してください。
            </p>
          </>
        ) : (
          <p className="muted">
            まだ顧客側でマネーフォワード連携が完了していません。
          </p>
        )}
      </section>

      <section className="settings-panel" aria-label="Google Drive保存先">
        <div>
          <p className="eyebrow">Google Drive</p>
          <h2>保存先フォルダ</h2>
          <p className="muted">
            レシート保存フォルダ・エラーフォルダ・ルールが存在しない資料フォルダの3つすべてを設定するまで、顧客側で資料をアップロードできません。
          </p>
        </div>
        <DriveSettingsForm
          customerId={customer.id}
          driveFolderId={customer.drive_folder_id}
          driveFolderName={customer.drive_folder_name}
          errorDriveFolderId={customer.error_drive_folder_id}
          errorDriveFolderName={customer.error_drive_folder_name}
          irregularDriveFolderId={customer.irregular_drive_folder_id}
          irregularDriveFolderName={customer.irregular_drive_folder_name}
        />
      </section>

      <section className="settings-panel" aria-label="仕訳生成指示">
        <div>
          <p className="eyebrow">Journal Prompt</p>
          <h2>仕訳生成指示</h2>
          <p className="muted">
            レシート・領収書からMF仕訳を作成するときに、勘定科目、補助科目、摘要、タグの判断へ反映する指示です。
          </p>
        </div>
        <JournalPromptForm
          customerId={customer.id}
          journalPrompt={customer.journal_prompt}
        />
      </section>

      <section className="settings-panel" aria-label="資料保存上限">
        <div>
          <p className="eyebrow">Storage Limit</p>
          <h2>資料保存上限</h2>
          <p className="muted">
            Supabaseに残す履歴件数を顧客ごとに設定します。上限を超えた古い資料は、アプリ内の履歴から削除されます。
          </p>
        </div>
        <RetentionSettingsForm
          customerId={customer.id}
          submissionRetentionLimit={customer.submission_retention_limit || 200}
        />
      </section>

      <section className="settings-panel" aria-label="資料分類ルール">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Document Rules</p>
            <h2>資料分類ルール</h2>
            <p className="muted">
              レシート以外の資料を判定し、指定したファイル名とGoogle Driveフォルダへ保存するためのルールです。
            </p>
          </div>
          <a
            className="secondary-action compact-action"
            href={`/admin/customers/${customer.id}/document-rules.csv`}
          >
            <Download size={16} />
            CSVダウンロード
          </a>
        </div>

        <DocumentRuleForm customerId={customer.id} />

        <div className="document-rule-list">
          {documentRules.length === 0 ? (
            <div className="empty-state">資料分類ルールはまだありません。</div>
          ) : (
            documentRules.map((rule) => (
              <article className="document-rule-card" key={rule.id}>
                <div>
                  <div className="rule-title-row">
                    <strong>{rule.document_name}</strong>
                    <span className={rule.is_active ? "pill approved" : "pill pending"}>
                      {rule.is_active ? "有効" : "無効"}
                    </span>
                  </div>
                  <small>ファイル名ルール: {rule.file_name_rule}</small>
                  {rule.match_features && (
                    <small>特徴: {rule.match_features}</small>
                  )}
                  {(rule.drive_folder_name || rule.drive_folder_id) && (
                    <small>
                      保存先: {rule.drive_folder_name || "名称未設定"}
                      {rule.drive_folder_id ? ` / ${rule.drive_folder_id}` : ""}
                    </small>
                  )}
                </div>
                <DocumentRuleActions
                  customerId={customer.id}
                  ruleId={rule.id}
                  isActive={rule.is_active}
                />
              </article>
            ))
          )}
        </div>
      </section>

      <section className="history-list" aria-label="顧客の送信履歴">
        <section className="settings-panel" aria-label="MF送信処理">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Batch Process</p>
              <h2>MF送信処理</h2>
              <p className="muted">
                未処理の送信分について、Google Drive保存、OCR解析、MF仕訳送信、証憑添付を1件ずつ順番に実行します。進捗と結果は下に表示されます。
              </p>
            </div>
          </div>
          <MfProcessForm customerId={customer.id} />
        </section>

        <section className="settings-panel" aria-label="送信履歴の絞り込み">
          <div className="account-control-actions">
            <a
              className={
                !unsentOnly && !mfFailedOnly && !sentOnly
                  ? "primary-action"
                  : "secondary-action"
              }
              href={`/admin/customers/${customer.id}`}
            >
              すべて表示（{allCount ?? 0}）
            </a>
            <a
              className={unsentOnly ? "primary-action" : "secondary-action"}
              href={`/admin/customers/${customer.id}?filter=unsent`}
            >
              未送信のみ表示（{unsentCount ?? 0}）
            </a>
            <a
              className={mfFailedOnly ? "primary-action" : "secondary-action"}
              href={`/admin/customers/${customer.id}?filter=mf_failed`}
            >
              MF送信エラーのみ表示（{mfFailedCount ?? 0}）
            </a>
            <a
              className={sentOnly ? "primary-action" : "secondary-action"}
              href={`/admin/customers/${customer.id}?filter=sent`}
            >
              送信済みのみ表示（{sentCount ?? 0}）
            </a>
            <a
              className="secondary-action"
              href={`/admin/customers/${customer.id}/trash`}
            >
              ゴミ箱を見る（{trashCount ?? 0}）
            </a>
          </div>
        </section>

        {submissions.length === 0 && (
          <div className="empty-state">
            {mfFailedOnly
              ? "MF送信エラーの送信履歴はありません。"
              : sentOnly
                ? "送信済みの送信履歴はありません。"
                : unsentOnly
                  ? "未送信の送信履歴はありません。"
                  : "送信履歴はまだありません。"}
          </div>
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
                <dl className="ocr-summary">
                  <div>
                    <dt>資料分類</dt>
                    <dd>
                      {getDocumentClassificationStatusLabel(
                        item.document_classification_status,
                        documentRules.length > 0,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>判定</dt>
                    <dd>{getDocumentKindLabel(item.document_kind)}</dd>
                  </div>
                  <div>
                    <dt>一致ルール</dt>
                    <dd>
                      {item.document_rule_id
                        ? documentRuleNameById.get(item.document_rule_id) ||
                          item.document_rule_id
                        : "なし"}
                    </dd>
                  </div>
                  <div>
                    <dt>信頼度</dt>
                    <dd>{formatConfidence(item.document_confidence)}</dd>
                  </div>
                  <div>
                    <dt>Drive保存名</dt>
                    <dd>{item.document_drive_file_name || "未保存"}</dd>
                  </div>
                  <div>
                    <dt>状態</dt>
                    <dd>{getOcrStatusLabel(item.ocr_status)}</dd>
                  </div>
                  <div>
                    <dt>MF送信</dt>
                    <dd>{getMfStatusLabel(item.mf_status)}</dd>
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
                <AdminOcrEditForm
                  customerId={customer.id}
                  submissionId={item.id}
                  isSent={item.mf_status === "sent"}
                  ocrDate={item.ocr_date}
                  ocrAmount={item.ocr_amount}
                  ocrStore={item.ocr_store}
                  ocrSummary={item.ocr_summary}
                  ocrPaymentMethod={item.ocr_payment_method}
                  ocrIsCreditCard={item.ocr_is_credit_card}
                  ocrUpdatedAt={item.ocr_updated_at}
                />
                {item.ocr_error && (
                  <small className="warning-text">OCR: {item.ocr_error}</small>
                )}
                {item.document_error && (
                  <small className="warning-text">
                    Gemini分類: {item.document_error}
                  </small>
                )}
                {item.mf_error && (
                  <small className="warning-text">MF: {item.mf_error}</small>
                )}
                {item.mf_status !== "sent" && (
                  <DeleteSubmissionButton
                    action={hideSubmission}
                    args={[customer.id, item.id]}
                  />
                )}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
