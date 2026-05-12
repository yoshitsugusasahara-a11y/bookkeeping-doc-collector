import Link from "next/link";
import { Camera, FileText } from "lucide-react";
import { GoogleLoginButton } from "@/components/google-login-button";

export default async function ClientLoginPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const { clientSlug } = await params;

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <span className="auth-icon" aria-hidden="true">
          <Camera size={30} />
        </span>
        <p className="eyebrow">Client Login</p>
        <h1>証憑を送信する</h1>
        <p>
          Googleアカウントでログインして、領収書や請求書などの資料を1枚ずつ送信します。
        </p>
        <GoogleLoginButton
          nextPath={`/client/${clientSlug}/signup`}
          label="Googleで顧客ログイン"
        />
        <Link className="text-link" href={`/client/${clientSlug}/submissions`}>
          <FileText size={16} />
          送信履歴のサンプルを見る
        </Link>
      </section>
    </main>
  );
}
