const AUTHORIZATION_URL = "https://api.biz.moneyforward.com/authorize";
const TOKEN_URL = "https://api.biz.moneyforward.com/token";

const DEFAULT_SCOPES = [
  "mfc/accounting/offices.read",
  "mfc/accounting/accounts.read",
  "mfc/accounting/taxes.read",
  "mfc/accounting/journal.write",
  "mfc/accounting/voucher.write",
];

type MoneyForwardTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
};

export function getMoneyForwardConfig() {
  const clientId = process.env.MF_CLIENT_ID;
  const clientSecret = process.env.MF_CLIENT_SECRET;
  const appBaseUrl = process.env.APP_BASE_URL;
  const redirectUri =
    process.env.MF_REDIRECT_URI ||
    (appBaseUrl ? `${appBaseUrl}/api/moneyforward/callback` : undefined);
  const scopes = (process.env.MF_OAUTH_SCOPES || DEFAULT_SCOPES.join(" "))
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes,
  };
}

export function buildMoneyForwardAuthorizationUrl(state: string) {
  const config = getMoneyForwardConfig();

  if (!config) {
    throw new Error("Money Forward OAuth settings are missing.");
  }

  const url = new URL(AUTHORIZATION_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);

  return url;
}

export async function exchangeMoneyForwardCode(code: string) {
  const config = getMoneyForwardConfig();

  if (!config) {
    throw new Error("Money Forward OAuth settings are missing.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });
  const basicAuth = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = (await response.json().catch(() => ({}))) as
    | MoneyForwardTokenResponse
    | { error?: string; error_description?: string };

  if (!response.ok || !("access_token" in payload)) {
    const message =
      "error_description" in payload && payload.error_description
        ? payload.error_description
        : "Money Forward token request failed.";
    throw new Error(message);
  }

  return payload;
}
