import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { buildMoneyForwardAuthorizationUrl } from "@/lib/moneyforward/oauth";
import { createClient } from "@/lib/supabase/server";

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url));
}

export async function GET(request: NextRequest) {
  const clientSlug = request.nextUrl.searchParams.get("clientSlug");

  if (!clientSlug) {
    return redirectTo(request, "/");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectTo(request, `/client/${clientSlug}`);
  }

  const { data: account } = await supabase
    .from("customer_accounts")
    .select("id, approval_status")
    .eq("user_id", user.id)
    .eq("client_slug", clientSlug)
    .maybeSingle();

  if (!account) {
    return redirectTo(request, `/client/${clientSlug}/signup`);
  }

  if (account.approval_status !== "approved") {
    return redirectTo(request, `/client/${clientSlug}/pending`);
  }

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  const secure = request.nextUrl.protocol === "https:";

  cookieStore.set("mf_oauth_state", state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure,
  });
  cookieStore.set("mf_oauth_client_slug", clientSlug, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure,
  });
  cookieStore.set("mf_oauth_account_id", account.id, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure,
  });

  try {
    return NextResponse.redirect(buildMoneyForwardAuthorizationUrl(state));
  } catch {
    return redirectTo(request, `/client/${clientSlug}/settings?mf=missing_config`);
  }
}
