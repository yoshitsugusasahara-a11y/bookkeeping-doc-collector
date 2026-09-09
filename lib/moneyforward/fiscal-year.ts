/**
 * 仕訳の送信先となる会計年度の判定。
 *
 * マネーフォワードは、取引日がいずれかの会計期間に含まれていれば受け付ける。
 * 過去年度が残っている事業者では、日付を読み間違えた資料がその年度へ静かに
 * 登録されてしまう（2026-09-09に実際に発生し、仕訳を手作業で削除した）。
 * 全期間の外にある日付だけはMF側で弾かれるが、それは裏を返せば
 * 「過去年度が残っている限り弾かれない」ということでもある。
 *
 * そのため、送信する前にこちら側で対象年度の範囲内かを確かめる。
 */

export type AccountingPeriod = {
  fiscalYear: number;
  startDate: string;
  endDate: string;
};

/**
 * MFの応答、またはDBに保存したJSONから会計期間の一覧を取り出す。
 * 想定しない形が混ざっていても落ちないよう、取れたものだけを返す。
 */
export function parseAccountingPeriods(value: unknown): AccountingPeriod[] {
  if (!Array.isArray(value)) return [];

  const periods: AccountingPeriod[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;

    const fiscalYear =
      typeof row.fiscal_year === "number"
        ? row.fiscal_year
        : typeof row.fiscalYear === "number"
          ? row.fiscalYear
          : null;
    const startDate =
      typeof row.start_date === "string"
        ? row.start_date
        : typeof row.startDate === "string"
          ? row.startDate
          : null;
    const endDate =
      typeof row.end_date === "string"
        ? row.end_date
        : typeof row.endDate === "string"
          ? row.endDate
          : null;

    if (fiscalYear === null || !startDate || !endDate) continue;

    periods.push({ fiscalYear, startDate, endDate });
  }

  // MFは開始日の降順で返すが、保存を経ても順序に依存しないよう並べ直す。
  return periods.sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/**
 * 送信先の会計期間を決める。
 *
 * fiscalYear が null は「自動」で、MFの最新の会計期間を対象にする。既定を
 * 自動にしているのは、年度を固定だけにすると期首を過ぎた瞬間に全件が範囲外に
 * なって止まるため。自動でも、古い日付の資料は現在年度の外なので弾かれる。
 */
export function resolveTargetAccountingPeriod({
  periods,
  fiscalYear,
}: {
  periods: AccountingPeriod[];
  fiscalYear: number | null;
}): AccountingPeriod | null {
  if (periods.length === 0) return null;
  if (fiscalYear === null) return periods[0];
  return periods.find((period) => period.fiscalYear === fiscalYear) ?? null;
}

/** ISO形式（YYYY-MM-DD）同士の比較なので文字列のままで足りる。 */
export function isWithinAccountingPeriod(
  date: string,
  period: AccountingPeriod,
) {
  return date >= period.startDate && date <= period.endDate;
}

/**
 * 範囲外で送信を止めるときのエラー文。
 *
 * この文言は lib/moneyforward/error-message.ts の分類と対になっている。
 * 変更するときは向こうの判定条件と docs/mf-error-messages.md も直すこと。
 */
export function buildFiscalYearOutOfRangeMessage({
  date,
  period,
}: {
  date: string;
  period: AccountingPeriod;
}) {
  return `取引日 ${date} が送信先の会計年度（${period.fiscalYear}年度 ${period.startDate}〜${period.endDate}）の範囲外です。`;
}

/** 画面の選択肢に出す表示名。 */
export function formatAccountingPeriodLabel(period: AccountingPeriod) {
  return `${period.fiscalYear}年度（${period.startDate} 〜 ${period.endDate}）`;
}
