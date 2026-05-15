import type { ReceiptOcrResult } from "./receipt-ocr";

export type MfJournalPayload = {
  transaction_date: string;
  journal_type: "journal_entry";
  memo?: string | null;
  tags?: string[];
  branches: Array<{
    remark?: string | null;
    debitor: {
      value: number;
      account_id: string;
      tax_id?: string | null;
      sub_account_id?: string | null;
      department_id?: string | null;
      invoice_kind?: "INVOICE_KIND_NOT_TARGET" | "INVOICE_KIND_QUALIFIED" | "INVOICE_KIND_UNQUALIFIED_80" | null;
    };
    creditor: {
      value: number;
      account_id: string;
      tax_id?: string | null;
      sub_account_id?: string | null;
      department_id?: string | null;
      invoice_kind?: "INVOICE_KIND_NOT_TARGET" | "INVOICE_KIND_QUALIFIED" | "INVOICE_KIND_UNQUALIFIED_80" | null;
    };
  }>;
};

type MfAccountOption = {
  id: string;
  name?: string;
  category?: string;
  account_group?: string;
  tax_id?: string | null;
  sub_accounts?: Array<{
    id: string;
    name?: string;
    tax_id?: string | null;
  }>;
};

type MfTaxOption = {
  id: string;
  name?: string;
  abbreviation?: string;
  tax_rate?: number;
  available?: boolean;
};

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

function normalizeJournalPayload(value: unknown): MfJournalPayload {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const branches = Array.isArray(record.branches) ? record.branches : [];

  if (
    typeof record.transaction_date !== "string" ||
    record.transaction_date.length === 0 ||
    branches.length === 0
  ) {
    throw new Error("Gemini did not return a usable Money Forward journal.");
  }

  for (const branch of branches) {
    const line = branch && typeof branch === "object" ? branch as Record<string, unknown> : {};
    const debitor = line.debitor && typeof line.debitor === "object"
      ? line.debitor as Record<string, unknown>
      : {};
    const creditor = line.creditor && typeof line.creditor === "object"
      ? line.creditor as Record<string, unknown>
      : {};

    if (
      typeof debitor.account_id !== "string" ||
      typeof creditor.account_id !== "string" ||
      typeof debitor.value !== "number" ||
      typeof creditor.value !== "number"
    ) {
      throw new Error("Gemini journal is missing required account or amount fields.");
    }
  }

  return {
    transaction_date: record.transaction_date,
    journal_type: "journal_entry",
    memo: typeof record.memo === "string" ? record.memo.slice(0, 200) : null,
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 5)
      : [],
    branches: branches as MfJournalPayload["branches"],
  };
}

export async function generateMfJournalWithGemini({
  ocr,
  transactionNote,
  originalFileName,
  accounts,
  taxes,
}: {
  ocr: ReceiptOcrResult;
  transactionNote: string;
  originalFileName: string;
  accounts: MfAccountOption[];
  taxes: MfTaxOption[];
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

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
                  "あなたは日本の会計実務に詳しい記帳代行アシスタントです。",
                  "領収書OCR結果とユーザー入力から、Money Forward Cloud Accounting APIの /api/v3/journals に渡す journal JSONだけを返してください。",
                  "必ず下記の利用可能な勘定科目IDと税区分IDだけを使用してください。推測でIDを作らないでください。",
                  "通常仕訳として journal_type は journal_entry にしてください。",
                  "未実現の仕訳として扱うため、特殊な実現済みフラグは付けないでください。",
                  "貸方は支払方法に応じて現金またはクレジットカード等に近い科目を選んでください。見つからない場合は、もっとも近い資産/負債科目を選んでください。",
                  "借方は取引内容と店舗名から最も自然な費用科目を選んでください。",
                  "摘要 remark には店舗名、取引内容、元ファイル名を短く含めてください。",
                  "金額は税込合計額を value に入れてください。",
                  "返答形式はJSONのみです。",
                  "",
                  `OCR: ${JSON.stringify(ocr)}`,
                  `ユーザー入力: ${transactionNote}`,
                  `元ファイル名: ${originalFileName}`,
                  `勘定科目候補: ${JSON.stringify(accounts.slice(0, 200))}`,
                  `税区分候補: ${JSON.stringify(taxes.slice(0, 120))}`,
                  "",
                  '返答例: {"transaction_date":"2026-05-15","journal_type":"journal_entry","memo":"receipt import","tags":["receipt"],"branches":[{"remark":"店舗名 取引内容 file.jpg","debitor":{"value":1500,"account_id":"...","tax_id":"...","invoice_kind":"INVOICE_KIND_NOT_TARGET"},"creditor":{"value":1500,"account_id":"...","tax_id":"...","invoice_kind":"INVOICE_KIND_NOT_TARGET"}}]}',
                ].join("\n"),
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
    throw new Error(
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : "Gemini journal generation failed.",
    );
  }

  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Gemini journal response did not include text.");
  }

  return normalizeJournalPayload(JSON.parse(extractJson(text)));
}
