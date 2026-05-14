import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { exchangeMoneyForwardCode } from "@/lib/moneyforward/oauth";
import { createClient } from "@/lib/supabase/server";

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url));
}

function clearOauthCookies(response: NextResponse) {
  response.cookies.set("mf_oauth_state", "", { maxAge: 0, path: "/" });
  response.cookies.set("mf_oauth_client_slug", "", { maxAge: 0, path: "/" });
  response.cookies.set("mf_oauth_account_id", "", { maxAge: 0, path: "/" });
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("mf_oauth_state")?.value;
  const clientSlug = cookieStore.get("mf_oauth_client_slug")?.value;
  const accountId = cookieStore.get("mf_oauth_account_id")?.value;
  const fallbackPath = clientSlug
    ? `/client/${clientSlug}/settings`
    : "/";

  if (error || !code || !state || !expectedState || state !== expectedState) {
    return clearOauthCookies(redirectTo(request, `${fallbackPath}?mf=error`));
  }

  if (!clientSlug || !accountId) {
    return clearOauthCookies(redirectTo(request, "/"));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return clearOauthCookies(redirectTo(request, `/client/${clientSlug}`));
  }

  const { data: account } = await supabase
    .from("customer_accounts")
    .select("id, approval_status")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .eq("client_slug", clientSlug)
    .maybeSingle();

  if (!account || account.approval_status !== "approved") {
    return clearOauthCookies(redirectTo(request, `/client/${clientSlug}/settings?mf=error`));
  }

  try {
    const token = await exchangeMoneyForwardCode(code);
    const expiresAt =
      typeof token.expires_in === "number"
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null;

    const { error: upsertError } = await supabase
      .from("mf_connections")
      .upsert(
        {
          customer_account_id: account.id,
          user_id: user.id,
          access_token: token.access_token,
          refresh_token: token.refresh_token ?? null,
          token_type: token.token_type ?? null,
          scope: token.scope ?? null,
          expires_at: expiresAt,
          connected_at: new Date().toISOString(),
        },
        { onConflict: "customer_account_id" },
      );

    if (upsertError) {
      throw upsertError;
    }

    return clearOauthCookies(
      redirectTo(request, `/client/${clientSlug}/settings?mf=connected`),
    );
  } catch {
    return clearOauthCookies(
      redirectTo(request, `/client/${clientSlug}/settings?mf=error`),
    );
  }
}
