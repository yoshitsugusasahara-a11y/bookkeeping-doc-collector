import { getMoneyForwardConfig } from "./oauth";

const ACCOUNTING_API_BASE_URL = "https://api-accounting.moneyforward.com";
const TOKEN_URL = "https://api.biz.moneyforward.com/token";

export type MoneyForwardConnection = {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
};

export type MoneyForwardRefreshResult = {
  access_token: string;
  refresh_token: string | null;
  token_type: string | null;
  scope: string | null;
  expires_at: string | null;
};

export type MoneyForwardVoucherFile = {
  file_name: string;
  file_data: string;
};

export type MoneyForwardVoucherResponse = {
  voucher_file_ids?: Array<{
    file_name: string;
    file_id: string;
  }>;
};

function getBasicAuthHeader() {
  const config = getMoneyForwardConfig();

  if (!config) {
    throw new Error("Money Forward OAuth settings are missing.");
  }

  return `Basic ${Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64")}`;
}

function shouldRefreshToken(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - Date.now() < 5 * 60 * 1000;
}

export async function refreshMoneyForwardToken(refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: getBasicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || typeof payload.access_token !== "string") {
    const message =
      typeof payload.error_description === "string"
        ? payload.error_description
        : "Money Forward token refresh failed.";
    throw new Error(message);
  }

  return {
    access_token: payload.access_token,
    refresh_token:
      typeof payload.refresh_token === "string"
        ? payload.refresh_token
        : refreshToken,
    token_type:
      typeof payload.token_type === "string" ? payload.token_type : null,
    scope: typeof payload.scope === "string" ? payload.scope : null,
    expires_at:
      typeof payload.expires_in === "number"
        ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
        : null,
  } satisfies MoneyForwardRefreshResult;
}

export async function getValidMoneyForwardAccessToken(
  connection: MoneyForwardConnection,
) {
  if (!shouldRefreshToken(connection.expires_at)) {
    return null;
  }

  if (!connection.refresh_token) {
    throw new Error("Money Forward refresh token is missing.");
  }

  return refreshMoneyForwardToken(connection.refresh_token);
}

export async function moneyForwardAccountingFetch({
  accessToken,
  path,
  method = "GET",
  body,
}: {
  accessToken: string;
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
}) {
  const response = await fetch(`${ACCOUNTING_API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : `Money Forward API request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

export async function postMoneyForwardJournal({
  accessToken,
  journal,
}: {
  accessToken: string;
  journal: Record<string, unknown>;
}) {
  return moneyForwardAccountingFetch({
    accessToken,
    path: "/api/v3/journals",
    method: "POST",
    body: { journal },
  });
}

export async function getMoneyForwardAccounts(accessToken: string) {
  return moneyForwardAccountingFetch({
    accessToken,
    path: "/api/v3/accounts",
  }) as Promise<{ accounts?: unknown[] }>;
}

export async function getMoneyForwardTaxes(accessToken: string) {
  return moneyForwardAccountingFetch({
    accessToken,
    path: "/api/v3/taxes",
  }) as Promise<{ taxes?: unknown[] }>;
}

export async function postMoneyForwardVouchers({
  accessToken,
  journalId,
  voucherFiles,
}: {
  accessToken: string;
  journalId: string;
  voucherFiles: MoneyForwardVoucherFile[];
}) {
  return moneyForwardAccountingFetch({
    accessToken,
    path: "/api/v3/vouchers",
    method: "POST",
    body: {
      journal_id: journalId,
      voucher_files: voucherFiles,
    },
  }) as Promise<MoneyForwardVoucherResponse>;
}

export function buildVoucherFileName({
  date,
  amount,
  isCreditCard,
  extension,
}: {
  date: string | null;
  amount: number | null;
  isCreditCard: boolean | null;
  extension: string;
}) {
  const compactDate = (date || "unknown-date").replaceAll("-", "");
  const amountText = typeof amount === "number" ? String(amount) : "unknown";
  const payment = isCreditCard ? "CC" : "cash";
  return `${compactDate}_${amountText}_${payment}.${extension}`;
}

export function getExtensionFromMimeType(mimeType: string, fileName: string) {
  const lowerName = fileName.toLowerCase();
  const extension = lowerName.match(/\.([a-z0-9]+)$/)?.[1];
  if (extension) return extension;
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("heic")) return "heic";
  if (mimeType.includes("heif")) return "heif";
  if (mimeType === "application/pdf") return "pdf";
  return "jpg";
}
