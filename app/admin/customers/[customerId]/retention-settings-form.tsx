"use client";

import { useState } from "react";
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

export function RetentionSettingsForm({
  customerId,
  submissionRetentionLimit,
}: RetentionSettingsFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [state, setState] = useState<RetentionSettingsState>(initialState);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    setState(initialState);
    setIsSaving(true);

    try {
      const result = await updateCustomerRetentionSettings(
        initialState,
        new FormData(event.currentTarget),
      );
      setState(result);

      if (result.status === "success") {
        setTimeout(() => window.location.reload(), 700);
        return;
      }
    } catch (error) {
      console.error("Failed to save retention settings", error);
      setState({
        status: "error",
        message: "保存上限の保存に失敗しました。時間をおいて再度お試しください。",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="drive-form" onSubmit={handleSubmit}>
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
          disabled={isSaving}
        />
      </label>
      <p className="muted">
        上限を超えた古い履歴、サムネイル、一時保存ファイルをSupabaseから削除します。
        Google Driveに保存済みのファイルは削除しません。
      </p>
      <button className="primary-action" type="submit" disabled={isSaving}>
        {isSaving ? (
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
