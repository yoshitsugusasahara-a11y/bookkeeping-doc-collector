"use client";

import { Trash2 } from "lucide-react";

export function DeleteSubmissionButton({
  label = "この送信履歴を削除",
}: {
  label?: string;
}) {
  return (
    <button
      className="icon-button"
      type="submit"
      aria-label={label}
      onClick={(event) => {
        if (
          !window.confirm(
            "このレシートを削除しますか？（ゴミ箱に移動され、後で復元できます）",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <Trash2 size={17} />
    </button>
  );
}
