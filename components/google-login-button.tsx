"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

type GoogleLoginButtonProps = {
  nextPath: string;
  returnPath?: string;
  label?: string;
};

export function GoogleLoginButton({
  nextPath,
  returnPath,
  label = "Googleでログイン",
}: GoogleLoginButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function signInWithGoogle() {
    setIsLoading(true);
    setErrorMessage("");

    const supabase = createClient();
    await supabase.auth.signOut();

    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", nextPath);
    if (returnPath) {
      callbackUrl.searchParams.set("returnTo", returnPath);
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error) {
      setErrorMessage("ログインを開始できませんでした。時間をおいて再度お試しください。");
      setIsLoading(false);
    }
  }

  return (
    <div className="auth-action">
      <button
        className="primary-action"
        type="button"
        onClick={signInWithGoogle}
        disabled={isLoading}
      >
        <LogIn size={20} />
        <span>{isLoading ? "ログインへ移動中..." : label}</span>
      </button>
      {errorMessage && <p className="form-error">{errorMessage}</p>}
    </div>
  );
}
