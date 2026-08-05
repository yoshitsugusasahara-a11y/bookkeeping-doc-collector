"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  updateSubmissionOcr,
  type OcrUpdateState,
} from "../actions";

const initialState: OcrUpdateState = {
  status: "idle",
};

export function OcrEditForm({
  clientSlug,
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
  clientSlug: string;
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
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{
    status: "success" | "error" | "locked" | "conflict";
    message: string;
  } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSent || isSaving) return;

    setNotice(null);
    setIsSaving(true);

    try {
      const result = await updateSubmissionOcr(
        clientSlug,
        initialState,
        new FormData(event.currentTarget),
      );

      if (result.status !== "idle" && result.message) {
        setNotice({
          status: result.status,
          message: result.message,
        });
      }

      if (result.status === "success") {
        setTimeout(() => window.location.reload(), 700);
        return;
      }

      if (result.status === "conflict") {
        setTimeout(() => window.location.reload(), 1500);
        return;
      }
    } catch (error) {
      console.error("Failed to save OCR result", error);
      setNotice({
        status: "error",
        message: "OCR結果の保存に失敗しました。時間をおいて再度お試しください。",
      });
    } finally {
      setIsSaving(false);
    }
  }

  const disabled = isSent || isSaving;
  const paymentMethod =
    ocrPaymentMethod || (ocrIsCreditCard ? "credit_card" : "cash");

  return (
    <form
      className={isSent ? "ocr-edit-form locked" : "ocr-edit-form"}
      onSubmit={handleSubmit}
    >
      <input type="hidden" name="submissionId" value={submissionId} />
      <input
        type="hidden"
        name="ocrUpdatedAt"
        value={ocrUpdatedAt || ""}
      />
      <label className="field">
        <span>取引日</span>
        <input
          type="date"
          name="ocrDate"
          defaultValue={ocrDate || ""}
          disabled={disabled}
        />
      </label>
      <label className="field">
        <span>金額</span>
        <input
          inputMode="numeric"
          name="ocrAmount"
          defaultValue={ocrAmount ?? ""}
          placeholder="例: 1500"
          disabled={disabled}
        />
      </label>
      <label className="field">
        <span>店舗名</span>
        <input
          name="ocrStore"
          defaultValue={ocrStore || ""}
          placeholder="例: コンビニ"
          disabled={disabled}
        />
      </label>
      <label className="field">
        <span>概要</span>
        <input
          name="ocrSummary"
          defaultValue={ocrSummary || ""}
          placeholder="例: 備品"
          disabled={disabled}
        />
      </label>
      <label className="field">
        <span>支払方法</span>
        <select
          name="ocrPaymentMethod"
          defaultValue={paymentMethod}
          disabled={disabled}
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
          disabled={disabled}
        />
      </label>
      <label className="field">
        <span>10%対象の税込金額（標準税率）</span>
        <input
          inputMode="numeric"
          name="ocrTaxRate10Subtotal"
          defaultValue={ocrTaxRate10Subtotal ?? ""}
          placeholder="対象なしの場合は空欄"
          disabled={disabled}
        />
      </label>
      <small className="muted">
        レシートに軽減税率(8%)・標準税率(10%)の内訳が印字されている場合に入力してください。両方入力すると2件の仕訳に分けて登録されます。片方のみ、または空欄のままでも送信できます。
      </small>
      <input
        type="hidden"
        name="ocrAccountReviewReason"
        value={ocrAccountReviewReason || ""}
      />
      <label className="field">
        <span>複数の勘定科目に分かれる可能性</span>
        <span className="checkbox-line">
          <input
            type="checkbox"
            name="ocrHasMultipleAccountCandidates"
            defaultChecked={ocrHasMultipleAccountCandidates ?? false}
            disabled={disabled}
          />
          <span>
            この資料は複数の勘定科目に分かれる可能性がある
            {ocrAccountReviewReason ? `（${ocrAccountReviewReason}）` : ""}
          </span>
        </span>
      </label>
      <small className="muted">
        チェックすると、勘定科目を確定させず仮の科目で計上し、「確認」タグを付けて送信します。1つの科目で処理してよい場合はチェックを外してください。
      </small>
      <div className="action-row">
        <button
          className="secondary-action compact"
          type="submit"
          disabled={disabled}
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
      </div>
      {notice?.status === "success" && (
        <small className="success-text">{notice.message}</small>
      )}
      {(notice?.status === "error" ||
        notice?.status === "locked" ||
        notice?.status === "conflict") && (
        <small className="warning-text">{notice.message}</small>
      )}
    </form>
  );
}
