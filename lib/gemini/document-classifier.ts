export type DocumentRuleForClassification = {
  id: string;
  document_name: string;
  match_features: string | null;
  file_name_rule: string;
};

export type DocumentClassificationResult = {
  kind: "receipt" | "matched_document" | "unmatched_document";
  matched_rule_id: string | null;
  confidence: number;
  document_date: string | null;
  reason: string | null;
};

export type DocumentClassificationOutcome =
  | {
      status: "completed";
      result: DocumentClassificationResult;
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

function normalizeClassification(value: unknown): DocumentClassificationResult {
  const record = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
  const rawKind = typeof record.kind === "string" ? record.kind : "";
  const kind =
    rawKind === "receipt" ||
    rawKind === "matched_document" ||
    rawKind === "unmatched_document"
      ? rawKind
      : "unmatched_document";
  const confidence =
    typeof record.confidence === "number" && Number.isFinite(record.confidence)
      ? Math.max(0, Math.min(1, record.confidence))
      : 0;

  return {
    kind,
    matched_rule_id:
      typeof record.matched_rule_id === "string" && record.matched_rule_id
        ? record.matched_rule_id
        : null,
    confidence,
    document_date:
      typeof record.document_date === "string" && record.document_date
        ? record.document_date
        : null,
    reason:
      typeof record.reason === "string" && record.reason
        ? record.reason.slice(0, 500)
        : null,
  };
}

function buildPrompt({
  transactionNote,
  rules,
}: {
  transactionNote: string;
  rules: DocumentRuleForClassification[];
}) {
  return [
    "Return only a valid JSON object. Do not include Markdown fences, explanations, or extra text.",
    "Classify the uploaded bookkeeping document.",
    "Treat only receipts/領収書/レシート/payment receipts as kind = receipt.",
    "Invoices, bills, direct debit notices, payroll statements, withholding tax reports, contracts, statements, and guidance letters are not receipts even when they contain dates and amounts.",
    "If it is not a receipt, compare it with the document rules and return the best matching rule when the sender name, title, or distinctive text is visible.",
    "For Japanese documents, use both the document title and issuer text. Examples: NTTファイナンス口座振替のご案内 should match a rule whose features include NTTファイナンス; リースサンキュー請求書 should match a rule whose features include リースサンキュー and 請求書.",
    "If no rule is clear, return kind = unmatched_document.",
    "Use confidence from 0 to 1. Use document_date in YYYY-MM-DD format when visible, otherwise null.",
    "",
    `User note: ${transactionNote}`,
    `Document rules: ${JSON.stringify(
      rules.map((rule) => ({
        id: rule.id,
        document_name: rule.document_name,
        match_features: rule.match_features,
        file_name_rule: rule.file_name_rule,
      })),
    )}`,
    "",
    'Response format: {"kind":"receipt","matched_rule_id":null,"confidence":0.95,"document_date":"2026-05-19","reason":"short reason"}',
  ].join("\n");
}

export async function classifyDocumentWithGemini({
  file,
  mimeType,
  transactionNote,
  rules,
}: {
  file: File;
  mimeType: string;
  transactionNote: string;
  rules: DocumentRuleForClassification[];
}): Promise<DocumentClassificationOutcome> {
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
  let lastError = "Gemini document classification failed.";
  let lastResponse: unknown = null;

  for (const { model, delay } of getGeminiAttempts()) {
    if (delay > 0) await wait(delay);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: buildPrompt({ transactionNote, rules }),
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
              temperature: 0.05,
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
            : "Gemini document classification request failed.";
        continue;
      }

      const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string" || !text.trim()) {
        lastResponse = payload;
        lastError = "Gemini document classification response did not include text.";
        continue;
      }

      const parsed = JSON.parse(extractJson(text));
      return {
        status: "completed",
        result: normalizeClassification(parsed),
        rawResponse: parsed,
        error: null,
      };
    } catch (error) {
      lastResponse = null;
      lastError =
        error instanceof Error
          ? error.message
          : "Gemini document classification failed.";
    }
  }

  return {
    status: "failed",
    result: null,
    rawResponse: lastResponse,
    error: lastError,
  };
}
