"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ToggleSwitch } from "@/components/toggle-switch";
import { SKIP_APPROVAL_CONSENT_TEXT } from "@/lib/receipts/send-mode";
import { updateAutoSendEnabled, updateSkipApproval } from "../actions";

export function SendModeForm({
  clientSlug,
  autoSendEnabled,
  skipApproval,
  skipApprovalConsentedAt,
}: {
  clientSlug: string;
  autoSendEnabled: boolean;
  skipApproval: boolean;
  skipApprovalConsentedAt: string | null;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleAutoSendChange(enabled: boolean) {
    if (isSaving) return;
    setNotice(null);
    setIsSaving(true);
    try {
      const result = await updateAutoSendEnabled(clientSlug, enabled);
      if (result.status === "error") {
        setNotice(result.message ?? "設定を保存できませんでした。");
        return;
      }
      window.location.reload();
    } catch (error) {
      console.error("Failed to update auto send setting", error);
      setNotice("設定を保存できませんでした。時間をおいて再度お試しください。");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSkipApprovalChange(skip: boolean) {
    if (isSaving) return;

    // 承認を省略する選択は、MF上でご自身が修正することを引き受ける意思表示にあたる。
    // 惰性でONにされないよう、同意文を読んだうえでの明示的な操作を求める。
    if (skip && !window.confirm(`${SKIP_APPROVAL_CONSENT_TEXT}\n\n上記に同意して、承認を省略しますか？`)) {
      return;
    }

    setNotice(null);
    setIsSaving(true);
    try {
      const result = await updateSkipApproval(clientSlug, skip);
      if (result.status === "error") {
        setNotice(result.message ?? "設定を保存できませんでした。");
        return;
      }
      window.location.reload();
    } catch (error) {
      console.error("Failed to update skip approval setting", error);
      setNotice("設定を保存できませんでした。時間をおいて再度お試しください。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="ocr-edit-form">
      <ToggleSwitch
        checked={autoSendEnabled}
        disabled={isSaving}
        onChange={handleAutoSendChange}
        label="自動送信"
        description="オンの場合、履歴画面で「承認する」を押した仕訳が自動でマネーフォワードへ送信されます。オフの場合は、資料ごとに「MF送信」を押して送信してください。いずれの場合も、内容のご確認は必要です。"
      />

      {autoSendEnabled && (
        <>
          <ToggleSwitch
            checked={skipApproval}
            disabled={isSaving}
            onChange={handleSkipApprovalChange}
            label="承認を省略する"
            description={SKIP_APPROVAL_CONSENT_TEXT}
          />
          {skipApproval && skipApprovalConsentedAt && (
            <small className="muted">
              同意日時:{" "}
              {new Intl.DateTimeFormat("ja-JP", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Tokyo",
              }).format(new Date(skipApprovalConsentedAt))}
            </small>
          )}
        </>
      )}

      {isSaving && (
        <small className="muted">
          <Loader2 className="spin-icon" size={14} /> 保存中
        </small>
      )}
      {notice && <small className="warning-text">{notice}</small>}
    </div>
  );
}
