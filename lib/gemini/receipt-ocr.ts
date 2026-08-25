export type TaxBreakdown = {
  rate: 8 | 10;
  subtotal: number;
};

export type ReceiptOcrResult = {
  date: string | null;
  amount: number | null;
  store: string | null;
  summary: string | null;
  payment_method: "cash" | "credit_card" | "cashless";
  is_credit_card: boolean | null;
  tax_breakdown: TaxBreakdown[] | null;
  has_multiple_tax_rates: boolean;
  needs_tax_rate_review: boolean;
  // 1枚のレシート内で借方が複数の勘定科目に分かれる可能性があるか。
  // 真の場合は科目を自動確定せず、顧客ごとに設定した仮計上科目へ計上する。
  has_multiple_account_candidates: boolean;
  account_review_reason: string | null;
};

export type ReceiptOcrOutcome =
  | {
      status: "completed";
      result: ReceiptOcrResult;
      rawResponse: unknown;
      error: null;
    }
  | {
      status: "failed" | "skipped";
      result: null;
      rawResponse: unknown;
      error: string;
    };

const defaultGeminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const fallbackGeminiModels = (
  process.env.GEMINI_FALLBACK_MODELS || "gemini-2.5-flash-lite"
)
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

function getGeminiModels() {
  return Array.from(new Set([defaultGeminiModel, ...fallbackGeminiModels]));
}

function getGeminiAttempts() {
  const models = getGeminiModels();
  return [
    { model: models[0], delay: 0 },
    { model: models[0], delay: 1_200 },
    { model: models[1] || models[0], delay: 3_000 },
  ];
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  return Buffer.from(buffer).toString("base64");
}

function extractJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function normalizeTaxBreakdown(
  rawBreakdown: unknown,
  amount: number | null,
): {
  taxBreakdown: TaxBreakdown[] | null;
  hasMultipleTaxRates: boolean;
  needsTaxRateReview: boolean;
} {
  if (!Array.isArray(rawBreakdown) || rawBreakdown.length === 0) {
    return { taxBreakdown: null, hasMultipleTaxRates: false, needsTaxRateReview: false };
  }

  const validEntries = rawBreakdown
    .filter(
      (item): item is Record<string, unknown> =>
        item !== null && typeof item === "object",
    )
    .filter(
      (item) =>
        (item.rate === 8 || item.rate === 10) &&
        typeof item.subtotal === "number" &&
        (item.subtotal as number) > 0,
    );

  if (validEntries.length === 0) {
    return { taxBreakdown: null, hasMultipleTaxRates: false, needsTaxRateReview: true };
  }

  // 同一 rate の複数エントリを合算する
  const mergedMap = new Map<8 | 10, number>();
  for (const entry of validEntries) {
    const rate = entry.rate as 8 | 10;
    mergedMap.set(rate, (mergedMap.get(rate) ?? 0) + (entry.subtotal as number));
  }

  const merged: TaxBreakdown[] = Array.from(mergedMap.entries()).map(
    ([rate, subtotal]) => ({ rate, subtotal }),
  );

  if (amount !== null) {
    const breakdownSum = merged.reduce((sum, item) => sum + item.subtotal, 0);
    const tolerance = Math.max(5, amount * 0.02);
    if (Math.abs(breakdownSum - amount) > tolerance) {
      return { taxBreakdown: null, hasMultipleTaxRates: false, needsTaxRateReview: true };
    }
  }

  const hasMultipleTaxRates = mergedMap.has(8) && mergedMap.has(10);
  return { taxBreakdown: merged, hasMultipleTaxRates, needsTaxRateReview: false };
}

/**
 * OCRが返した日付を YYYY-MM-DD として検証する。通らないものは null に落とす。
 *
 * 「年が不明なら null」という指示を、Geminiが年の位置だけを null にすると
 * 解釈して "null-07-27" のような文字列を返すことがある。空でない文字列なので
 * 後段の truthy 判定をすべて素通りし、MFへ送って初めて弾かれる。ここで null に
 * しておけば、送信日を仮の取引日として使う既存の受け皿が正しく働く。
 */
function normalizeOcrDate(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(trimmed)) return null;

  // 2026-02-31 のような存在しない日付はDateが繰り上げてしまうため、
  // 往復させて元の文字列と一致するかを確認する。
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== trimmed) return null;

  return trimmed;
}

function normalizeOcrResult(value: unknown): ReceiptOcrResult {
  const input = value && typeof value === "object" ? value : {};
  const record = input as Record<string, unknown>;
  const amount =
    typeof record.amount === "number"
      ? Math.round(record.amount)
      : typeof record.amount === "string"
        ? Number.parseInt(record.amount.replace(/[^\d-]/g, ""), 10)
        : null;

  const rawPaymentMethod =
    typeof record.payment_method === "string" ? record.payment_method : null;
  const isCreditCardRaw =
    typeof record.is_credit_card === "boolean" ? record.is_credit_card : null;

  // Gemini often omits payment_method and only returns is_credit_card, so
  // fall back to deriving payment_method from that boolean when the string
  // field itself isn't present.
  const paymentMethod: "cash" | "credit_card" | "cashless" =
    rawPaymentMethod === "credit_card" || rawPaymentMethod === "cashless"
      ? rawPaymentMethod
      : isCreditCardRaw === true
        ? "credit_card"
        : "cash";

  const normalizedAmount = Number.isFinite(amount) ? amount : null;
  const { taxBreakdown, hasMultipleTaxRates, needsTaxRateReview } =
    normalizeTaxBreakdown(record.tax_breakdown, normalizedAmount);

  const hasMultipleAccountCandidates =
    record.has_multiple_account_candidates === true;
  const accountReviewReason =
    hasMultipleAccountCandidates &&
    typeof record.account_review_reason === "string" &&
    record.account_review_reason.trim()
      ? record.account_review_reason.trim().slice(0, 100)
      : null;

  return {
    date: normalizeOcrDate(record.date),
    amount: normalizedAmount,
    store: typeof record.store === "string" && record.store ? record.store : null,
    summary:
      typeof record.summary === "string" && record.summary
        ? record.summary.slice(0, 15)
        : null,
    payment_method: paymentMethod,
    is_credit_card: paymentMethod === "credit_card",
    tax_breakdown: taxBreakdown,
    has_multiple_tax_rates: hasMultipleTaxRates,
    needs_tax_rate_review: needsTaxRateReview,
    has_multiple_account_candidates: hasMultipleAccountCandidates,
    account_review_reason: accountReviewReason,
  };
}

export async function analyzeReceiptWithGemini({
  file,
  mimeType,
  transactionNote,
  customerJournalPrompt = null,
  businessContextLines = [],
}: {
  file: File;
  mimeType: string;
  transactionNote: string;
  customerJournalPrompt?: string | null;
  businessContextLines?: string[];
}): Promise<ReceiptOcrOutcome> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      status: "skipped",
      result: null,
      rawResponse: null,
      error: "GEMINI_API_KEY is not configured.",
    };
  }

  const base64Data = arrayBufferToBase64(await file.arrayBuffer());
  let lastError = "Gemini OCR failed.";
  let lastResponse: unknown = null;

  for (const { model, delay } of getGeminiAttempts()) {
    if (delay > 0) {
      await wait(delay);
    }

    try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: [
                    "Return only a valid JSON object. Do not include Markdown fences, explanations, or extra text.",
                    "The amount must be an integer number without commas or currency symbols.",
                    "The summary must be a concise Japanese description within 15 characters.",
                    "Return payment_method as exactly one of cash, credit_card, cashless. Use cash when the payment method is unclear.",
                    "Set is_credit_card to true when the receipt mentions Visa, Master, JCB, AMEX, credit sale, card payment, card, or transportation IC. Set it to false for cash. Use null only when unknown.",
                    "あなたは日本の領収書・レシートを読み取るOCRアシスタントです。",
                    "添付画像またはPDFから、以下のJSONだけを返してください。",
                    "推測が難しい項目は null にしてください。金額は税込合計を整数で返してください。",
                    "日付は YYYY-MM-DD 形式にしてください。年・月・日のいずれか一つでも読み取れない場合は、date 項目全体を null にしてください。「null-07-27」のように一部だけを null という文字にした値は返さないでください。",
                    "支払方法がクレジットカード、カード、VISA、Mastercard、JCB、AMEX、交通系IC等なら is_credit_card を true、現金なら false、不明なら null にしてください。",
                    "レシートに消費税率の印字がある場合は、8%のみ・10%のみ・混在のいずれの場合も、税率ごとの税込合計金額を tax_breakdown 配列に含めてください。",
                    "- 「8%対象」「軽減税率対象」「内消費税等 8.0%」「内消費税 8%」等、8%を示す記載がある → その税率区分の税込小計を rate: 8 として追加。",
                    "- 「10%対象」「標準税率対象」「内消費税等 10.0%」「内消費税 10%」等、10%を示す記載がある → rate: 10 として追加。",
                    "- 全商品が単一の税率のみの場合は、amount（税込合計）をそのままその税率の subtotal として1件だけ返してください。",
                    "- subtotal は税込金額の整数（円）で返してください。",
                    "- 消費税率が全く読み取れない場合のみ tax_breakdown を null にしてください。",
                    "- amount（税込合計）= 各 subtotal の合計になるはずですが、読み取り精度の都合で1〜2円の差が生じてもそのまま返してください。",
                    "",
                    "【勘定科目が複数に分かれる可能性の判定】",
                    "購入品目やユーザー入力から、1枚のレシートの借方が明らかに複数の勘定科目に分かれると判断できる場合のみ、has_multiple_account_candidates を true にし、account_review_reason にその理由を40文字以内の日本語で入れてください。",
                    "- true にする例: スーパーで食材（仕入・福利厚生費など）と洗剤等の日用品（消耗品費）を同時購入している。ユーザー入力に「贈答用のフルーツと、仕入」「日用品と製造用の部品」のように用途の異なる複数の目的が書かれている。",
                    "- false にする例: 用途が一貫している（コンビニで従業員用の飲料と菓子をまとめ買い＝福利厚生費のみ）。品目が複数あっても同じ科目に収まる。判断に迷う。",
                    "- 保守的に判定してください。明らかに別科目だと言える場合以外は false にしてください。",
                    "- 【最優先】下記の顧客別の仕訳処理方針を必ず先に読んでください。その方針に従えばこのレシートが1つの勘定科目に定まる場合は、品目が複数種類あっても必ず false にしてください。顧客の方針は、上記の一般的な判定基準より優先されます。",
                    "  例: 方針に「食品も日用品もすべて仕入で処理する」とある → 食品と日用品が混在していても false。",
                    "  例: 方針に「食品は仕入、日用品は消耗品費」とある → 科目が分かれるため true。",
                    "  例: 方針に科目の定めがない、またはこのレシートに当てはまる記載がない → 上記の一般的な基準で判定する。",
                    ...businessContextLines,
                    customerJournalPrompt && customerJournalPrompt.trim()
                      ? `顧客別の仕訳処理方針: ${customerJournalPrompt.trim()}`
                      : "顧客別の仕訳処理方針: なし",
                    `ユーザー入力の取引内容: ${transactionNote}`,
                    '返却形式（税率が全く読み取れない場合）: { "date": "YYYY-MM-DD", "amount": 1500, "store": "店舗名", "summary": "購入品目要約", "payment_method": "credit_card", "is_credit_card": true, "tax_breakdown": null, "has_multiple_account_candidates": false, "account_review_reason": null }',
                    '返却形式（単一8%の場合）: { "date": "YYYY-MM-DD", "amount": 472, "store": "店舗名", "summary": "購入品目要約", "payment_method": "cash", "is_credit_card": false, "tax_breakdown": [{ "rate": 8, "subtotal": 472 }], "has_multiple_account_candidates": false, "account_review_reason": null }',
                    '返却形式（混在の場合）: { "date": "YYYY-MM-DD", "amount": 5460, "store": "店舗名", "summary": "購入品目要約", "payment_method": "cash", "is_credit_card": false, "tax_breakdown": [{ "rate": 8, "subtotal": 2160 }, { "rate": 10, "subtotal": 3300 }], "has_multiple_account_candidates": true, "account_review_reason": "食品と日用品が混在" }',
                  ].join("\n"),
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    const payload = await response.json();
    if (!response.ok) {
      lastResponse = payload;
      lastError =
          typeof payload?.error?.message === "string"
            ? payload.error.message
            : "Gemini OCR request failed.";
      continue;
    }

    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string" || !text.trim()) {
      return {
        status: "failed",
        result: null,
        rawResponse: payload,
        error: "Gemini OCR response did not include text.",
      };
    }

    const parsed = JSON.parse(extractJson(text));
    return {
      status: "completed",
      result: normalizeOcrResult(parsed),
      rawResponse: parsed,
      error: null,
    };
    } catch (error) {
      lastResponse = null;
      lastError = error instanceof Error ? error.message : "Gemini OCR failed.";
    }
  }

  return {
    status: "failed",
    result: null,
    rawResponse: lastResponse,
    error: lastError,
  }
}
