import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { GoogleLoginButton } from "@/components/google-login-button";

export default function AdminLoginPage() {
  return (
    <main className="auth-shell admin-auth">
      <section className="auth-panel">
        <span className="auth-icon" aria-hidden="true">
          <ShieldCheck size={30} />
        </span>
        <p className="eyebrow">Admin Login</p>
        <h1>管理者ログイン</h1>
        <p>
          顧客アカウントの承認、Google Drive保存先、送信履歴を管理します。
        </p>
        <GoogleLoginButton
          nextPath="/admin/customers"
          label="Googleで管理者ログイン"
        />
        <Link className="text-link" href="/">
          トップへ戻る
        </Link>
      </section>
    </main>
  );
}
