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
