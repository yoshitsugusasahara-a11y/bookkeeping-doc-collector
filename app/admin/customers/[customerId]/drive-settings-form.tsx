"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  type DriveSettingsState,
  updateCustomerDriveSettings,
} from "./actions";

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
        "Drive設定を保存"
      )}
    </button>
  );
}

export function DriveSettingsForm({
  customerId,
  driveFolderId,
  driveFolderName,
  errorDriveFolderId,
  errorDriveFolderName,
}: DriveSettingsFormProps) {
  const [state, action] = useActionState(
    updateCustomerDriveSettings,
    initialState,
  );

  return (
    <form className="drive-form" action={action}>
      <input type="hidden" name="customerId" value={customerId} />
      <label className="field">
        <span>保存先フォルダID</span>
        <input
          name="driveFolderId"
          defaultValue={driveFolderId || ""}
          placeholder="例: 1AbCdEfGhIjKlMnOpQrStUvWxYz"
        />
      </label>
      <label className="field">
        <span>保存先表示名</span>
        <input
          name="driveFolderName"
          defaultValue={driveFolderName || ""}
          placeholder="例: 東京商会 証憑フォルダ"
        />
      </label>
      <label className="field">
        <span>エラー用フォルダID</span>
        <input
          name="errorDriveFolderId"
          defaultValue={errorDriveFolderId || ""}
          placeholder="例: エラー証憑用のGoogle DriveフォルダID"
        />
      </label>
      <label className="field">
        <span>エラー用表示名</span>
        <input
          name="errorDriveFolderName"
          defaultValue={errorDriveFolderName || ""}
          placeholder="例: 東京商会 エラー証憑フォルダ"
        />
      </label>
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
