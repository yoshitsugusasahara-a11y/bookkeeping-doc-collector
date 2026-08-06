"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, Save } from "lucide-react";
import {
  refreshCustomerMfOffice,
  updateCustomerBusinessDescription,
  type JournalPromptState,
} from "./actions";

const initialState: JournalPromptState = { status: "idle", message: "" };

function formatOfficeType(officeType: string | null) {
  if (officeType === "INDIVIDUAL") return "個人事業主";
  if (!officeType) return "未取得";
  return `法人（${officeType}）`;
}

function formatFlag(value: boolean | null) {
  if (value === null) return "未取得";
  return value ? "該当" : "該当なし";
}

/**
 * 業種（手入力）と、MFから取得した事業者情報の設定。
 *
 * どちらも仕訳生成の「背景情報」として使い、顧客別の仕訳生成指示より
 * 優先されることはない。事業者情報は変わることが稀なため毎回は取得せず、
 * ここでの手動更新とMF連携完了時の自動取得で保存した値を使い回す。
 */
export function BusinessProfileForm({
  customerId,
  businessDescription,
  officeType,
  isManufacturing,
  isRealEstate,
  officeFetchedAt,
  isMfConnected,
}: {
  customerId: string;
  businessDescription: string | null;
  officeType: string | null;
  isManufacturing: boolean | null;
  isRealEstate: boolean | null;
  officeFetchedAt: string | null;
  isMfConnected: boolean;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [state, setState] = useState<JournalPromptState>(initialState);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    setState(initialState);
    setIsSaving(true);

    try {
      const result = await updateCustomerBusinessDescription(
        initialState,
        new FormData(event.currentTarget),
      );
      setState(result);
      if (result.status === "success") {
        setTimeout(() => window.location.reload(), 700);
      }
    } catch (error) {
      console.error("Failed to save business description", error);
      setState({
        status: "error",
        message: "保存に失敗しました。時間をおいて再度お試しください。",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRefresh() {
    if (isRefreshing) return;
    setState(initialState);
    setIsRefreshing(true);

    try {
      const result = await refreshCustomerMfOffice(customerId);
      setState(result);
      if (result.status === "success") {
        setTimeout(() => window.location.reload(), 700);
      }
    } catch (error) {
      console.error("Failed to refresh MF office", error);
      setState({
        status: "error",
        message: "事業者情報の取得に失敗しました。",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="drive-form">
      <form onSubmit={handleSubmit}>
        <input type="hidden" name="customerId" value={customerId} />
        <label className="field">
          <span>業種・事業内容</span>
          <textarea
            name="businessDescription"
            defaultValue={businessDescription || ""}
            placeholder="例: 小規模な飲食店。店内飲食が中心で、テイクアウトも一部あり。"
            rows={4}
            disabled={isSaving}
          />
        </label>
        <div className="prompt-examples">
          <strong>入力例</strong>
          <ul>
            <li>小規模な飲食店。店内飲食が中心で、テイクアウトも一部あり。</li>
            <li>エステサロンの経営。施術のほか、化粧品の店販もあり。</li>
            <li>受託開発のプログラマー。自宅兼事務所で一人で作業している。</li>
          </ul>
        </div>
        <button className="primary-action" type="submit" disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="spin-icon" size={18} />
              保存中です
            </>
          ) : (
            <>
              <Save size={18} />
              業種・事業内容を保存
            </>
          )}
        </button>
      </form>

      <dl className="ocr-summary compact-summary">
        <div>
          <dt>事業形態</dt>
          <dd>{formatOfficeType(officeType)}</dd>
        </div>
        <div>
          <dt>不動産所得</dt>
          <dd>{formatFlag(isRealEstate)}</dd>
        </div>
        <div>
          <dt>製造業</dt>
          <dd>{formatFlag(isManufacturing)}</dd>
        </div>
        <div>
          <dt>取得日時</dt>
          <dd>
            {officeFetchedAt
              ? new Intl.DateTimeFormat("ja-JP", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Tokyo",
                }).format(new Date(officeFetchedAt))
              : "未取得"}
          </dd>
        </div>
      </dl>

      {!isMfConnected && (
        <small className="warning-text">
          MF未連携のため事業者情報を取得できません。先にマネーフォワード連携を行ってください。
        </small>
      )}

      <div className="action-row">
        <button
          className="secondary-action compact"
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing || !isMfConnected}
        >
          {isRefreshing ? (
            <>
              <Loader2 className="spin-icon" size={15} />
              取得中
            </>
          ) : (
            <>
              <RefreshCw size={15} />
              MFから事業者情報を取得
            </>
          )}
        </button>
      </div>
      <small className="muted">
        事業者情報はマネーフォワード連携時に自動で取得されます。MF側で設定を変更した場合は、このボタンで取り直してください。
      </small>

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
    </div>
  );
}
