import Link from "next/link";
import { Building2, ShieldCheck, UploadCloud } from "lucide-react";

const links = [
  {
    href: "/client/tokyo-shokai",
    title: "顧客ログイン",
    description: "顧客専用URLからGoogleログインして資料を送信します",
    icon: UploadCloud,
  },
  {
    href: "/client/tokyo-shokai/submissions",
    title: "顧客送信履歴",
    description: "送信済みの画像と取引内容を確認するサンプル画面",
    icon: Building2,
  },
  {
    href: "/admin/login",
    title: "管理者ログイン",
    description: "Googleログイン後に顧客承認と送信履歴を管理します",
    icon: ShieldCheck,
  },
];

export default function Home() {
  return (
    <main className="shell">
      <section className="home-hero">
        <p className="eyebrow">Prototype</p>
        <h1>記帳資料回収</h1>
        <p>
          Vercel、Supabase、Google Driveで運用する前提の画面プロトタイプです。
          Googleログインの入口を追加し、顧客画面と管理者画面の流れを確認できます。
        </p>
      </section>

      <section className="link-grid" aria-label="画面一覧">
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <Link href={item.href} className="nav-card" key={item.href}>
              <span className="icon-box" aria-hidden="true">
                <Icon size={22} />
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
