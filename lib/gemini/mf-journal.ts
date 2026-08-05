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
    };
    creditor: {
      value: number;
      account_id: string;
      tax_id?: string | null;
      sub_account_id?: string | null;
      department_id?: string | null;
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

type AccountTaxLookup = {
  accountTaxById: Map<string, string | null>;
  subAccountTaxById: Map<string, string | null>;
};

// 勘定科目マスタ（getMoneyForwardAccounts のレスポンス）から、科目ID・補助科目IDごとの
// デフォルト税区分ID(tax_id)を引けるようにする。税区分の判定は税理士業務であり、
// Gemini の判断ではなくマスタの値を機械的に採用するため、このマップで上書きする。
function buildAccountTaxLookup(accounts: MfAccountOption[]): AccountTaxLookup {
  const accountTaxById = new Map<string, string | null>();
  const subAccountTaxById = new Map<string, string | null>();

  for (const account of accounts) {
    if (typeof account.id === "string") {
      accountTaxById.set(account.id, account.tax_id ?? null);
    }
    for (const subAccount of account.sub_accounts ?? []) {
      if (typeof subAccount.id === "string") {
        subAccountTaxById.set(subAccount.id, subAccount.tax_id ?? null);
      }
    }
  }

  return { accountTaxById, subAccountTaxById };
}

// 補助科目が指定されていればその税区分を優先し、なければ勘定科目の税区分を採用する。
// どちらもマスタに見つからない場合は null（tax_id 未指定）とし、MF 側の既定に委ねる。
function resolveMasterTaxId({
  lookup,
  accountId,
  subAccountId,
}: {
  lookup: AccountTaxLookup;
  accountId: string;
  subAccountId: string | null | undefined;
}): string | null {
  if (subAccountId) {
    const subTaxId = lookup.subAccountTaxById.get(subAccountId);
    if (subTaxId) return subTaxId;
  }

  const accountTaxId = lookup.accountTaxById.get(accountId);
  if (accountTaxId) return accountTaxId;

  return null;
}

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

function extractJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = trimmed.indexOf("{");
  if (firstBrace < 0) return trimmed;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstBrace; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;

    if (depth === 0) {
      return trimmed.slice(firstBrace, index + 1);
    }
  }

  return trimmed.slice(firstBrace);
}

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function getJournalRecord(value: unknown) {
  const record = asRecord(value);
  if (record.journal && typeof record.journal === "object") {
    return record.journal as Record<string, unknown>;
  }
  return record;
}

function toAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeLineDetails(value: unknown) {
  const record = asRecord(value);
  const amount = toAmount(record.value);

  if (typeof record.account_id !== "string" || amount === null) {
    return null;
  }

  return {
    value: amount,
    account_id: record.account_id,
    tax_id: typeof record.tax_id === "string" ? record.tax_id : null,
    sub_account_id:
      typeof record.sub_account_id === "string" ? record.sub_account_id : null,
    department_id:
      typeof record.department_id === "string" ? record.department_id : null,
  };
}

function normalizeJournalPayload(value: unknown): MfJournalPayload {
  const record = getJournalRecord(value);
  const branches = Array.isArray(record.branches) ? record.branches : [];

  if (
    typeof record.transaction_date !== "string" ||
    record.transaction_date.length === 0 ||
    branches.length === 0
  ) {
    throw new Error("Gemini did not return a usable Money Forward journal.");
  }

  const normalizedBranches = branches.map((branch) => {
    const line = asRecord(branch);
    const debitor = normalizeLineDetails(line.debitor);
    const creditor = normalizeLineDetails(line.creditor);

    if (!debitor || !creditor) {
      throw new Error(
        "Gemini journal is missing required account or amount fields.",
      );
    }

    return {
      remark: typeof line.remark === "string" ? line.remark.slice(0, 200) : null,
      debitor,
      creditor,
    };
  });

  return {
    transaction_date: record.transaction_date,
    journal_type: "journal_entry",
    memo: typeof record.memo === "string" ? record.memo.slice(0, 200) : null,
    tags: Array.isArray(record.tags)
      ? record.tags
          .filter((tag): tag is string => typeof tag === "string")
          .slice(0, 5)
      : [],
    branches: normalizedBranches,
  };
}

function buildRemark({
  ocr,
  transactionNote,
  voucherFileName,
}: {
  ocr: ReceiptOcrResult;
  transactionNote: string;
  voucherFileName: string;
}) {
  return [ocr.store, ocr.summary || transactionNote, voucherFileName]
    .filter(
      (part): part is string =>
        typeof part === "string" && part.trim().length > 0,
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 200);
}

function ensureVoucherFileNameInRemark({
  remark,
  fallbackRemark,
  voucherFileName,
}: {
  remark: string | null | undefined;
  fallbackRemark: string;
  voucherFileName: string;
}) {
  const baseRemark =
    typeof remark === "string" && remark.trim().length > 0
      ? remark.trim()
      : fallbackRemark;
  const remarkWithFileName = baseRemark.includes(voucherFileName)
    ? baseRemark
    : `${baseRemark} ${voucherFileName}`;

  return remarkWithFileName.replace(/\s+/g, " ").slice(0, 200);
}

function normalizeTags({
  tags,
  allowAdditionalTags,
  requiredTags = [],
}: {
  tags: string[];
  allowAdditionalTags: boolean;
  requiredTags?: string[];
}) {
  const baseTags = ["AI", ...requiredTags];
  const tagList = allowAdditionalTags
    ? [...baseTags, ...tags.filter((tag) => !baseTags.includes(tag))]
    : baseTags;

  return Array.from(new Set(tagList))
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function buildPrompt({
  ocr,
  transactionNote,
  voucherFileName,
  transactionDate,
  needsDateConfirmation,
  submissionTimestampLabel,
  customerJournalPrompt,
  accounts,
}: {
  ocr: ReceiptOcrResult;
  transactionNote: string;
  voucherFileName: string;
  transactionDate: string;
  needsDateConfirmation: boolean;
  submissionTimestampLabel: string;
  customerJournalPrompt: string | null;
  accounts: MfAccountOption[];
}) {
  const hasCustomerPrompt =
    typeof customerJournalPrompt === "string" &&
    customerJournalPrompt.trim().length > 0;

  return [
    "あなたは日本の会計実務に詳しい記帳代行アシスタントです。",
    "領収書OCR結果とユーザー入力から、Money Forward Cloud Accounting API の /api/v3/journals に渡す journal JSON だけを返してください。",
    "必ず下記の利用可能な勘定科目ID、補助科目IDだけを使用してください。推測でIDを作らないでください。",
    "税区分（tax_id）はシステム側で勘定科目マスタから自動設定します。あなたはtax_idを指定する必要はありません（指定しても無視されます）。勘定科目と補助科目の選択に集中してください。",
    "通常仕訳として journal_type は journal_entry にしてください。",
    "未実現仕訳として扱うための特別なフラグや invoice_kind は送信しないでください。",
    "貸方は支払方法に応じて、現金、クレジットカード等に近い科目を選んでください。見つからない場合は、利用可能な候補から最も近い資産または負債科目を選んでください。",
    "借方は取引内容、店舗名、OCR結果から最も自然な費用科目または仕入科目を選んでください。",
    "摘要 remark には、店舗名、取引内容、添付ファイル名を短く含めてください。",
    "顧客別の仕訳生成指示がある場合は、勘定科目、補助科目、摘要、タグの判断に反映してください。",
    "ただし、利用可能な勘定科目ID、補助科目IDに存在しない値は絶対に使わないでください。",
    "顧客別指示にタグ指定がある場合は tags に追加してください。ただし AI タグは必ず含めてください。",
    "摘要 remark には顧客別指示を反映しても、添付ファイル名を必ず含めてください。",
    "金額は税込合計額を value に入れてください。",
    "transaction_date には、指定された取引日をそのまま使用してください。OCR結果の日付と異なっていても、指定された取引日を優先してください。",
    "返答形式はJSONのみです。Markdown、説明文、前置き、後書きは含めないでください。",
    "",
    `OCR: ${JSON.stringify(ocr)}`,
    `ユーザー入力: ${transactionNote}`,
    `添付ファイル名: ${voucherFileName}`,
    `取引日として必ず使用する日付: ${transactionDate}${needsDateConfirmation ? "（OCRで日付を読み取れなかったため、送信日を仮の取引日として使用しています）" : ""}`,
    `メモに入れる送信日時: ${submissionTimestampLabel}`,
    hasCustomerPrompt
      ? `顧客別の仕訳生成指示: ${customerJournalPrompt}`
      : "顧客別の仕訳生成指示: なし",
    'タグには必ず "AI" を含めてください。',
    needsDateConfirmation
      ? 'タグには "確認" も必ず含めてください（日付が推定のため、後で確認が必要です）。'
      : "",
    `勘定科目候補: ${JSON.stringify(accounts.slice(0, 200))}`,
    "",
    '返答例: {"transaction_date":"2026-05-15","journal_type":"journal_entry","memo":"receipt import","tags":["AI"],"branches":[{"remark":"店舗名 取引内容 file.jpg","debitor":{"value":1500,"account_id":"..."},"creditor":{"value":1500,"account_id":"..."}}]}',
  ].join("\n");
}

export async function generateMfJournalWithGemini({
  ocr,
  transactionNote,
  voucherFileName,
  transactionDate,
  needsDateConfirmation,
  submissionTimestampLabel,
  customerJournalPrompt = null,
  accounts,
}: {
  ocr: ReceiptOcrResult;
  transactionNote: string;
  voucherFileName: string;
  transactionDate: string;
  needsDateConfirmation: boolean;
  submissionTimestampLabel: string;
  customerJournalPrompt?: string | null;
  accounts: MfAccountOption[];
}) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const taxLookup = buildAccountTaxLookup(accounts);
  let lastError = "Gemini journal generation failed.";

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
                    text: buildPrompt({
                      ocr,
                      transactionNote,
                      voucherFileName,
                      transactionDate,
                      needsDateConfirmation,
                      submissionTimestampLabel,
                      customerJournalPrompt,
                      accounts,
                    }),
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
        lastError =
          typeof payload?.error?.message === "string"
            ? payload.error.message
            : "Gemini journal generation failed.";
        continue;
      }

      const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string" || !text.trim()) {
        lastError = "Gemini journal response did not include text.";
        continue;
      }

      const journal = normalizeJournalPayload(JSON.parse(extractJson(text)));
      const remark = buildRemark({ ocr, transactionNote, voucherFileName });
      const hasCustomerPrompt =
        typeof customerJournalPrompt === "string" &&
        customerJournalPrompt.trim().length > 0;

      return {
        ...journal,
        transaction_date: transactionDate,
        memo: submissionTimestampLabel.slice(0, 200),
        tags: normalizeTags({
          tags: journal.tags || [],
          allowAdditionalTags: hasCustomerPrompt,
          requiredTags: needsDateConfirmation ? ["確認"] : [],
        }),
        branches: journal.branches.map((branch) => ({
          ...branch,
          remark: hasCustomerPrompt
            ? ensureVoucherFileNameInRemark({
                remark: branch.remark,
                fallbackRemark: remark,
                voucherFileName,
              })
            : remark,
          // 税区分は Gemini の選択を信用せず、選ばれた勘定科目/補助科目に
          // 紐づくマスタのデフォルト税区分IDで機械的に上書きする。
          debitor: {
            ...branch.debitor,
            tax_id: resolveMasterTaxId({
              lookup: taxLookup,
              accountId: branch.debitor.account_id,
              subAccountId: branch.debitor.sub_account_id,
            }),
          },
          creditor: {
            ...branch.creditor,
            tax_id: resolveMasterTaxId({
              lookup: taxLookup,
              accountId: branch.creditor.account_id,
              subAccountId: branch.creditor.sub_account_id,
            }),
          },
        })),
      };
    } catch (error) {
      lastError =
        error instanceof Error
          ? error.message
          : "Gemini journal generation failed.";
    }
  }

  throw new Error(lastError);
}
