"use client";

import { useState } from "react";
import { Loader2, RefreshCw, Send } from "lucide-react";
import { rerunSubmissionOcr, sendSubmissionToMoneyForward } from "../actions";

/**
 * 資料を読み取り直すボタン。
 * 仕訳生成指示を変更しても既存の資料の読み取り結果には反映されないため、
 * 現在の設定で作り直すための操作。手修正した内容は上書きされる。
 */
export function RerunOcrButton({
  clientSlug,
  submissionId,
  disabled,
}: {
  clientSlug: string;
  submissionId: string;
  disabled: boolean;
}) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (isRunning) return;
    if (
      !window.confirm(
        "この資料を現在の設定で読み取り直します。手修正した読み取り結果は上書きされます。よろしいですか？",
      )
    ) {
      return;
    }

    setError(null);
    setIsRunning(true);

    try {
      const result = await rerunSubmissionOcr(clientSlug, submissionId);
      if (result.status === "success") {
        window.location.reload();
        return;
      }
      setError(result.message || "読み取り直しに失敗しました。");
    } catch (rerunError) {
      console.error("Failed to rerun OCR", rerunError);
      setError("読み取り直しに失敗しました。時間をおいて再度お試しください。");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div>
      <button
        className="secondary-action compact"
        type="button"
        onClick={handleClick}
        disabled={disabled || isRunning}
      >
        {isRunning ? (
          <>
            <Loader2 className="spin-icon" size={15} />
            読み取り中
          </>
        ) : (
          <>
            <RefreshCw size={15} />
            読み取り直す
          </>
        )}
      </button>
      {error && <small className="warning-text">{error}</small>}
    </div>
  );
}

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
