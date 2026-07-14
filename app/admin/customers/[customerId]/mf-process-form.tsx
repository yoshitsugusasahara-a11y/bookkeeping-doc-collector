"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, PlayCircle, XCircle } from "lucide-react";
import {
  listPendingMfSubmissions,
  processSingleMfSubmission,
} from "./actions";

type ItemStatus = "pending" | "processing" | "success" | "error";

type ItemResult = {
  id: string;
  fileName: string;
  status: ItemStatus;
  message?: string;
};

export function MfProcessForm({ customerId }: { customerId: string }) {
  const [isRunning, setIsRunning] = useState(false);
  const [items, setItems] = useState<ItemResult[]>([]);
  const [notice, setNotice] = useState<{
    status: "success" | "error";
    message: string;
  } | null>(null);

  const completedCount = items.filter(
    (item) => item.status === "success" || item.status === "error",
  ).length;

  async function run() {
    if (isRunning) return;

    setIsRunning(true);
    setItems([]);
    setNotice(null);

    try {
      const listed = await listPendingMfSubmissions(customerId);

      if (listed.status === "error") {
        setNotice({ status: "error", message: listed.message });
        return;
      }

      if (listed.submissions.length === 0) {
        setNotice({
          status: "success",
          message: "処理対象の送信はありませんでした。",
        });
        return;
      }

      setItems(
        listed.submissions.map((submission) => ({
          id: submission.id,
          fileName: submission.fileName,
          status: "pending" as const,
        })),
      );

      let successCount = 0;
      let failedCount = 0;

      for (const submission of listed.submissions) {
        setItems((previous) =>
          previous.map((item) =>
            item.id === submission.id
              ? { ...item, status: "processing" }
              : item,
          ),
        );

        const result = await processSingleMfSubmission(
          customerId,
          submission.id,
        );

        if (result.status === "success") {
          successCount += 1;
        } else {
          failedCount += 1;
        }

        setItems((previous) =>
          previous.map((item) =>
            item.id === submission.id
              ? { ...item, status: result.status, message: result.message }
              : item,
          ),
        );
      }

      setNotice({
        status: failedCount > 0 ? "error" : "success",
        message: `完了しました。成功 ${successCount}件 / 失敗 ${failedCount}件`,
      });
      setTimeout(() => window.location.reload(), 700);
      return;
    } catch (error) {
      console.error("MF batch processing failed", error);
      setNotice({
        status: "error",
        message: "処理中にエラーが発生しました。時間をおいて再度お試しください。",
      });
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div>
      <button
        className="primary-action"
        type="button"
        onClick={run}
        disabled={isRunning}
      >
        {isRunning ? (
          <>
            <Loader2 className="spin-icon" size={18} />
            処理中です（{completedCount}/{items.length}件）
          </>
        ) : (
          <>
            <PlayCircle size={18} />
            MF送信処理実行
          </>
        )}
      </button>

      {items.length > 0 && (
        <div className="document-rule-list" aria-live="polite">
          {items.map((item) => (
            <div className="status-line" key={item.id}>
              {item.status === "processing" && (
                <Loader2 className="spin-icon" size={15} />
              )}
              {item.status === "success" && (
                <CheckCircle2 size={15} color="#2e7d32" />
              )}
              {item.status === "error" && <XCircle size={15} color="#c62828" />}
              {item.status === "pending" && <span style={{ width: 15 }} />}
              <small
                className={
                  item.status === "error"
                    ? "warning-text"
                    : item.status === "pending"
                      ? "muted"
                      : undefined
                }
              >
                {item.fileName}
                {item.status === "processing" && " — 送信中..."}
                {item.status === "error" && item.message
                  ? ` — ${item.message}`
                  : ""}
              </small>
            </div>
          ))}
        </div>
      )}

      {notice && (
        <p
          className={
            notice.status === "success" ? "form-message success" : "warning-text"
          }
        >
          {notice.status === "success" && <CheckCircle2 size={16} />}
          {notice.message}
        </p>
      )}
    </div>
  );
}
