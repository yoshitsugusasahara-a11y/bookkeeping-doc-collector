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

export const SKIP_APPROVAL_CONSENT_TEXT =
  "AIが作成した仕訳を、内容の確認なしにマネーフォワードへ自動送信します。AIによる判定は参考情報であり、会計処理上の正確性を保証するものではありません。送信された仕訳の確認および修正は、マネーフォワード上でお客様ご自身が行うことに同意します。";
