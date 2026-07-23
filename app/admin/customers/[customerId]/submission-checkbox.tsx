"use client";

import { useSubmissionSelection } from "./submission-selection-context";

export function SubmissionCheckbox({ submissionId }: { submissionId: string }) {
  const { isSelected, toggle } = useSubmissionSelection();

  return (
    <input
      type="checkbox"
      className="submission-select-checkbox"
      checked={isSelected(submissionId)}
      onChange={() => toggle(submissionId)}
      aria-label="この資料を選択"
    />
  );
}
