"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { updateCustomerAutoSend } from "./actions";

export function AutoSendForm({
  customerId,
  autoSendEnabled,
  skipApproval,
  skipApprovalConsentedAt,
}: {
  customerId: string;
  autoSendEnabled: boolean;
  skipApproval: boolean;
  skipApprovalConsentedAt: string | null;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleChange(enabled: boolean) {
    if (isSaving) return;
    setNotice(null);
    setIsSaving(true);
    try {
      const result = await updateCustomerAutoSend(customerId, enabled);
      if (result.status === "error") {
        setNotice(result.message);
        return;
      }
      window.location.reload();
    } catch (error) {
      console.error("Failed to update auto send setting", error);
      setNotice("設定を保存できませんでした。");
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
            onChange={(event) => handleChange(event.target.checked)}
          />
          <span>AIが作成した仕訳をマネーフォワードへ自動送信する</span>
        </span>
      </label>

      <dl className="ocr-summary compact-summary">
        <div>
          <dt>承認の省略</dt>
          <dd>
            {skipApproval
              ? `省略する（顧客が同意済み${
                  skipApprovalConsentedAt
                    ? `: ${new Intl.DateTimeFormat("ja-JP", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Asia/Tokyo",
                      }).format(new Date(skipApprovalConsentedAt))}`
                    : ""
                }）`
              : "省略しない（資料ごとに顧客の承認が必要）"}
          </dd>
        </div>
      </dl>
      <small className="muted">
        承認の省略は、マネーフォワード上でご自身が修正することを引き受ける選択にあたるため、顧客ご本人の操作でのみ設定できます。管理者からは変更できません。
      </small>

      {isSaving && (
        <small className="muted">
          <Loader2 className="spin-icon" size={14} /> 保存中
        </small>
      )}
      {notice && <small className="warning-text">{notice}</small>}
    </div>
  );
}
