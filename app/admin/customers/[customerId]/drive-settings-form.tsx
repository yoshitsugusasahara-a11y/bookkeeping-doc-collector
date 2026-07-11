"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { updateCustomerDriveSettings, type DriveSettingsState } from "./actions";

type DriveSettingsFormProps = {
  customerId: string;
  driveFolderId: string | null;
  driveFolderName: string | null;
  errorDriveFolderId: string | null;
  errorDriveFolderName: string | null;
};

const initialState: DriveSettingsState = {
  status: "idle",
  message: "",
};

export function DriveSettingsForm({
  customerId,
  driveFolderId,
  driveFolderName,
  errorDriveFolderId,
  errorDriveFolderName,
}: DriveSettingsFormProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [state, setState] = useState<DriveSettingsState>(initialState);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    setState(initialState);
    setIsSaving(true);

    try {
      const result = await updateCustomerDriveSettings(
        initialState,
        new FormData(event.currentTarget),
      );
      setState(result);

      if (result.status === "success") {
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to save Drive settings", error);
      setState({
        status: "error",
        message: "Drive設定の保存に失敗しました。時間をおいて再度お試しください。",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="drive-form" onSubmit={handleSubmit}>
      <input type="hidden" name="customerId" value={customerId} />
      <label className="field">
        <span>保存先フォルダID</span>
        <input
          name="driveFolderId"
          defaultValue={driveFolderId || ""}
          placeholder="例: 1AbCdEfGhIjKlMnOpQrStUvWxYz"
          disabled={isSaving}
        />
      </label>
      <label className="field">
        <span>保存先表示名</span>
        <input
          name="driveFolderName"
          defaultValue={driveFolderName || ""}
          placeholder="例: 東京商会 証憑フォルダ"
          disabled={isSaving}
        />
      </label>
      <label className="field">
        <span>エラー用フォルダID</span>
        <input
          name="errorDriveFolderId"
          defaultValue={errorDriveFolderId || ""}
          placeholder="例: エラー証憑用のGoogle DriveフォルダID"
          disabled={isSaving}
        />
      </label>
      <label className="field">
        <span>エラー用表示名</span>
        <input
          name="errorDriveFolderName"
          defaultValue={errorDriveFolderName || ""}
          placeholder="例: 東京商会 エラー証憑フォルダ"
          disabled={isSaving}
        />
      </label>
      <button className="primary-action" type="submit" disabled={isSaving}>
        {isSaving ? (
          <>
            <Loader2 className="spin-icon" size={18} />
            保存中です
          </>
        ) : (
          "Drive設定を保存"
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
