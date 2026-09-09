"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

export type FiscalYearOption = {
  fiscalYear: number;
  label: string;
};

const AUTO_VALUE = "auto";

/**
 * 仕訳の送信先となる会計年度を選ぶ。管理者画面と顧客画面の双方で使う。
 *
 * 選択肢はMFから取得した会計期間だけで、自由入力はさせない。誤って選んでも
 * 「実在する別の年度」にしかならず、その場合は送信前の範囲チェックが止める。
 * 誤った年度に登録される事故にはならず、止まるだけになる。
 */
export function FiscalYearForm({
  fiscalYear,
  options,
  fetchedAt,
  emptyStateMessage,
  save,
}: {
  fiscalYear: number | null;
  options: FiscalYearOption[];
  fetchedAt: string | null;
  /**
   * 会計年度が未取得のときの文言。事業者情報を取得できるのは管理者だけなので、
   * 顧客には別の案内を出す（既定の文言のままだと対処できない指示になる）。
   */
  emptyStateMessage?: string;
  save: (
    fiscalYear: number | null,
  ) => Promise<{ status: "success" | "error"; message?: string }>;
}) {
  const [value, setValue] = useState(
    fiscalYear === null ? AUTO_VALUE : String(fiscalYear),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{
    status: "success" | "error";
    message: string;
  } | null>(null);

  const autoLabel =
    options.length > 0
      ? `自動（現在の会計年度：${options[0].fiscalYear}年度）`
      : "自動（現在の会計年度）";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    setNotice(null);
    setIsSaving(true);

    try {
      const result = await save(
        value === AUTO_VALUE ? null : Number.parseInt(value, 10),
      );

      if (result.status === "error") {
        setNotice({
          status: "error",
          message: result.message ?? "設定を保存できませんでした。",
        });
        return;
      }

      setNotice({
        status: "success",
        message: result.message ?? "送信先の会計年度を保存しました。",
      });
    } catch (error) {
      console.error("Failed to save the fiscal year setting", error);
      setNotice({
        status: "error",
        message: "設定を保存できませんでした。時間をおいて再度お試しください。",
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (options.length === 0) {
    return (
      <p className="warning-text">
        {emptyStateMessage ??
          "マネーフォワードから会計年度を取得できていません。連携を確認し、上の「MFから事業者情報を取得」を押してください。"}
      </p>
    );
  }

  return (
    <form className="stack-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>送信先の会計年度</span>
        <select
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={isSaving}
        >
          <option value={AUTO_VALUE}>{autoLabel}</option>
          {options.map((option) => (
            <option key={option.fiscalYear} value={String(option.fiscalYear)}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <p className="muted">
        設定した会計年度の範囲外の日付の資料は、マネーフォワードへ送信されません。日付を修正するか、対象外であれば削除してください。決算作業などで前の年度へ登録する場合のみ、年度を固定してください。
      </p>

      {fetchedAt && (
        <p className="muted">会計年度の取得日時: {fetchedAt}</p>
      )}

      <div className="action-row">
        <button className="primary-action" type="submit" disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="spin-icon" size={16} />
              保存中...
            </>
          ) : (
            "会計年度を保存"
          )}
        </button>
        {notice?.status === "success" && (
          <small className="success-text">
            <CheckCircle2 size={14} /> {notice.message}
          </small>
        )}
      </div>

      {notice?.status === "error" && (
        <p className="form-error">{notice.message}</p>
      )}
    </form>
  );
}
