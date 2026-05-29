import Link from "next/link";
import { AlertCircle } from "lucide-react";

function getSafeReturnPath(value?: string | null) {
  if (!value) return "/admin/login";
  if (value === "/admin/login") return value;

  const clientMatch = value.match(/^\/client\/([^/?#]+)$/);
  if (clientMatch?.[1]) return `/client/${clientMatch[1]}`;

  return "/admin/login";
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const returnPath = getSafeReturnPath(next);

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <span className="auth-icon error" aria-hidden="true">
          <AlertCircle size={28} />
        </span>
        <p className="eyebrow">Login Error</p>
        <h1>ログインに失敗しました</h1>
        <p>
          一時的にログイン処理が完了しませんでした。時間をおいて再度お試しください。
        </p>
        <Link className="secondary-action" href={returnPath}>
          ログイン画面へ戻る
        </Link>
      </section>
    </main>
  );
}
