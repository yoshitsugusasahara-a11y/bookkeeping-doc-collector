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

export type MfTaxOption = {
  id: string;
  name?: string;
  tax_rate?: number;
};

type AccountTaxLookup = {
  accountTaxById: Map<string, string | null>;
  subAccountTaxById: Map<string, string | null>;
  subAccountParentById: Map<string, string>;
};

type RawBranchWithHint = {
  remark?: string | null;
  tax_rate_hint?: 8 | 10 | null;
  debitor: { value: number; account_id: string; sub_account_id?: string | null; tax_id?: string | null; };
  creditor: { value: number; account_id: string; sub_account_id?: string | null; tax_id?: string | null; };
};

type ParsedBranch = {
  remark: string | null;
  tax_rate_hint: 8 | 10 | null;
  debitor: {
    value: number;
    account_id: string;
    tax_id: string | null;
    sub_account_id: string | null;
    department_id: string | null;
  };
  creditor: {
    value: number;
    account_id: string;
    tax_id: string | null;
    sub_account_id: string | null;
    department_id: string | null;
  };
};

// 勘定科目マスタ（getMoneyForwardAccounts のレスポンス）から、科目ID・補助科目IDごとの
// デフォルト税区分ID(tax_id)を引けるようにする。税区分の判定は税理士業務であり、
// Gemini の判断ではなくマスタの値を機械的に採用するため、このマップで上書きする。
function buildAccountTaxLookup(accounts: MfAccountOption[]): AccountTaxLookup {
  const accountTaxById = new Map<string, string | null>();
  const subAccountTaxById = new Map<string, string | null>();
  const subAccountParentById = new Map<string, string>();

  for (const account of accounts) {
    if (typeof account.id === "string") {
      accountTaxById.set(account.id, account.tax_id ?? null);
    }
    for (const subAccount of account.sub_accounts ?? []) {
      if (typeof subAccount.id === "string") {
        subAccountTaxById.set(subAccount.id, subAccount.tax_id ?? null);
        if (typeof account.id === "string") {
          subAccountParentById.set(subAccount.id, account.id);
        }
      }
    }
  }

  return { accountTaxById, subAccountTaxById, subAccountParentById };
}

// Gemini は「利用可能なIDだけを使う」よう指示しても、実在しない勘定科目IDを
// それらしい形式で作ってしまうことがある。そのまま送ると MF が
// invalid_request_body_value で拒否するため、送信前にマスタと突き合わせる。
function findUnknownAccountId(
  branches: ParsedBranch[],
  lookup: AccountTaxLookup,
): string | null {
  for (const branch of branches) {
    for (const line of [branch.debitor, branch.creditor]) {
      if (!lookup.accountTaxById.has(line.account_id)) {
        return line.account_id;
      }
    }
  }
  return null;
}

// 補助科目は必須ではないため、実在しない・親科目が一致しない場合は
// 仕訳全体を失敗させず、補助科目の指定だけを落とす。
function sanitizeSubAccountId({
  lookup,
  accountId,
  subAccountId,
}: {
  lookup: AccountTaxLookup;
  accountId: string;
  subAccountId: string | null;
}): string | null {
  if (!subAccountId) return null;
  if (!lookup.subAccountTaxById.has(subAccountId)) return null;
  if (lookup.subAccountParentById.get(subAccountId) !== accountId) return null;
  return subAccountId;
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

// 税区分名から「課税仕入」「共通課税仕入」「非課税対応仕入」等の系統名を取り出す。
// 「(軽)」表記と税率(NN%)部分を除去することで、10%区分と8%区分が同じ系統かどうか比較できる。
function taxCategoryKey(name: string): string {
  return name
    .replace(/\(軽\)/g, "")
    .replace(/\d+(\.\d+)?%/g, "")
    .replace(/\s+/g, "")
    .trim();
}

// 借方のデフォルト税区分（マスタ由来、通常は標準10%）と同じ系統の軽減税率(8%)区分を探す。
// 系統が特定できない、または対応する8%区分が見つからない場合は null（=デフォルトのまま）。
function buildReducedRateTaxResolver(taxes: MfTaxOption[]) {
  const taxesById = new Map<string, MfTaxOption>();
  for (const tax of taxes) {
    if (typeof tax.id === "string") taxesById.set(tax.id, tax);
  }

  return function resolveReducedRateTaxId(baseTaxId: string | null): string | null {
    if (!baseTaxId) return null;

    const baseTax = taxesById.get(baseTaxId);
    if (!baseTax || typeof baseTax.name !== "string") return null;

    const baseCategory = taxCategoryKey(baseTax.name);

    const candidate = taxes.find(
      (tax) =>
        tax.id !== baseTaxId &&
        typeof tax.name === "string" &&
        tax.name.includes("(軽)") &&
        typeof tax.tax_rate === "number" &&
        Math.abs(tax.tax_rate - 0.08) < 0.0001 &&
        taxCategoryKey(tax.name) === baseCategory,
    );

    return candidate?.id ?? null;
  };
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

type ParsedJournal = Omit<MfJournalPayload, "branches"> & {
  branches: ParsedBranch[];
};

function normalizeJournalPayload(value: unknown): ParsedJournal {
  const record = getJournalRecord(value);
  const branches = Array.isArray(record.branches) ? record.branches : [];

  if (
    typeof record.transaction_date !== "string" ||
    record.transaction_date.length === 0 ||
    branches.length === 0
  ) {
    throw new Error("Gemini did not return a usable Money Forward journal.");
  }

  const normalizedBranches: ParsedBranch[] = branches.map((branch) => {
    const line = asRecord(branch) as Partial<RawBranchWithHint> & Record<string, unknown>;
    const debitor = normalizeLineDetails(line.debitor);
    const creditor = normalizeLineDetails(line.creditor);

    if (!debitor || !creditor) {
      throw new Error(
        "Gemini journal is missing required account or amount fields.",
      );
    }

    const rawHint = line.tax_rate_hint;
    const taxRateHint: 8 | 10 | null =
      rawHint === 8 || rawHint === 10 ? rawHint : null;

    return {
      remark: typeof line.remark === "string" ? line.remark.slice(0, 200) : null,
      tax_rate_hint: taxRateHint,
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
  splitByTaxRate,
  businessContextLines,
}: {
  ocr: ReceiptOcrResult;
  transactionNote: string;
  voucherFileName: string;
  transactionDate: string;
  needsDateConfirmation: boolean;
  submissionTimestampLabel: string;
  customerJournalPrompt: string | null;
  accounts: MfAccountOption[];
  splitByTaxRate: boolean;
  businessContextLines: string[];
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
    "",
    ...(businessContextLines.length > 0
      ? [...businessContextLines, ""]
      : []),
    "【指示の優先順位】",
    "顧客別の仕訳生成指示は、その顧客の会計方針です。勘定科目・補助科目の選択、摘要の書き方、タグの追加、単一科目か複数科目かの判断については、上記の一般的な指示より顧客別の指示を優先してください。",
    "例: 顧客別指示に「食品も日用品もすべて仕入で処理する」とある場合、品目が複数種類あっても仕訳は1本にまとめ、指示された科目を使ってください。",
    "ただし次の4点は、顧客別指示に何が書かれていても必ず守ってください。",
    "- 利用可能な勘定科目ID、補助科目IDに存在しない値は絶対に使わない。",
    "- tax_id は指定しない（システムが勘定科目マスタから設定します）。",
    "- transaction_date は指定された取引日をそのまま使う。",
    '- tags には必ず "AI" を含める。',
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
    splitByTaxRate
      ? [
          "【重要：軽減税率・標準税率の混在レシートです】",
          "このレシートには8%（軽減税率）対象と10%（標準税率）対象の商品が混在しています。",
          "必ず税率ごとに branch を1本ずつ生成し、合計で2本の branches を返してください。",
          `税率別の税込金額: ${JSON.stringify(ocr.tax_breakdown)}`,
          "各ブランチのルール:",
          "- value には上記 subtotal をそのまま使用してください。",
          "- 各ブランチに tax_rate_hint として 8 または 10 を必ず設定してください。",
          "- 科目の選択に迷った場合は同一の勘定科目を両ブランチで使用してください（金額だけ分割）。",
          "- 貸方は支払方法に応じた同一科目を両ブランチで使用してください。",
          "- 各ブランチの remark には「(8%対象)」または「(10%対象)」を末尾に付与してください。",
          "- 利用可能な勘定科目IDに存在しない値は絶対に使わないでください。",
        ].join("\n")
      : "",
    `勘定科目候補: ${JSON.stringify(accounts.slice(0, 200))}`,
    "",
    splitByTaxRate
      ? '返答例(複数税率): {"transaction_date":"2026-05-15","journal_type":"journal_entry","memo":"receipt import","tags":["AI"],"branches":[{"tax_rate_hint":10,"remark":"店舗名 取引内容 file.jpg (10%対象)","debitor":{"value":1080,"account_id":"..."},"creditor":{"value":1080,"account_id":"..."}},{"tax_rate_hint":8,"remark":"店舗名 取引内容 file.jpg (8%対象)","debitor":{"value":432,"account_id":"..."},"creditor":{"value":432,"account_id":"..."}}]}'
      : '返答例: {"transaction_date":"2026-05-15","journal_type":"journal_entry","memo":"receipt import","tags":["AI"],"branches":[{"remark":"店舗名 取引内容 file.jpg","debitor":{"value":1500,"account_id":"..."},"creditor":{"value":1500,"account_id":"..."}}]}',
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
  taxes = [],
  suspenseAccountId = null,
  businessContextLines = [],
}: {
  ocr: ReceiptOcrResult;
  transactionNote: string;
  voucherFileName: string;
  transactionDate: string;
  needsDateConfirmation: boolean;
  submissionTimestampLabel: string;
  customerJournalPrompt?: string | null;
  accounts: MfAccountOption[];
  taxes?: MfTaxOption[];
  suspenseAccountId?: string | null;
  businessContextLines?: string[];
}) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const taxLookup = buildAccountTaxLookup(accounts);
  const resolveReducedRateTaxId = buildReducedRateTaxResolver(taxes);

  // 免税事業者のMFでは利用可能な税区分が1件も返らない。この場合、税率ごとに
  // 仕訳を分けても両ブランチの科目・税区分が同一になり、金額が割れるだけで
  // 意味がないため、税率による分割や軽減税率への差し替えは一切行わない。
  const usesTaxClassification = taxes.length > 0;
  const splitByTaxRate = ocr.has_multiple_tax_rates && usesTaxClassification;

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
                      splitByTaxRate,
                      businessContextLines,
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

      // 実在しない勘定科目IDが返ってきた場合は、この試行を失敗として扱い
      // 次の試行（別モデルを含む）へ回す。そのまま返すとMFに拒否される。
      const unknownAccountId = findUnknownAccountId(journal.branches, taxLookup);
      if (unknownAccountId) {
        lastError = `Gemini returned an account_id that does not exist in the Money Forward master: ${unknownAccountId}`;
        continue;
      }

      const remark = buildRemark({ ocr, transactionNote, voucherFileName });
      const hasCustomerPrompt =
        typeof customerJournalPrompt === "string" &&
        customerJournalPrompt.trim().length > 0;

      // 複数税率レシートで tax_rate_hint 8 と 10 が両方揃っていない場合は縮退扱い。
      // 税区分を使わない事業者では税率の読み取り結果が仕訳に影響しないため、
      // 「税率を確認してください」という指摘自体が意味を持たず、判定を行わない。
      const hasValidTaxRateHints =
        journal.branches.some((b) => b.tax_rate_hint === 8) &&
        journal.branches.some((b) => b.tax_rate_hint === 10);
      const needsTaxRateReview =
        usesTaxClassification &&
        (ocr.needs_tax_rate_review ||
          (ocr.has_multiple_tax_rates && !hasValidTaxRateHints));

      // 仮計上科目が使えるときだけ科目差し替えを行う。
      // auto-submit 側で未設定・不存在は送信前に弾いているため、ここに来る時点で
      // null なら差し替えは行わない（通常の科目のまま）。
      const resolvedSuspenseAccountId = ocr.has_multiple_account_candidates
        ? suspenseAccountId
        : null;
      const useSuspenseAccount = resolvedSuspenseAccountId !== null;

      const requiredTags =
        needsDateConfirmation || needsTaxRateReview || useSuspenseAccount
          ? ["確認"]
          : [];

      const taxReviewNote = needsTaxRateReview
        ? "（税率が読み取れなかったため仕訳を確認してください）"
        : "";

      const accountReviewNote = useSuspenseAccount
        ? `（複数の勘定科目に分かれる可能性があるため仮計上しています。科目と税区分を確認してください${
            ocr.account_review_reason ? `: ${ocr.account_review_reason}` : ""
          }）`
        : "";

      // 混在レシートでなくても、単一税率が8%だと確認できているレシート
      // （例：全品目が軽減税率対象）は、全ブランチに8%扱いを適用する。
      const singleReceiptRateHint: 8 | 10 | null =
        usesTaxClassification &&
        !ocr.has_multiple_tax_rates &&
        ocr.tax_breakdown?.length === 1
          ? ocr.tax_breakdown[0].rate
          : null;

      // 注記は末尾が切れると意味が失われるため、注記を優先して残し
      // 送信日時ラベル側を縮める。
      const memoNotes = `${taxReviewNote}${accountReviewNote}`;
      const memo = memoNotes
        ? `${submissionTimestampLabel.slice(0, Math.max(0, 200 - memoNotes.length))}${memoNotes}`
            .replace(/\s+/g, " ")
            .slice(0, 200)
        : submissionTimestampLabel.slice(0, 200);

      return {
        ...journal,
        transaction_date: transactionDate,
        memo,
        tags: normalizeTags({
          tags: journal.tags || [],
          allowAdditionalTags: hasCustomerPrompt,
          requiredTags,
        }),
        branches: journal.branches.map(({ tax_rate_hint, ...branch }) => {
          const baseRemark = hasCustomerPrompt
            ? ensureVoucherFileNameInRemark({
                remark: branch.remark,
                fallbackRemark: remark,
                voucherFileName,
              })
            : remark;

          // 複数税率で分割したブランチは、どちらの税率分かが摘要から分かるようにする。
          // 特に仮計上時は税区分が両ブランチとも仮計上科目の既定値になるため、
          // この表記が税率を判別する唯一の手掛かりになる。
          const rateLabel =
            splitByTaxRate && tax_rate_hint ? `(${tax_rate_hint}%対象)` : "";
          const finalRemark = (
            rateLabel && !baseRemark.includes(rateLabel)
              ? `${baseRemark} ${rateLabel}`
              : baseRemark
          )
            .replace(/\s+/g, " ")
            .slice(0, 200);

          // 借方が複数科目に分かれる可能性がある場合は科目を確定させず仮計上科目へ振り替える。
          // このとき税区分は仮計上科目のマスタ既定値をそのまま使い、軽減税率への
          // 差し替えは行わない（科目とあわせて後から人が確定させる運用）。
          const debitorAccountId =
            resolvedSuspenseAccountId ?? branch.debitor.account_id;
          const debitorSubAccountId = useSuspenseAccount
            ? null
            : sanitizeSubAccountId({
                lookup: taxLookup,
                accountId: debitorAccountId,
                subAccountId: branch.debitor.sub_account_id,
              });
          const creditorSubAccountId = sanitizeSubAccountId({
            lookup: taxLookup,
            accountId: branch.creditor.account_id,
            subAccountId: branch.creditor.sub_account_id,
          });

          // まずマスタのデフォルト税区分ID（通常は標準10%側）を取得し、
          // 軽減税率ブランチについては同じ系統の8%区分が見つかればそちらに差し替える。
          // 見つからない場合（免税事業者などマスタに軽減税率区分が存在しない）はデフォルトのまま。
          const baseDebitorTaxId = resolveMasterTaxId({
            lookup: taxLookup,
            accountId: debitorAccountId,
            subAccountId: debitorSubAccountId,
          });
          const effectiveRateHint = tax_rate_hint ?? singleReceiptRateHint;
          const debitorTaxId =
            !useSuspenseAccount && effectiveRateHint === 8
              ? resolveReducedRateTaxId(baseDebitorTaxId) ?? baseDebitorTaxId
              : baseDebitorTaxId;

          return {
            ...branch,
            remark: finalRemark,
            debitor: {
              ...branch.debitor,
              account_id: debitorAccountId,
              sub_account_id: debitorSubAccountId,
              tax_id: debitorTaxId,
            },
            creditor: {
              ...branch.creditor,
              sub_account_id: creditorSubAccountId,
              tax_id: resolveMasterTaxId({
                lookup: taxLookup,
                accountId: branch.creditor.account_id,
                subAccountId: creditorSubAccountId,
              }),
            },
          };
        }),
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
