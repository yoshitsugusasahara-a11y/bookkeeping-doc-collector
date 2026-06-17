export default function Home() {
  return (
    <main className="shell">
      <section className="home-hero">
        <p className="eyebrow">Information</p>
        <h1>お問い合わせ</h1>
        <p>
          本アプリに関するお問い合わせは、下記のお問い合わせフォームよりご連絡ください。
        </p>
        <a
          className="primary-action compact"
          href="https://cloudacc.seventh-sense.co.jp/contact/"
          rel="noreferrer"
          target="_blank"
        >
          お問い合わせフォームへ
        </a>
      </section>
    </main>
  );
}
