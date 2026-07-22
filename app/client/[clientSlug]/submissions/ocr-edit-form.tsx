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
