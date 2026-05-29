import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth/profile";

function getSafeSuccessPath(value: string | null) {
  if (!value) return "/";
  if (value.startsWith("/client/") || value.startsWith("/admin/")) return value;
  return "/";
}

function getSafeErrorPath(value: string | null) {
  if (!value) return "/admin/login";
  if (value.startsWith("/admin/")) return "/admin/login";

  const clientMatch = value.match(/^\/client\/([^/?#]+)/);
  if (clientMatch?.[1]) return `/client/${clientMatch[1]}`;

  return "/admin/login";
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");
  const safeNext = getSafeSuccessPath(next);
  const safeErrorNext = getSafeErrorPath(next);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        try {
          await ensureProfile(supabase, user);
        } catch (profileError) {
          console.error("Failed to save profile after login", profileError);
        }
      }

      return NextResponse.redirect(new URL(safeNext, requestUrl.origin));
    }

    console.error("Supabase OAuth callback failed", {
      message: error.message,
      code: error.code,
      status: error.status,
      next: safeNext,
    });
  }

  const errorUrl = new URL("/auth/error", requestUrl.origin);
  errorUrl.searchParams.set("next", safeErrorNext);
  return NextResponse.redirect(errorUrl);
}
