"use client";

import { useFormStatus } from "react-dom";
import { Loader2, PlayCircle } from "lucide-react";
import { runMoneyForwardSubmissionProcess } from "./actions";

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
  return (
    <form action={runMoneyForwardSubmissionProcess}>
      <input type="hidden" name="customerId" value={customerId} />
      <SubmitButton />
    </form>
  );
}
