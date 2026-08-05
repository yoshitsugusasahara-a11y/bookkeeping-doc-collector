"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Check, Loader2, Undo2 } from "lucide-react";
import { setSubmissionApproval } from "../actions";

type SelectionValue = {
  selectedIds: string[];
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  selectAll: (ids: string[]) => void;
};

const SelectionContext = createContext<SelectionValue | null>(null);

export function ApprovalSelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }, []);

  const value = useMemo<SelectionValue>(
    () => ({
      selectedIds: Array.from(selected),
      isSelected: (id: string) => selected.has(id),
      toggle,
      selectAll,
    }),
    [selected, toggle, selectAll],
  );

  return (
    <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
  );
}

function useSelection() {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error("ApprovalSelectionProvider is required");
  }
  return context;
}

/** 一括操作の対象にするためのチェックボックス。 */
export function SubmissionSelectCheckbox({
  submissionId,
  label,
}: {
  submissionId: string;
  label: string;
}) {
  const { isSelected, toggle } = useSelection();

  return (
    <span className="checkbox-line">
      <input
        type="checkbox"
        checked={isSelected(submissionId)}
        onChange={() => toggle(submissionId)}
        aria-label={label}
      />
      <span className="muted">まとめて操作する</span>
    </span>
  );
}

/** 資料ごとの承認・承認取り消しボタン（自動送信＋承認モードでのみ表示）。 */
export function ApprovalButton({
  clientSlug,
  submissionId,
  approvedAt,
  disabled,
}: {
  clientSlug: string;
  submissionId: string;
  approvedAt: string | null;
  disabled: boolean;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const isApproved = Boolean(approvedAt);

  async function handleClick() {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const result = await setSubmissionApproval(
        clientSlug,
        [submissionId],
        !isApproved,
      );
      if (result.status === "success") {
        window.location.reload();
        return;
      }
      window.alert(result.message ?? "承認状態を保存できませんでした。");
    } catch (error) {
      console.error("Failed to update approval", error);
      window.alert("承認状態を保存できませんでした。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <button
      className={isApproved ? "secondary-action compact" : "primary-action"}
      type="button"
      onClick={handleClick}
      disabled={disabled || isSaving}
    >
      {isSaving ? (
        <Loader2 className="spin-icon" size={16} />
      ) : isApproved ? (
        <Undo2 size={16} />
      ) : (
        <Check size={18} />
      )}
      <span>{isApproved ? "承認を取り消す" : "承認する"}</span>
    </button>
  );
}

/**
 * 選択した資料をまとめて承認する。
 *
 * 一括操作は承認モードでのみ提供する。都度送信モードで一括送信を許すと、
 * 内容を確認しないまま一度に送れてしまい、既定を都度送信にしている意味がなくなる。
 */
export function BulkApprovalBar({
  clientSlug,
  selectableIds,
}: {
  clientSlug: string;
  selectableIds: string[];
}) {
  const { selectedIds, selectAll } = useSelection();
  const [isRunning, setIsRunning] = useState(false);

  const allSelected =
    selectableIds.length > 0 &&
    selectableIds.every((id) => selectedIds.includes(id));

  async function handleRun() {
    if (isRunning || selectedIds.length === 0) return;

    if (
      !window.confirm(
        `選択した${selectedIds.length}件を承認します。承認した仕訳はマネーフォワードへ送信されます。よろしいですか？`,
      )
    ) {
      return;
    }

    setIsRunning(true);

    try {
      const result = await setSubmissionApproval(clientSlug, selectedIds, true);
      if (result.status === "error") {
        window.alert(result.message ?? "承認できませんでした。");
        return;
      }
      window.location.reload();
    } catch (error) {
      console.error("Bulk approval failed", error);
      window.alert("処理中にエラーが発生しました。");
    } finally {
      setIsRunning(false);
    }
  }

  if (selectableIds.length === 0) return null;

  return (
    <div className="account-control-actions">
      <label className="checkbox-line">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={() => selectAll(selectableIds)}
          disabled={isRunning}
        />
        <span>この画面の{selectableIds.length}件を全て選択</span>
      </label>
      <span className="muted">選択中: {selectedIds.length}件</span>
      <button
        className="primary-action"
        type="button"
        onClick={handleRun}
        disabled={isRunning || selectedIds.length === 0}
      >
        {isRunning ? (
          <Loader2 className="spin-icon" size={18} />
        ) : (
          <Check size={18} />
        )}
        <span>
          {isRunning ? "承認中" : `選択した${selectedIds.length}件を承認`}
        </span>
      </button>
    </div>
  );
}
