"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<{
    status: "success" | "error" | "locked";
    message: string;
  } | null>(null);
  const [state, formAction, isPending] = useActionState(
    updateSubmissionOcr.bind(null, clientSlug),
    initialState,
  );

  useEffect(() => {
    if (!state.message || state.status === "idle") return;

    setNotice({
      status: state.status,
      message: state.message,
    });

    if (state.status === "success") {
      const refreshTimer = window.setTimeout(() => {
        router.refresh();
      }, 1200);

      return () => window.clearTimeout(refreshTimer);
    }
  }, [router, state.status, state.updatedAt]);

  const disabled = isSent || isPending;
  const paymentMethod =
    ocrPaymentMethod || (ocrIsCreditCard ? "credit_card" : "cash");

  return (
    <form
      className={isSent ? "ocr-edit-form locked" : "ocr-edit-form"}
      action={formAction}
      onSubmit={() => setNotice(null)}
    >
      <input type="hidden" name="submissionId" value={submissionId} />
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
          {isPending ? (
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
      {(notice?.status === "error" || notice?.status === "locked") && (
        <small className="warning-text">{notice.message}</small>
      )}
    </form>
  );
}
