/**
 * 仕訳をMFへ送る方法は2種類。
 *
 * - manual : 自動送信しない。利用者が資料ごとに送信ボタンを押したときだけ送る（既定）。
 * - auto   : 未送信の資料を定期処理でまとめて送る。個別送信も引き続きできる。
 *
 * 既定を manual にしているのは、本サービスがAIによる記帳の「代行」ではなく
 * 「アシスト」であり、最終的な科目判定は利用者の判断に委ねるという位置づけを
 * 既定の挙動として表すため。
 *
 * auto は「内容を確認しないまま送られてよい」という選択にあたるため、
 * 有効化は利用者本人の操作に限り、同意した本人と日時を記録する。
 * 管理者は代理で有効化できない。
 */
export type SendMode = "manual" | "auto";

export type SendModeSettings = {
  auto_send_enabled?: boolean | null;
};

export function resolveSendMode(settings: SendModeSettings): SendMode {
  return settings.auto_send_enabled ? "auto" : "manual";
}

/**
 * 管理者が代理でMFへ送信してよい資料かどうか。
 *
 * 送信の可否を顧客の設定と操作に委ねても、管理画面から無条件に送信できると
 * その仕組みが素通りされてしまう。管理者が送れるのは、利用者の意思が
 * 確認できるものに限る。
 *
 * - 自動送信が有効: 内容を確認せず送ることに同意済み。
 * - 送信操作済み（approved_at あり）: 都度送信モードで利用者が送信ボタンを
 *   押した資料。送信が失敗して未送信のまま残っていても、意思は示されている。
 */
export function canAdminSend({
  autoSendEnabled,
  approvedAt,
}: {
  autoSendEnabled?: boolean | null;
  approvedAt: string | null;
}) {
  return Boolean(autoSendEnabled) || Boolean(approvedAt);
}

export const ADMIN_SEND_BLOCKED_MESSAGE =
  "顧客がまだ送信を指示していない資料のため、管理者からは送信できません。顧客の操作をお待ちください。";

export const AUTO_SEND_CONSENT_TEXT =
  "AIが作成した仕訳を、内容の確認なしにマネーフォワードへ自動送信します。AIによる判定は参考情報であり、会計処理上の正確性を保証するものではありません。送信された仕訳の確認および修正は、マネーフォワード上でお客様ご自身が行うことに同意します。";
