import { Fragment } from "react";
import type { MfJournalPreview } from "@/lib/moneyforward/journal-preview";

function formatAmount(value: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

function getStatusMessage(status: string, error: string | null) {
  if (status === "skipped") {
    return error || "MF連携が未完了のため、予測仕訳を表示できません。";
  }
  if (status === "failed") {
    return error || "予測仕訳の作成に失敗しました。";
  }
  return "予測仕訳を準備しています。しばらくしてから再読み込みしてください。";
}

/**
 * MFへ送信される予定の仕訳を表示する。ここに表示されている内容が
 * そのまま送信されるため、送信前に利用者が内容を確認できる。
 */
export function JournalPreviewTable({
  preview,
  status,
  error,
  isSent,
}: {
  preview: MfJournalPreview | null;
  status: string;
  error: string | null;
  isSent: boolean;
}) {
  if (status !== "completed" || !preview) {
    if (isSent) return null;
    return (
      <div className="journal-preview">
        <p className="eyebrow">予測仕訳</p>
        <p className={status === "failed" ? "warning-text" : "muted"}>
          {getStatusMessage(status, error)}
        </p>
      </div>
    );
  }

  const { display } = preview;

  return (
    <div className="journal-preview">
      <p className="eyebrow">
        {isSent ? "送信した仕訳" : "予測仕訳（この内容で送信されます）"}
      </p>
      <div className="journal-preview-scroll">
        <table className="journal-preview-table">
          <thead>
            <tr>
              <th scope="col">貸借</th>
              <th scope="col">勘定科目</th>
              <th scope="col">補助科目</th>
              <th scope="col">税区分</th>
              <th scope="col">金額</th>
            </tr>
          </thead>
          <tbody>
            {display.branches.map((branch, branchIndex) => (
              <Fragment key={branchIndex}>
                <tr>
                  <td>借方</td>
                  <td>{branch.debit.accountName}</td>
                  <td>{branch.debit.subAccountName || "—"}</td>
                  <td>{branch.debit.taxName || "—"}</td>
                  <td className="amount-cell">
                    {formatAmount(branch.debit.value)}
                  </td>
                </tr>
                <tr className="branch-end">
                  <td>貸方</td>
                  <td>{branch.credit.accountName}</td>
                  <td>{branch.credit.subAccountName || "—"}</td>
                  <td>{branch.credit.taxName || "—"}</td>
                  <td className="amount-cell">
                    {formatAmount(branch.credit.value)}
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="ocr-summary compact-summary">
        <div>
          <dt>取引日</dt>
          <dd>{display.transactionDate}</dd>
        </div>
        <div>
          <dt>タグ</dt>
          <dd>{display.tags.length > 0 ? display.tags.join("、") : "—"}</dd>
        </div>
      </dl>
      {display.branches.map((branch, branchIndex) => (
        <small className="muted" key={`remark-${branchIndex}`}>
          摘要{display.branches.length > 1 ? `${branchIndex + 1}` : ""}:{" "}
          {branch.remark || "—"}
        </small>
      ))}
      {display.memo && <small className="muted">メモ: {display.memo}</small>}
    </div>
  );
}
