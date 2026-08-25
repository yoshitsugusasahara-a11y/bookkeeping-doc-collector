/**
 * マネーフォワードへの送信が失敗したときのエラーを分類し、顧客向けの文言に変換する。
 *
 * MFのエラー応答は {"errors":[{"code":"...","message":"..."}]} という配列の形で、
 * トップレベルに message がないため、client.ts では本文のJSONがそのまま
 * Error のメッセージになる。それを顧客画面へ素通しすると意味が伝わらない。
 *
 * 変換は保存時ではなく表示時に行う。保存済みの生の文言はそのまま残るので、
 * 既に失敗している資料にも遡って効き、文言を後から直すこともできる。
 * 管理者画面では引き続き生の文言を表示する（切り分けに必要なため）。
 *
 * kind は「もう一度送れば直るか」を表す。恒久エラー（permanent）は何度送っても
 * 結果が変わらないため、自動送信のリトライ対象から外す判断にも使える。
 *
 * 判別できないものを無理に当てにいかないこと。文言を取り違えると原因究明を
 * 誤らせるので、確実に分かるものだけ翻訳し、残りは unknown として扱う。
 *
 * 判定条件と表示文言を変更したときは、docs/mf-error-messages.md の対応表も
 * 更新すること。
 */

export type MfErrorKind =
  /** 何度送っても失敗する。読み取り結果の修正か、資料の削除が必要。 */
  | "permanent"
  /** マネーフォワードとの連携が切れている。再連携すれば送れる。 */
  | "auth"
  /** 一時的な失敗。時間をおけば送れる可能性がある。 */
  | "transient"
  /** 判別できないもの。 */
  | "unknown";

export type MfErrorExplanation = {
  kind: MfErrorKind;
  /** 何が起きたか。 */
  message: string;
  /** 次に何をすればよいか。 */
  action: string;
  /** 管理者への問い合わせ導線を出すか。 */
  needsSupport: boolean;
};

/** 顧客からの問い合わせ窓口。 */
export const supportFormUrl = "https://forms.gle/HyGf9dk3vy2rp5xm7";

const contactSupport = "管理者へご連絡ください。";
const fixOcrDate =
  "読み取り結果の日付をご確認のうえ、修正して再度お試しください。対象外の資料であれば削除してください。";

// 上から順に判定する。範囲の狭いものを先に置くこと。
const rules: Array<{ pattern: RegExp; explanation: MfErrorExplanation }> = [
  {
    // 会計期間の外にある日付。読み取り誤りか、そもそも対象外の資料。
    pattern: /not matching any accounting periods/i,
    explanation: {
      kind: "permanent",
      message:
        "レシートの日付が、マネーフォワードの会計期間に含まれていません。",
      action: fixOcrDate,
      needsSupport: false,
    },
  },
  {
    // 日付の形式が壊れている（MFのGo側が返すパースエラー）。
    pattern: /parsing time/i,
    explanation: {
      kind: "permanent",
      message: "レシートの日付を正しく読み取れませんでした。",
      action: fixOcrDate,
      needsSupport: false,
    },
  },
  {
    pattern: /account_id/i,
    explanation: {
      kind: "permanent",
      message: "勘定科目の指定に問題があり、送信できませんでした。",
      action: contactSupport,
      needsSupport: true,
    },
  },
  {
    pattern: /tax_id|tax_code|tax_rate/i,
    explanation: {
      kind: "permanent",
      message: "消費税区分の指定に問題があり、送信できませんでした。",
      action: contactSupport,
      needsSupport: true,
    },
  },
  {
    // 送信元の画像が消えている。管理者は証憑なしで送信できる。
    pattern: /一時保存ファイル/,
    explanation: {
      kind: "permanent",
      message: "送信に必要な画像データが見つかりませんでした。",
      action: contactSupport,
      needsSupport: true,
    },
  },
  {
    // システム側の設定不備。顧客の操作では解決しない。
    pattern: /OAuth settings are missing/i,
    explanation: {
      kind: "permanent",
      message: "マネーフォワード連携のシステム設定が完了していません。",
      action: contactSupport,
      needsSupport: true,
    },
  },
  {
    pattern:
      /refresh token is missing|invalid_grant|unauthorized|request failed: 40[13]/i,
    explanation: {
      kind: "auth",
      message: "マネーフォワードとの連携が切れています。",
      action: "設定画面から、マネーフォワードと再連携してください。",
      needsSupport: false,
    },
  },
  {
    pattern:
      /too many requests|rate limit|timeout|etimedout|econnreset|fetch failed|request failed: (429|5\d\d)/i,
    explanation: {
      kind: "transient",
      message: "マネーフォワードが一時的に応答しませんでした。",
      action: "時間をおいて、再度お試しください。",
      needsSupport: false,
    },
  },
];

const unknownExplanation: MfErrorExplanation = {
  kind: "unknown",
  message: "マネーフォワードへの送信に失敗しました。",
  action: contactSupport,
  needsSupport: true,
};

export function explainMfError(
  rawError: string | null | undefined,
): MfErrorExplanation | null {
  if (!rawError) return null;

  const matched = rules.find((rule) => rule.pattern.test(rawError));
  return matched ? matched.explanation : unknownExplanation;
}
