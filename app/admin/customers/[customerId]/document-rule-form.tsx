"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Loader2, PlusCircle } from "lucide-react";
import { createDocumentRule, type DocumentRuleState } from "./actions";

const initialState: DocumentRuleState = { status: "idle", message: "" };

export function DocumentRuleForm({ customerId }: { customerId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [state, setState] = useState<DocumentRuleState>(initialState);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    setState(initialState);
    setIsSaving(true);

    try {
      const result = await createDocumentRule(
        new FormData(event.currentTarget),
      );
      setState(result);

      if (result.status === "success") {
        formRef.current?.reset();
        setTimeout(() => window.location.reload(), 700);
        return;
      }
    } catch (error) {
      console.error("Failed to create document rule", error);
      setState({
        status: "error",
        message: "資料分類ルールの保存に失敗しました。時間をおいて再度お試しください。",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      ref={formRef}
      className="document-rule-form"
      onSubmit={handleSubmit}
    >
      <input type="hidden" name="customerId" value={customerId} />
      <label className="field">
        <span>資料名</span>
        <input name="documentName" placeholder="例: 株式会社山本商店の請求書" disabled={isSaving} />
      </label>
      <label className="field">
        <span>ファイル名ルール</span>
        <input name="fileNameRule" placeholder="例: YYYYMM_山本商店_請求書.pdf" disabled={isSaving} />
      </label>
      <label className="field">
        <span>特徴・判定キーワード</span>
        <textarea
          name="matchFeatures"
          placeholder="例: 株式会社山本商店、御請求書、毎月発行される仕入請求書"
          rows={3}
          disabled={isSaving}
        />
      </label>
      <label className="field">
        <span>保存先フォルダID</span>
        <input name="driveFolderId" placeholder="Google DriveフォルダID" disabled={isSaving} />
      </label>
      <label className="field">
        <span>保存先フォルダ表示名</span>
        <input name="driveFolderName" placeholder="例: 山本商店請求書フォルダ" disabled={isSaving} />
      </label>
      <button className="primary-action" type="submit" disabled={isSaving}>
        {isSaving ? (
          <>
            <Loader2 className="spin-icon" size={18} />
            保存中です
          </>
        ) : (
          <>
            <PlusCircle size={18} />
            資料ルールを追加
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
