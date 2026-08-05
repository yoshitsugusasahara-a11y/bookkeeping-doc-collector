/**
 * 仕訳をMFへ送るまでの経路は3種類ある。
 *
 * - manual   : 自動送信しない。利用者が資料ごとに送信ボタンを押したときだけ送る（既定）。
 * - approval : 自動送信するが、利用者が承認した資料だけを送る。
 * - auto     : 承認を省略し、すべて自動で送る。利用者本人の同意が必要。
 *
 * 既定を manual にしているのは、本サービスがAIによる記帳の「代行」ではなく
 * 「アシスト」であり、最終的な科目判定は利用者の判断に委ねるという位置づけを
 * 既定の挙動として表すため。
 */
export type SendMode = "manual" | "approval" | "auto";

export type SendModeSettings = {
  auto_send_enabled?: boolean | null;
  skip_approval?: boolean | null;
};

export function resolveSendMode(settings: SendModeSettings): SendMode {
  if (!settings.auto_send_enabled) return "manual";
  return settings.skip_approval ? "auto" : "approval";
}

/** 自動送信（Cron等）の対象にしてよいか。manual では常に対象外。 */
export function canAutoSend({
  mode,
  approvedAt,
}: {
  mode: SendMode;
  approvedAt: string | null;
}) {
  if (mode === "manual") return false;
  if (mode === "auto") return true;
  return Boolean(approvedAt);
}

/** 資料ごとに承認の操作が必要なモードか（画面に承認ボタンを出すか）。 */
export function requiresApproval(mode: SendMode) {
  return mode === "approval";
}

/**
 * 管理者が代理でMFへ送信してよい資料かどうか。
 *
 * 承認の仕組みを顧客専用にしても、管理画面から無条件に送信できると
 * その仕組みが素通りされてしまう。管理者が送れるのは、利用者の意思が
 * 確認できるものに限る。
 *
 * - 承認済み（approved_at あり）: 承認モードで承認された資料に加え、
 *   都度送信モードで利用者が送信ボタンを押した資料も含む。後者は送信が
 *   失敗して未送信のまま残っていても、承認の意思は示されている。
 * - 承認省略（skip_approval）: 個別の承認なしで送ることに同意済み。
 */
export function canAdminSend({
  skipApproval,
  approvedAt,
}: {
  skipApproval?: boolean | null;
  approvedAt: string | null;
}) {
  return Boolean(skipApproval) || Boolean(approvedAt);
}

export const ADMIN_SEND_BLOCKED_MESSAGE =
  "顧客がまだ承認していない資料のため、管理者からは送信できません。顧客の承認をお待ちください。";

export const SKIP_APPROVAL_CONSENT_TEXT =
  "AIが作成した仕訳を、内容の確認なしにマネーフォワードへ自動送信します。AIによる判定は参考情報であり、会計処理上の正確性を保証するものではありません。送信された仕訳の確認および修正は、マネーフォワード上でお客様ご自身が行うことに同意します。";
