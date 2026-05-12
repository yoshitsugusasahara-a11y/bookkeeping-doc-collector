import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function AuthErrorPage() {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <span className="auth-icon error" aria-hidden="true">
          <AlertCircle size={28} />
        </span>
        <p className="eyebrow">Login Error</p>
        <h1>ログインに失敗しました</h1>
        <p>
          Googleログインの設定、またはSupabaseのリダイレクトURLを確認してください。
        </p>
        <Link className="secondary-action" href="/">
          トップへ戻る
        </Link>
      </section>
    </main>
  );
}
