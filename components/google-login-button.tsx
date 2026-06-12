"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

type GoogleLoginButtonProps = {
  nextPath: string;
  label?: string;
};

export function GoogleLoginButton({
  nextPath,
  label = "Googleでログイン",
}: GoogleLoginButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function signInWithGoogle() {
    setIsLoading(true);
    setErrorMessage("");

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      nextPath,
    )}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (error) {
      setErrorMessage("ログインを開始できませんでした。設定を確認してください。");
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
