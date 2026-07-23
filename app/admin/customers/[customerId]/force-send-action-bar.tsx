"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { forceSendJournalOnlyAsAdmin } from "./actions";
import { useSubmissionSelection } from "./submission-selection-context";

type Progress = {
  done: number;
  total: number;
  success: number;
  skipped: number;
  failed: number;
};

export function ForceSendActionBar({
  customerId,
  submissionIds,
}: {
  customerId: string;
  submissionIds: string[];
}) {
  const { selectedIds, selectAll } = useSubmissionSelection();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);

  const allSelected =
    submissionIds.length > 0 &&
    submissionIds.every((id) => selectedIds.includes(id));

  async function handleForceSend() {
    if (isRunning || selectedIds.length === 0) return;
    if (
      !window.confirm(
        `選択した${selectedIds.length}件について、証憑ファイルを添付せずに現在の読み取り結果だけで仕訳を送信します。よろしいですか？`,
      )
    ) {
      return;
    }

    setIsRunning(true);
    const total = selectedIds.length;
    let success = 0;
    let skipped = 0;
    let failed = 0;
    setProgress({ done: 0, total, success, skipped, failed });

    for (const submissionId of selectedIds) {
      try {
        const result = await forceSendJournalOnlyAsAdmin(
          customerId,
          submissionId,
        );
        if (result.status === "success") success += 1;
        else if (result.status === "skipped") skipped += 1;
        else failed += 1;
      } catch (error) {
        console.error("Failed to force send journal", error);
        failed += 1;
      }
      setProgress({ done: success + skipped + failed, total, success, skipped, failed });
    }

    setIsRunning(false);
    setTimeout(() => window.location.reload(), 1500);
  }

  return (
    <div className="account-control-actions">
      <label>
        <input
          type="checkbox"
          checked={allSelected}
          onChange={() => selectAll(submissionIds)}
          disabled={isRunning}
        />
        全て選択
      </label>
      <span className="muted">選択中: {selectedIds.length}件</span>
      <button
        className="danger-action compact-action"
        type="button"
        onClick={handleForceSend}
        disabled={isRunning || selectedIds.length === 0}
      >
        {isRunning ? (
          <>
            <Loader2 className="spin-icon" size={15} />
            送信中{progress ? `（${progress.done}/${progress.total}）` : ""}
          </>
        ) : (
          "証憑なしで強制送信"
        )}
      </button>
      {progress && !isRunning && (
        <small className="muted">
          成功{progress.success}件 / スキップ{progress.skipped}件 / 失敗
          {progress.failed}件
        </small>
      )}
    </div>
  );
}
