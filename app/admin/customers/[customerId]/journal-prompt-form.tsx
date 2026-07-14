"use client";

import { useState } from "react";
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

export function JournalPromptForm({
  customerId,
  journalPrompt,
}: JournalPromptFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [state, setState] = useState<JournalPromptState>(initialState);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    setState(initialState);
    setIsSaving(true);

    try {
      const result = await updateCustomerJournalPrompt(
        initialState,
        new FormData(event.currentTarget),
      );
      setState(result);

      if (result.status === "success") {
        setTimeout(() => window.location.reload(), 700);
        return;
      }
    } catch (error) {
      console.error("Failed to save journal prompt", error);
      setState({
        status: "error",
        message: "仕訳生成指示の保存に失敗しました。時間をおいて再度お試しください。",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="drive-form" onSubmit={handleSubmit}>
      <input type="hidden" name="customerId" value={customerId} />
      <label className="field">
        <span>仕訳生成指示</span>
        <textarea
          name="journalPrompt"
          defaultValue={journalPrompt || ""}
          placeholder="例: 貸方科目は事業主借とする。判断が難しい仕訳にはタグとして「要確認」をつける。"
          rows={7}
          disabled={isSaving}
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
      <button className="primary-action" type="submit" disabled={isSaving}>
        {isSaving ? (
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
