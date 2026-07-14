"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

export function DeleteSubmissionButton({
  action,
  args,
  label = "この送信履歴を削除",
}: {
  action: (arg1: string, arg2: string) => Promise<void>;
  args: [string, string];
  label?: string;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleClick() {
    if (isDeleting) return;
    if (
      !window.confirm(
        "このレシートを削除しますか？（ゴミ箱に移動され、後で復元できます）",
      )
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      await action(args[0], args[1]);
      window.location.reload();
    } catch (error) {
      console.error("Failed to delete submission", error);
      setIsDeleting(false);
    }
  }

  return (
    <button
      className="icon-button"
      type="button"
      aria-label={label}
      onClick={handleClick}
      disabled={isDeleting}
    >
      {isDeleting ? (
        <Loader2 className="spin-icon" size={17} />
      ) : (
        <Trash2 size={17} />
      )}
    </button>
  );
}
