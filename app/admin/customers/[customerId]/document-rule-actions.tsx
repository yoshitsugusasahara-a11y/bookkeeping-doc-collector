"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { deleteDocumentRuleById, toggleDocumentRuleActive } from "./actions";

export function DocumentRuleActions({
  customerId,
  ruleId,
  isActive,
}: {
  customerId: string;
  ruleId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleToggle() {
    if (isToggling || isDeleting) return;
    setIsToggling(true);
    try {
      await toggleDocumentRuleActive(customerId, ruleId, isActive);
      router.refresh();
    } catch (error) {
      console.error("Failed to toggle document rule", error);
    } finally {
      setIsToggling(false);
    }
  }

  async function handleDelete() {
    if (isToggling || isDeleting) return;
    if (!window.confirm("この資料分類ルールを削除しますか？")) return;

    setIsDeleting(true);
    try {
      await deleteDocumentRuleById(customerId, ruleId);
      router.refresh();
    } catch (error) {
      console.error("Failed to delete document rule", error);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="rule-actions">
      <button
        className="secondary-action compact-action"
        type="button"
        onClick={handleToggle}
        disabled={isToggling || isDeleting}
      >
        {isToggling ? (
          <Loader2 className="spin-icon" size={15} />
        ) : isActive ? (
          "無効化"
        ) : (
          "有効化"
        )}
      </button>
      <button
        className="icon-button"
        type="button"
        aria-label="削除"
        onClick={handleDelete}
        disabled={isToggling || isDeleting}
      >
        {isDeleting ? (
          <Loader2 className="spin-icon" size={15} />
        ) : (
          <Trash2 size={17} />
        )}
      </button>
    </div>
  );
}
