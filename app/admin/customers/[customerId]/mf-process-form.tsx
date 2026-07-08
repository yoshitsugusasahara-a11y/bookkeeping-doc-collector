"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2, PlayCircle } from "lucide-react";
import { runMoneyForwardSubmissionProcess, type MfProcessState } from "./actions";

const initialState: MfProcessState = { status: "idle", message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="primary-action" type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="spin-icon" size={18} />
          処理中です
        </>
      ) : (
        <>
          <PlayCircle size={18} />
          MF送信処理実行
        </>
      )}
    </button>
  );
}

export function MfProcessForm({ customerId }: { customerId: string }) {
  const [state, action] = useActionState(
    runMoneyForwardSubmissionProcess,
    initialState,
  );

  return (
    <form action={action}>
      <input type="hidden" name="customerId" value={customerId} />
      <SubmitButton />
      {state.status !== "idle" && (
        <p
          className={
            state.status === "success" ? "form-message success" : "warning-text"
          }
        >
          {state.status === "success" && <CheckCircle2 size={16} />}
          {state.message}
        </p>
      )}
    </form>
  );
}
