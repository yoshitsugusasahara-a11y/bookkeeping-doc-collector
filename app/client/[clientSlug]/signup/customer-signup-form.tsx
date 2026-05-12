"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { registerCustomerAccount } from "./actions";

type CustomerSignupFormProps = {
  clientSlug: string;
  email: string;
};

export function CustomerSignupForm({
  clientSlug,
  email,
}: CustomerSignupFormProps) {
  const [state, formAction, isPending] = useActionState(
    registerCustomerAccount.bind(null, clientSlug),
    { message: "" },
  );

  return (
    <form className="stack-form" action={formAction}>
      <label className="field">
        <span>メールアドレス</span>
        <input value={email} readOnly />
      </label>
      <label className="field">
        <span>顧客名</span>
        <input
          name="customerName"
          placeholder="例: 東京商会"
          required
          maxLength={80}
        />
      </label>
      <button className="primary-action" type="submit" disabled={isPending}>
        <UserPlus size={20} />
        <span>{isPending ? "登録中..." : "承認申請する"}</span>
      </button>
      {state.message && <p className="form-error">{state.message}</p>}
    </form>
  );
}
