"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ToggleSwitch } from "@/components/toggle-switch";
import { AUTO_SEND_CONSENT_TEXT } from "@/lib/receipts/send-mode";
import { updateAutoSendEnabled } from "../actions";

export function SendModeForm({
  clientSlug,
  autoSendEnabled,
  consentedAt,
}: {
  clientSlug: string;
  autoSendEnabled: boolean;
  consentedAt: string | null;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleChange(enabled: boolean) {
    if (isSaving) return;

    // 自動送信を有効にすることは、内容を確認しないまま送られてよいという
    // 意思表示にあたる。惰性でONにされないよう、同意文を読んだうえでの
    // 明示的な操作を求める。
    if (
      enabled &&
      !window.confirm(`${AUTO_SEND_CONSENT_TEXT}\n\n上記に同意して、自動送信を有効にしますか？`)
    ) {
      return;
    }

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

  return (
    <div className="ocr-edit-form">
      <ToggleSwitch
        checked={autoSendEnabled}
        disabled={isSaving}
        onChange={handleChange}
        label="自動送信"
        description="オフの場合、仕訳は自動では送信されません。履歴画面で内容をご確認のうえ、資料ごとに「MF送信」を押してください。オンにすると、未送信の仕訳が自動でマネーフォワードへ送信されます。"
      />

      {autoSendEnabled ? (
        <>
          <small className="muted">{AUTO_SEND_CONSENT_TEXT}</small>
          {consentedAt && (
            <small className="muted">
              同意日時:{" "}
              {new Intl.DateTimeFormat("ja-JP", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Tokyo",
              }).format(new Date(consentedAt))}
            </small>
          )}
        </>
      ) : (
        <small className="muted">
          自動送信を有効にする場合は、内容を確認しないまま送信されることへの同意が必要です。この設定はお客様ご自身でのみ変更でき、管理者からは変更できません。
        </small>
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
