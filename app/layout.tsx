import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "記帳資料回収",
  description: "記帳代行サービス向けの証憑回収プロトタイプ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
