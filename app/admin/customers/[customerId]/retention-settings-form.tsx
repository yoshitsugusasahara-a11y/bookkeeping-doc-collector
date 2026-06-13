"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, DatabaseZap, Loader2 } from "lucide-react";
import {
  type RetentionSettingsState,
  updateCustomerRetentionSettings,
} from "./actions";

type RetentionSettingsFormProps = {
  customerId: string;
  submissionRetentionLimit: number;
};

const initialState: RetentionSettingsState = {
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
          保存・整理中です
        </>
      ) : (
        <>
          <DatabaseZap size={18} />
          保存上限を保存
        </>
      )}
    </button>
  );
}

export function RetentionSettingsForm({
  customerId,
  submissionRetentionLimit,
}: RetentionSettingsFormProps) {
  const [state, action] = useActionState(
    updateCustomerRetentionSettings,
    initialState,
  );

  return (
    <form className="drive-form" action={action}>
      <input type="hidden" name="customerId" value={customerId} />
      <label className="field">
        <span>アプリ内に残す資料数</span>
        <input
          name="submissionRetentionLimit"
          type="number"
          min={1}
          max={5000}
          step={1}
          defaultValue={submissionRetentionLimit}
        />
      </label>
      <p className="muted">
        上限を超えた古い履歴、サムネイル、一時保存ファイルをSupabaseから削除します。
        Google Driveに保存済みのファイルは削除しません。
      </p>
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
