"use client";

import { useFormStatus } from "react-dom";
import { Loader2, PlusCircle } from "lucide-react";
import { createDocumentRule } from "./actions";

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
          <PlusCircle size={18} />
          資料ルールを追加
        </>
      )}
    </button>
  );
}

export function DocumentRuleForm({ customerId }: { customerId: string }) {
  return (
    <form className="document-rule-form" action={createDocumentRule}>
      <input type="hidden" name="customerId" value={customerId} />
      <label className="field">
        <span>資料名</span>
        <input name="documentName" placeholder="例: 株式会社山本商店の請求書" />
      </label>
      <label className="field">
        <span>ファイル名ルール</span>
        <input name="fileNameRule" placeholder="例: YYYYMM_山本商店_請求書.pdf" />
      </label>
      <label className="field">
        <span>特徴・判定キーワード</span>
        <textarea
          name="matchFeatures"
          placeholder="例: 株式会社山本商店、御請求書、毎月発行される仕入請求書"
          rows={3}
        />
      </label>
      <label className="field">
        <span>保存先フォルダID</span>
        <input name="driveFolderId" placeholder="Google DriveフォルダID" />
      </label>
      <label className="field">
        <span>保存先フォルダ表示名</span>
        <input name="driveFolderName" placeholder="例: 山本商店請求書フォルダ" />
      </label>
      <SubmitButton />
    </form>
  );
}
