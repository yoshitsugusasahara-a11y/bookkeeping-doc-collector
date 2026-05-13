import Link from "next/link";
import { Link as LinkIcon, ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <main className="shell">
      <section className="home-hero">
        <p className="eyebrow">Prototype</p>
        <h1>記帳資料回収</h1>
        <p>
          顧客ごとの専用URLから、Googleログインで証憑を送信するためのアプリです。
          顧客用URLは管理画面から作成・確認します。
        </p>
      </section>

      <section className="link-grid compact" aria-label="主要メニュー">
        <Link href="/admin/login" className="nav-card">
          <span className="icon-box" aria-hidden="true">
            <ShieldCheck size={22} />
          </span>
          <span>
            <strong>管理者ログイン</strong>
            <small>顧客の承認、専用URLの確認、Drive保存先、送信履歴を管理します</small>
          </span>
        </Link>
        <Link href="/admin/customers" className="nav-card">
          <span className="icon-box" aria-hidden="true">
            <LinkIcon size={22} />
          </span>
          <span>
            <strong>顧客専用URLを確認</strong>
            <small>顧客ごとのログインURLを作成し、登録済み顧客のURLをコピーできます</small>
          </span>
        </Link>
      </section>
    </main>
  );
}
