"use client";

import { useState } from "react";
import { Loader2, Pencil, X } from "lucide-react";
import { updateSubmissionOcrAsAdmin } from "./actions";

function formatAmount(value?: number | null) {
  if (typeof value !== "number") return "未取得";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

function getPaymentMethodLabel(
  method?: string | null,
  isCreditCard?: boolean | null,
) {
  if (method === "credit_card" || isCreditCard === true) return "クレジット払い";
  if (method === "cashless") return "キャッシュレス等";
  return "現金";
}

function formatTaxBreakdown(rate8?: number | null, rate10?: number | null) {
  const has8 = typeof rate8 === "number";
  const has10 = typeof rate10 === "number";
  if (has8 && has10) return `8%対象 ${formatAmount(rate8)} / 10%対象 ${formatAmount(rate10)}`;
  if (has8) return `8%（軽減税率）のみ ${formatAmount(rate8)}`;
  if (has10) return `10%（標準税率）のみ ${formatAmount(rate10)}`;
  return "未設定";
}

export function AdminOcrEditForm({
  customerId,
  submissionId,
  isSent,
  ocrDate,
  ocrAmount,
  ocrStore,
  ocrSummary,
  ocrPaymentMethod,
  ocrIsCreditCard,
  ocrTaxRate8Subtotal,
  ocrTaxRate10Subtotal,
  ocrHasMultipleAccountCandidates,
  ocrAccountReviewReason,
  ocrUpdatedAt,
}: {
  customerId: string;
  submissionId: string;
  isSent: boolean;
  ocrDate?: string | null;
  ocrAmount?: number | null;
  ocrStore?: string | null;
  ocrSummary?: string | null;
  ocrPaymentMethod?: string | null;
  ocrIsCreditCard?: boolean | null;
  ocrTaxRate8Subtotal?: number | null;
  ocrTaxRate10Subtotal?: number | null;
  ocrHasMultipleAccountCandidates?: boolean | null;
  ocrAccountReviewReason?: string | null;
  ocrUpdatedAt?: string | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const paymentMethod =
    ocrPaymentMethod || (ocrIsCreditCard ? "credit_card" : "cash");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    setNotice(null);
    setIsSaving(true);

    const formData = new FormData(event.currentTarget);

    try {
      const result = await updateSubmissionOcrAsAdmin(customerId, submissionId, {
        ocrDate: String(formData.get("ocrDate") || ""),
        ocrAmount: String(formData.get("ocrAmount") || ""),
        ocrStore: String(formData.get("ocrStore") || ""),
        ocrSummary: String(formData.get("ocrSummary") || ""),
        ocrPaymentMethod: String(formData.get("ocrPaymentMethod") || ""),
        ocrTaxRate8Subtotal: String(formData.get("ocrTaxRate8Subtotal") || ""),
        ocrTaxRate10Subtotal: String(formData.get("ocrTaxRate10Subtotal") || ""),
        ocrHasMultipleAccountCandidates:
          formData.get("ocrHasMultipleAccountCandidates") !== null,
        ocrAccountReviewReason: ocrAccountReviewReason || null,
        ocrUpdatedAt: ocrUpdatedAt || null,
      });

      if (result.status === "success") {
        setTimeout(() => window.location.reload(), 700);
        return;
      }

      if (result.status === "conflict") {
        setNotice(result.message);
        setTimeout(() => window.location.reload(), 1500);
        return;
      }

      setNotice(result.message);
    } catch (error) {
      console.error("Failed to save OCR result as admin", error);
      setNotice("OCR結果の保存に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setIsSaving(false);
    }
  }

  if (!isEditing) {
    return (
      <dl className="ocr-summary compact-summary">
        <div>
          <dt>取引日</dt>
          <dd>{ocrDate || "未取得"}</dd>
        </div>
        <div>
          <dt>金額</dt>
          <dd>{formatAmount(ocrAmount)}</dd>
        </div>
        <div>
          <dt>店舗名</dt>
          <dd>{ocrStore || "未取得"}</dd>
        </div>
        <div>
          <dt>概要</dt>
          <dd>{ocrSummary || "未取得"}</dd>
        </div>
        <div>
          <dt>消費税区分</dt>
          <dd>{formatTaxBreakdown(ocrTaxRate8Subtotal, ocrTaxRate10Subtotal)}</dd>
        </div>
        <div>
          <dt>科目判定</dt>
          <dd className={ocrHasMultipleAccountCandidates ? "warning-text" : undefined}>
            {ocrHasMultipleAccountCandidates
              ? `複数科目の可能性あり${ocrAccountReviewReason ? `（${ocrAccountReviewReason}）` : ""}`
              : "単一科目"}
          </dd>
        </div>
        <div>
          <dt>支払方法</dt>
          <dd>
            {getPaymentMethodLabel(ocrPaymentMethod, ocrIsCreditCard)}
            {!isSent && (
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsEditing(true)}
                aria-label="OCR結果を編集"
              >
                <Pencil size={14} />
              </button>
            )}
          </dd>
        </div>
      </dl>
    );
  }

  return (
    <form className="ocr-edit-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>取引日</span>
        <input
          type="date"
          name="ocrDate"
          defaultValue={ocrDate || ""}
          disabled={isSaving}
        />
      </label>
      <label className="field">
        <span>金額</span>
        <input
          inputMode="numeric"
          name="ocrAmount"
          defaultValue={ocrAmount ?? ""}
          placeholder="例: 1500"
          disabled={isSaving}
        />
      </label>
      <label className="field">
        <span>店舗名</span>
        <input
          name="ocrStore"
          defaultValue={ocrStore || ""}
          placeholder="例: コンビニ"
          disabled={isSaving}
        />
      </label>
      <label className="field">
        <span>概要</span>
        <input
          name="ocrSummary"
          defaultValue={ocrSummary || ""}
          placeholder="例: 備品"
          disabled={isSaving}
        />
      </label>
      <label className="field">
        <span>支払方法</span>
        <select
          name="ocrPaymentMethod"
          defaultValue={paymentMethod}
          disabled={isSaving}
        >
          <option value="cash">現金</option>
          <option value="credit_card">クレジット払い</option>
          <option value="cashless">キャッシュレス等</option>
        </select>
      </label>
      <label className="field">
        <span>8%対象の税込金額（軽減税率）</span>
        <input
          inputMode="numeric"
          name="ocrTaxRate8Subtotal"
          defaultValue={ocrTaxRate8Subtotal ?? ""}
          placeholder="対象なしの場合は空欄"
          disabled={isSaving}
        />
      </label>
      <label className="field">
        <span>10%対象の税込金額（標準税率）</span>
        <input
          inputMode="numeric"
          name="ocrTaxRate10Subtotal"
          defaultValue={ocrTaxRate10Subtotal ?? ""}
          placeholder="対象なしの場合は空欄"
          disabled={isSaving}
        />
      </label>
      <small className="muted">
        レシートに軽減税率(8%)・標準税率(10%)の内訳が印字されている場合に入力してください。両方入力すると2件の仕訳に分けて登録されます。
      </small>
      <label className="field">
        <span>複数の勘定科目に分かれる可能性</span>
        <span className="checkbox-line">
          <input
            type="checkbox"
            name="ocrHasMultipleAccountCandidates"
            defaultChecked={ocrHasMultipleAccountCandidates ?? false}
            disabled={isSaving}
          />
          <span>
            複数科目に分かれる可能性がある
            {ocrAccountReviewReason ? `（${ocrAccountReviewReason}）` : ""}
          </span>
        </span>
      </label>
      <small className="muted">
        チェックすると、勘定科目を確定させず顧客設定の仮計上科目で計上し、「確認」タグを付けて送信します。
      </small>
      <div className="action-row">
        <button
          className="secondary-action compact"
          type="submit"
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <Loader2 className="spin-icon" size={15} />
              保存中
            </>
          ) : (
            "OCR結果を保存"
          )}
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => {
            setNotice(null);
            setIsEditing(false);
          }}
          disabled={isSaving}
          aria-label="編集をキャンセル"
        >
          <X size={16} />
        </button>
      </div>
      {notice && <small className="warning-text">{notice}</small>}
    </form>
  );
}
