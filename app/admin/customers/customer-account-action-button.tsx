"use client";

import { useFormStatus } from "react-dom";
import { Check, Loader2, PauseCircle, RotateCcw, Trash2 } from "lucide-react";

type CustomerAccountAction = "approve" | "suspend" | "resume" | "delete";

const actionConfig = {
  approve: {
    label: "承認",
    pendingLabel: "承認中...",
    Icon: Check,
  },
  suspend: {
    label: "利用停止",
    pendingLabel: "利用停止中...",
    Icon: PauseCircle,
  },
  resume: {
    label: "利用再開",
    pendingLabel: "利用再開中...",
    Icon: RotateCcw,
  },
  delete: {
    label: "削除",
    pendingLabel: "削除中...",
    Icon: Trash2,
  },
} satisfies Record<
  CustomerAccountAction,
  {
    label: string;
    pendingLabel: string;
    Icon: typeof Check;
  }
>;

export function CustomerAccountActionButton({
  action,
  className,
}: {
  action: CustomerAccountAction;
  className: string;
}) {
  const { pending } = useFormStatus();
  const { label, pendingLabel, Icon } = actionConfig[action];

  return (
    <button
      aria-busy={pending}
      className={className}
      disabled={pending}
      type="submit"
    >
      {pending ? (
        <>
          <Loader2 className="spin-icon" size={16} />
          {pendingLabel}
        </>
      ) : (
        <>
          <Icon size={16} />
          {label}
        </>
      )}
    </button>
  );
}
