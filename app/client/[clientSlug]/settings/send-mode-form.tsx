"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
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
      <label className="field">
        <span>自動送信</span>
        <span className="checkbox-line">
          <input
            type="checkbox"
            checked={autoSendEnabled}
            disabled={isSaving}
            onChange={(event) => handleAutoSendChange(event.target.checked)}
          />
          <span>AIが作成した仕訳をマネーフォワードへ自動送信する</span>
        </span>
      </label>
      <small className="muted">
        オフの場合、仕訳は自動では送信されません。履歴画面で内容をご確認のうえ、資料ごとに送信してください。
      </small>

      {autoSendEnabled && (
        <>
          <label className="field">
            <span>承認の省略</span>
            <span className="checkbox-line">
              <input
                type="checkbox"
                checked={skipApproval}
                disabled={isSaving}
                onChange={(event) =>
                  handleSkipApprovalChange(event.target.checked)
                }
              />
              <span>承認せずにすべて自動送信する</span>
            </span>
          </label>
          <small className="muted">{SKIP_APPROVAL_CONSENT_TEXT}</small>
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
