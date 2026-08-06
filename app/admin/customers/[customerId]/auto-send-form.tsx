/**
 * 自動送信の設定状況の表示。
 *
 * 自動送信を有効にすることは「内容を確認しないまま送られてよい」という
 * 顧客の意思表示にあたるため、管理者からは変更できない。ここでは
 * 現在の状態と同意日時の確認のみを行う。
 */
export function AutoSendStatus({
  autoSendEnabled,
  consentedAt,
}: {
  autoSendEnabled: boolean;
  consentedAt: string | null;
}) {
  return (
    <div className="ocr-edit-form">
      <dl className="ocr-summary compact-summary">
        <div>
          <dt>現在の設定</dt>
          <dd>
            {autoSendEnabled
              ? "自動送信する（顧客が同意済み）"
              : "自動送信しない（顧客が資料ごとに送信）"}
          </dd>
        </div>
        {autoSendEnabled && (
          <div>
            <dt>同意日時</dt>
            <dd>
              {consentedAt
                ? new Intl.DateTimeFormat("ja-JP", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Tokyo",
                  }).format(new Date(consentedAt))
                : "未取得"}
            </dd>
          </div>
        )}
      </dl>
      <small className="muted">
        自動送信の設定は、内容を確認しないまま送信されることへの同意を伴うため、顧客ご本人の操作でのみ変更できます。管理者からは変更できません。
      </small>
    </div>
  );
}
