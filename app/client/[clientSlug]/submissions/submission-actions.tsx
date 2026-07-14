"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { sendSubmissionToMoneyForward } from "../actions";

export function MoneyForwardSendButton({
  clientSlug,
  submissionId,
  disabled,
  completed = false,
}: {
  clientSlug: string;
  submissionId: string;
  disabled: boolean;
  completed?: boolean;
}) {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (isSending) return;
    setError(null);
    setIsSending(true);

    try {
      const result = await sendSubmissionToMoneyForward(
        clientSlug,
        submissionId,
      );

      if (result.status === "success") {
        window.location.reload();
        return;
      }

      setError(result.message || "マネーフォワードへの送信に失敗しました。");
    } catch (sendError) {
      console.error("Failed to send to Money Forward", sendError);
      setError("マネーフォワードへの送信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setIsSending(false);
    }
  }

  if (disabled) {
    return (
      <button
        className="primary-action compact disabled-action"
        type="button"
        disabled
      >
        <Send size={15} />
        {completed ? "送信完了" : "MF送信不可"}
      </button>
    );
  }

  return (
    <div>
      <button
        className="primary-action compact"
        type="button"
        onClick={handleClick}
        disabled={isSending}
      >
        {isSending ? (
          <>
            <Loader2 className="spin-icon" size={15} />
            MF送信中
          </>
        ) : (
          <>
            <Send size={15} />
            MF送信
          </>
        )}
      </button>
      {error && <small className="warning-text">{error}</small>}
    </div>
  );
}
