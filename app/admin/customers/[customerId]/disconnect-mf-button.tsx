"use client";

import { useState } from "react";
import { Link2Off, Loader2 } from "lucide-react";
import { disconnectMoneyForward } from "./actions";

export function DisconnectMfButton({ customerId }: { customerId: string }) {
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    if (isPending) return;
    if (!window.confirm("マネーフォワード連携を解除しますか？")) return;

    setIsPending(true);
    try {
      await disconnectMoneyForward(customerId);
      window.location.reload();
    } catch (error) {
      console.error("Failed to disconnect Money Forward", error);
      setIsPending(false);
    }
  }

  return (
    <button
      className="danger-action"
      type="button"
      onClick={handleClick}
      disabled={isPending}
    >
      {isPending ? (
        <Loader2 className="spin-icon" size={18} />
      ) : (
        <Link2Off size={18} />
      )}
      MF連携を解除
    </button>
  );
}
