"use client";

import { useState } from "react";
import { Check, Loader2, PauseCircle, RotateCcw } from "lucide-react";
import {
  approveCustomerAccount,
  resumeCustomerAccount,
  suspendCustomerAccount,
} from "./actions";

type ToggleAction = "approve" | "suspend" | "resume";

const actionConfig = {
  approve: {
    label: "承認",
    pendingLabel: "承認中...",
    Icon: Check,
    run: approveCustomerAccount,
  },
  suspend: {
    label: "利用停止",
    pendingLabel: "利用停止中...",
    Icon: PauseCircle,
    run: suspendCustomerAccount,
  },
  resume: {
    label: "利用再開",
    pendingLabel: "利用再開中...",
    Icon: RotateCcw,
    run: resumeCustomerAccount,
  },
} satisfies Record<
  ToggleAction,
  {
    label: string;
    pendingLabel: string;
    Icon: typeof Check;
    run: (accountId: string) => Promise<void>;
  }
>;

export function CustomerAccountToggleButton({
  action,
  accountId,
  className,
}: {
  action: ToggleAction;
  accountId: string;
  className: string;
}) {
  const [isPending, setIsPending] = useState(false);
  const { label, pendingLabel, Icon, run } = actionConfig[action];

  async function handleClick() {
    if (isPending) return;
    setIsPending(true);
    try {
      await run(accountId);
      window.location.reload();
    } catch (error) {
      console.error(`Failed to ${action} customer account`, error);
      setIsPending(false);
    }
  }

  return (
    <button
      aria-busy={isPending}
      className={className}
      disabled={isPending}
      type="button"
      onClick={handleClick}
    >
      {isPending ? (
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
