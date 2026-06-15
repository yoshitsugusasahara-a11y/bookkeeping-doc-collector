"use client";

import { useFormStatus } from "react-dom";
import { Loader2, Send } from "lucide-react";

function MfSendButton({
  disabled,
  completed,
}: {
  disabled: boolean;
  completed: boolean;
}) {
  const { pending } = useFormStatus();

  if (disabled) {
    return (
      <button
        className="primary-action compact disabled-action"
        type="button"
        disabled
      >
        <Send size={15} />
        {completed ? "送信完了" : "MF送信不可"}
      </button>
    );
  }

  return (
    <button className="primary-action compact" type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="spin-icon" size={15} />
          MF送信中
        </>
      ) : (
        <>
          <Send size={15} />
          MF送信
        </>
      )}
    </button>
  );
}

export function MoneyForwardSendButton({
  disabled,
  completed = false,
}: {
  disabled: boolean;
  completed?: boolean;
}) {
  return <MfSendButton disabled={disabled} completed={completed} />;
}
