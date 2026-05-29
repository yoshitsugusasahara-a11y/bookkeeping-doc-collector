export type ReceiptOcrResult = {
  date: string | null;
  amount: number | null;
  store: string | null;
  summary: string | null;
  payment_method: "cash" | "credit_card" | "cashless";
  is_credit_card: boolean | null;
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

function normalizeOcrResult(value: unknown): ReceiptOcrResult {
  const input = value && typeof value === "object" ? value : {};
  const record = input as Record<string, unknown>;
  const amount =
    typeof record.amount === "number"
      ? Math.round(record.amount)
      : typeof record.amount === "string"
        ? Number.parseInt(record.amount.replace(/[^\d-]/g, ""), 10)
        : null;

  const paymentMethod =
    record.payment_method === "credit_card" ||
    record.payment_method === "cashless" ||
    record.payment_method === "cash"
      ? record.payment_method
      : record.is_credit_card === true
        ? "credit_card"
        : "cash";

  return {
    date: typeof record.date === "string" && record.date ? record.date : null,
    amount: Number.isFinite(amount) ? amount : null,
    store: typeof record.store === "string" && record.store ? record.store : null,
    summary:
      typeof record.summary === "string" && record.summary
        ? record.summary.slice(0, 15)
        : null,
    payment_method: paymentMethod,
    is_credit_card: paymentMethod === "credit_card",
  };
}

export async function analyzeReceiptWithGemini({
  file,
  mimeType,
  transactionNote,
}: {
  file: File;
  mimeType: string;
  transactionNote: string;
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
                    "Return payment_method as one of cash, credit_card, or cashless. Use cash when unknown. Use credit_card only for credit card payment. Use cashless for e-money, QR code payment, IC card, debit, or other non-cash payment.",
                    "あなたは日本の領収書・レシートを読み取るOCRアシスタントです。",
                    "添付画像またはPDFから、以下のJSONだけを返してください。",
                    "推測が難しい項目は null にしてください。金額は税込合計を整数で返してください。",
                    "日付は YYYY-MM-DD 形式にしてください。年が不明な場合は null にしてください。",
                    "支払方法は payment_method に cash / credit_card / cashless のいずれかで返してください。不明な場合は cash としてください。クレジットカードは credit_card、電子マネー・QR決済・交通系IC・デビット等は cashless としてください。",
                    `ユーザー入力の取引内容: ${transactionNote}`,
                    '返却形式: { "date": "YYYY-MM-DD", "amount": 1500, "store": "店舗名", "summary": "購入品目要約", "payment_method": "cash" }',
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
