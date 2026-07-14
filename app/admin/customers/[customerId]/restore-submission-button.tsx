"use client";

import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { restoreSubmission } from "./actions";

export function RestoreSubmissionButton({
  customerId,
  submissionId,
}: {
  customerId: string;
  submissionId: string;
}) {
  const [isRestoring, setIsRestoring] = useState(false);

  async function handleClick() {
    if (isRestoring) return;
    setIsRestoring(true);
    try {
      await restoreSubmission(customerId, submissionId);
      window.location.reload();
    } catch (error) {
      console.error("Failed to restore submission", error);
      setIsRestoring(false);
    }
  }

  return (
    <button
      className="secondary-action compact-action"
      type="button"
      onClick={handleClick}
      disabled={isRestoring}
    >
      {isRestoring ? (
        <Loader2 className="spin-icon" size={16} />
      ) : (
        <RotateCcw size={16} />
      )}
      復元する
    </button>
  );
}
