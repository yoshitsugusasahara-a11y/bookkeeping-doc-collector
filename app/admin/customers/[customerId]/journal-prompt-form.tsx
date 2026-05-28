"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import {
  type JournalPromptState,
  updateCustomerJournalPrompt,
} from "./actions";

type JournalPromptFormProps = {
  customerId: string;
  journalPrompt: string | null;
};

const initialState: JournalPromptState = {
  status: "idle",
  message: "",
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="primary-action" type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="spin-icon" size={18} />
          保存中です
        </>
      ) : (
        <>
          <Save size={18} />
          仕訳生成指示を保存
        </>
      )}
    </button>
  );
}

export function JournalPromptForm({
  customerId,
  journalPrompt,
}: JournalPromptFormProps) {
  const [state, action] = useActionState(
    updateCustomerJournalPrompt,
    initialState,
  );

  return (
    <form className="drive-form" action={action}>
      <input type="hidden" name="customerId" value={customerId} />
      <label className="field">
        <span>仕訳生成指示</span>
        <textarea
          name="journalPrompt"
          defaultValue={journalPrompt || ""}
          placeholder="例: 貸方科目は事業主借とする。判断が難しい仕訳にはタグとして「要確認」をつける。"
          rows={7}
        />
      </label>
      <div className="prompt-examples">
        <strong>入力例</strong>
        <ul>
          <li>貸方科目は事業主借とする。</li>
          <li>○○商店で購入した食品以外の商品は仕入高とする。</li>
          <li>仕訳の判断が難しい場合はタグとして「要確認」をつける。</li>
        </ul>
      </div>
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
