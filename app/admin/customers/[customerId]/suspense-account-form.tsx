"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  fetchMfAccountsForSuspenseSetting,
  updateCustomerSuspenseAccount,
  type SuspenseAccountOption,
} from "./actions";

export function SuspenseAccountForm({
  customerId,
  suspenseAccountId,
  suspenseAccountName,
  isMfConnected,
}: {
  customerId: string;
  suspenseAccountId: string | null;
  suspenseAccountName: string | null;
  isMfConnected: boolean;
}) {
  const [accounts, setAccounts] = useState<SuspenseAccountOption[] | null>(null);
  const [selectedId, setSelectedId] = useState(suspenseAccountId || "");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{
    status: "success" | "error";
    message: string;
  } | null>(null);

  async function handleFetchAccounts() {
    if (isLoading) return;
    setNotice(null);
    setIsLoading(true);

    try {
      const result = await fetchMfAccountsForSuspenseSetting(customerId);
      if (result.status === "error") {
        setNotice({ status: "error", message: result.message });
        return;
      }
      setAccounts(result.accounts);
    } catch (error) {
      console.error("Failed to fetch MF accounts", error);
      setNotice({
        status: "error",
        message: "科目一覧の取得に失敗しました。時間をおいて再度お試しください。",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    if (isSaving || !accounts) return;
    setNotice(null);
    setIsSaving(true);

    const selected = accounts.find((account) => account.id === selectedId);

    try {
      const result = await updateCustomerSuspenseAccount(
        customerId,
        selectedId,
        selected?.name || "",
      );
      setNotice({ status: result.status, message: result.message });
      if (result.status === "success") {
        setTimeout(() => window.location.reload(), 900);
      }
    } catch (error) {
      console.error("Failed to save suspense account", error);
      setNotice({
        status: "error",
        message: "仮計上科目の保存に失敗しました。時間をおいて再度お試しください。",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="ocr-edit-form">
      <dl className="ocr-summary compact-summary">
        <div>
          <dt>現在の設定</dt>
          <dd className={suspenseAccountId ? undefined : "warning-text"}>
            {suspenseAccountName || "未設定"}
          </dd>
        </div>
      </dl>

      {!isMfConnected && (
        <small className="warning-text">
          MF未連携のため科目一覧を取得できません。先にマネーフォワード連携を行ってください。
        </small>
      )}

      {accounts === null ? (
        <div className="action-row">
          <button
            className="secondary-action compact"
            type="button"
            onClick={handleFetchAccounts}
            disabled={isLoading || !isMfConnected}
          >
            {isLoading ? (
              <>
                <Loader2 className="spin-icon" size={15} />
                取得中
              </>
            ) : (
              "MFから科目一覧を取得"
            )}
          </button>
        </div>
      ) : (
        <>
          <label className="field">
            <span>仮計上科目</span>
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              disabled={isSaving}
            >
              <option value="">設定しない</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <div className="action-row">
            <button
              className="secondary-action compact"
              type="button"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="spin-icon" size={15} />
                  保存中
                </>
              ) : (
                "仮計上科目を保存"
              )}
            </button>
          </div>
        </>
      )}

      {notice?.status === "success" && (
        <small className="success-text">{notice.message}</small>
      )}
      {notice?.status === "error" && (
        <small className="warning-text">{notice.message}</small>
      )}
    </div>
  );
}
