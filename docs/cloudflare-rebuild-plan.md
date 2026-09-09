# Cloudflare本番環境の構築計画

2026-09-07作成。現行のVercel+Supabase環境を「検証環境」と位置づけ、Cloudflareスタックで**本番環境を新規構築**するための計画。

> **このファイルは役目を終えた。2026-09-09に `bookkeeping-doc-collector-cf` リポジトリの
> `docs/cloudflare-rebuild-plan.md` へ移設済みで、正はそちら。**
> ここに残しているのは当時の経緯の記録としてのみ。**このファイルを更新しないこと。**

## このリポジトリ側で意識すべきこと（並行開発の取り決め）

**現行環境の開発は止めない。** 別リポジトリなのでgitの衝突は起きず、Cloudflare側はこちらを
**読むだけ**。加えて最優先の課題（OCRの滞留）は本番顧客に発生中で、待たせる理由がない。

ただし**Cloudflare側へ持ち込むファイルを変更したときだけ**、向こうへ反映漏れが起きうる。
持ち込み対象は次の範囲。

- `lib/gemini/`（OCR・分類・仕訳生成のプロンプト）
- `lib/moneyforward/`（APIクライアント・予測仕訳・事業者情報・エラー文言の分類・会計年度）
- `lib/receipts/send-mode.ts`
- `lib/images/shrink-image.ts`
- `docs/`（仕様資料）

**申し送りではなくコミットで管理する。** Cloudflare側は「どの時点のコードを写したか」を
自分のリポジトリに記録する。写した時点が `<sha>` なら、差分は次で機械的に出せる。

```
git log <sha>..main -- lib/gemini lib/moneyforward lib/receipts/send-mode.ts lib/images/shrink-image.ts docs
```

移設時点のコミットは **`be9e8c4166fe9a89173c91cf2e62dee75618febc`**（2026-09-09 19:44）。
Cloudflare側がフェーズ2-4のコピーを行った実際のコミットに読み替えること。

**`lib/receipts/process-submissions.ts` は持ち込み対象に含まれない。** OCRの処理フローは
Queues前提で作り直す（フェーズ4-3）ため、こちらでいくら変更しても向こうへ写す必要がない。
つまり**残作業の大半は反映漏れの心配がない領域**にある。

---

## 1. 前提（2026-09-02にユーザーが決定）

| 項目 | 決定 |
|---|---|
| 第一目的 | **本番環境として作り直すこと。** 制限の解消は二次的 |
| 「本番環境」の条件 | **Cloudflareで動いていること**（コストと管理のしやすさから判断） |
| 完成目標 | **11月下旬** |
| 一般リリース | **12月** |
| 新規モニター2〜3社 | **10月中旬以降**に本番環境で受け入れ |
| データ移行 | **行わない。** 市道さん・須藤さんは現行環境を継続し、次年度から新規で開始 |
| ダウンタイム | 並行稼働のため考慮不要 |

**移行ではなく並行構築。** 切り替えの瞬間が存在しないため、間に合わなければ延期できる。現行環境の保守は並行して続ける。

## 2. 採用スタック

- **Next.js（App Router）を Workers で**（`@opennextjs/cloudflare`）
  - **Vinext等への乗り換えはしない。** 既存コードが相当量あり、フレームワーク変更は移植ではなく作り直しになる
- **D1**（DB）／**R2**（ストレージ）／**Better Auth**（認証）
- **Queues**（バックグラウンド処理）— **このアプリでは本命。** 有料プラン（Workers Paid）が必要な見込み
- **Stripeは不要**（この事業の課金経路と無関係）

### Queuesが本命である理由

現行のOCR処理は `after()`（リクエストの余韻）で動いており、キューではない。そのため
処理中の印・リトライ・上限をすべて自前で持つ必要があり、2026-09-02に「一括アップロード時に
大半のレシートが未処理で残る」不具合として表面化した（重複処理と取りこぼし）。

Queuesなら 1レシート＝1メッセージ、可視性タイムアウトが処理中ロックそのもの、
リトライとバックオフは標準装備、実行時間の壁時計制限もない。**同じ不具合が構造的に起きない。**

またWorkersの実行時間はCPU時間で計測されるため、Geminiの応答を10〜20秒待つI/O待ちが
上限を食わない。Vercelの60秒（壁時計）とは根本的に相性が違う。

## 3. 作業フォルダとリポジトリ

**別リポジトリ・別作業フォルダにする。**

- 現行: `C:\Users\user\Documents\GitHub\bookkeeping-doc-collector`（Vercel+Supabase。保守を継続）
- 新規: `C:\Users\user\Documents\GitHub\<新リポジトリ名>`（Cloudflare）

理由:

1. **設定ファイルと依存が正面衝突する。** `vercel.json` と `wrangler.toml`、`@supabase/supabase-js` と Better Auth＋D1ドライバ。同一リポジトリの別ブランチでは `package.json` と lockfile が恒常的にコンフリクトする
2. **現行の `main` は常にVercelへデプロイできる状態でなければならない。** 一方Cloudflare版は長期間「まだ動かない」状態が続く。誤マージ1回で本番が壊れる
3. 共有したいコード（Geminiプロンプト、MF APIクライアント、仕訳ルール）も、認証・DB・ストレージの取り回しが変わるため結局書き換えが入る。最初に一度コピーして別々に育てるのが素直

**作業フォルダを分けると、Claude Codeの記憶（`~/.claude/projects/<作業フォルダ由来の名前>/memory/`）も別空間になる。**
記録が混ざらない利点がある一方、**現行の記憶は新セッションに引き継がれない。**
そのため知識は「リポジトリ内のファイル」として持ち込む（下記フェーズ2）。

## 4. タスク一覧

担当が「ユーザー」のものは、ブラウザ認証・課金・アカウント操作などClaudeが代行できないもの。

### フェーズ0: 決めたこと（2026-09-07 ユーザー回答）

- [x] **0-1. リポジトリ名 = `bookkeeping-doc-collector-cf`**
- [x] 0-2. **まず無料プランで始め、必要になった時点で有料へ切り替える**
  - **2026-09-09に Workers Paid（$5/月＋従量）へ切り替え済み。** これで下記2点の保留が解消した
    - **Queues が使えるようになった** → フェーズ3-3に着手可能
    - **CPU時間の上限が 10ms から5分になった** → 「無料プランではNext.jsのサーバーレンダリングが厳しいかもしれない」という懸念は消滅。実際に雛形をデプロイして表示を確認済み
- [x] 0-3. **独自ドメインを取得し、サブドメインで運用する**（技術的な問題はない）
  - **ホスト名は認証の設定より前に確定させる。** Google OAuth と Money Forward の両方にリダイレクトURIを登録するため、後から変えると二重の手戻りになる
  - DNSをCloudflareで管理できるかを先に確認する。既存の会社ドメインのサブドメインにする場合はDNSレコードの追加に社内調整が必要
  - 検証用のホスト名を別に用意し、本番オリジンを安定させる（`*.workers.dev` で足りる）

### フェーズ1: 環境の用意（2026-09-09 完了。1-5を除く）

- [x] 1-1. GitHubで新リポジトリを作成（private）— `yoshitsugusasahara-a11y/bookkeeping-doc-collector-cf`
- [x] 1-2. 新しい作業フォルダにクローン — `C:/Users/user/Documents/GitHub/bookkeeping-doc-collector-cf`
- [x] 1-3. `npx wrangler login` — 完了（アカウントID `1bb3e8b2ae7c0c61808221c936f89641`）
- [x] 1-4. Next.js + `@opennextjs/cloudflare` の雛形作成とデプロイ疎通 — **完了**
  - 公開URL: `https://bookkeeping-doc-collector-cf.yoshitsugu-sasahara.workers.dev`（雛形ページの表示を確認）
  - Next.js **16.3.4** / `@opennextjs/cloudflare` 1.20.6 / wrangler 4.129
  - バインディングは `ASSETS` / `IMAGES` / `WORKER_SELF_REFERENCE` の3つ（D1・R2・Queuesはフェーズ3で追加）
  - `compatibility_date` 2026-09-01、フラグ `nodejs_compat` `global_fetch_strictly_public`
- [x] **1-6. Git連携ビルド（Workers Builds）を設定** — 計画に無かったが追加した（理由は下記）
  - Build command: `npx opennextjs-cloudflare build`
    - **`npm run build` では動かない。** `next build` だけが走って `.next/` しか作られず、`wrangler.jsonc` の `main` が指す `.open-next/worker.js` ができないためデプロイが失敗する
  - Deploy command: `npx wrangler deploy` / Version command: `npx wrangler versions upload` / Root directory: `/`
  - Production branch `main`、非本番ブランチのビルドも有効
  - **`main` へのプッシュでビルドとデプロイが走る。手元からのデプロイは不要。**
- [ ] 1-5. シークレットの置き方の整備（`wrangler secret`）と `.gitignore`
  - **値の登録はユーザーが行う。** Claudeは認証情報を扱わない
  - 必要になるのはフェーズ3以降（Gemini APIキー、MF・Google のクライアントシークレットなど）

#### 1-6を追加した理由（Windowsビルドを本番経路から外す）

ローカルの `opennextjs-cloudflare build` は成功するが、次の警告が出る。

```
WARN OpenNext is not fully compatible with Windows.
WARN For optimal performance, it is recommended to use WSL.
WARN While OpenNext may function on Windows, it could encounter unpredictable failures during runtime.
```

手元からデプロイすると、**このPCでビルドした成果物がそのまま本番へ出る。** 現行のVercelはビルドがVercel側のLinuxで走っており、ローカル環境は本番の成果物に関与していない。Cloudflare側も同じ形に揃えるべきと判断した。WSLを導入する案より、**本番の成果物をローカル環境に依存させない**ほうが本質的。ローカルは `wrangler dev` での確認に使う。

#### 運用の取り決め（2026-09-09 ユーザー指示）

**ユーザーはターミナル操作を行わない。** 調査・設定画面の入力・画面遷移・コマンド実行はClaudeが行う（ブラウザ操作を含む）。ユーザーに依頼するのは次の3種類だけ。

1. **認可・同意**（OAuth許可、規約同意、GitHub Appのインストール）
2. **認証**（パスワード入力、アカウント作成）
3. **課金**（プラン申し込み、支払い情報）

なお **Claudeの自動許可判定は外部公開を伴う操作を止める。** 手元からの `npm run deploy` は実際にブロックされた（1-6のGit連携により、そもそも不要になった）。同様に **Claudeが自分の権限設定を書き換えることもできない。** 権限ルールを足す必要が生じた場合は `~/.claude/settings.json` をユーザーが編集する。

#### まだ決まっていないこと

- **ホスト名（0-3）** — フェーズ3-5（Better Auth + Google OAuth）より前に確定させる。独自ドメインを新規取得するか、会社ドメイン（000g.jp）のサブドメインにするか。検証中は `*.workers.dev` で足りる
- **Observability が無効** — Workers Logs / Traces がどちらも Disabled。フェーズ3のスパイクではログが必要になるので、着手時に有効化を検討する（有料プランの従量課金対象）
- **Next.js のバージョン差** — 現行は15、新規は**16.3.4**。`lib/` のコードを持ち込む際に Server Actions や `after()` の扱いに差分が出る可能性がある。フェーズ3-1の確認項目に含める

### フェーズ2: 知識の引き継ぎ（担当: Claude）

- [ ] 2-1. 新リポジトリの `CLAUDE.md` を作成（下記「引き継ぐ知識」を移植）
- [ ] 2-2. このファイルを新リポジトリへ移設し、経緯を追記
- [ ] 2-3. 仕様資料のコピー（`docs/product-spec.md`、`docs/mf-error-messages.md`、`docs/moneyforward-accounting-plan.md`）
- [ ] 2-4. 再利用コードの棚卸しとコピー（`lib/gemini/*` のプロンプト、`lib/moneyforward/*`、`lib/receipts/send-mode.ts`、`lib/moneyforward/error-message.ts`、`lib/images/shrink-image.ts`）
- [ ] 2-5. 新セッションの記憶を初期化（`migration_` 接頭辞で記録）

### フェーズ3: 技術検証（スパイク／担当: Claude）

**設計の前に置く。** ここで外すと設計を書き直すことになる。各項目「動く／動かない／代替案」を1枚にまとめる。

- [ ] 3-1. **Next.js App Router on Workers** — Server Actions、`after()` 相当のバックグラウンド処理、`revalidatePath`
- [ ] 3-2. **`googleapis` が Workers で動くか** — 動かなければ Drive REST 直叩きへ切り替える判断（影響が小さくない）
- [ ] 3-3. **Queues + D1 の疎通** — 1レシート1メッセージの最小形
- [ ] 3-4. **R2** — アップロードと参照（署名付きURL）
- [ ] 3-5. **Better Auth + Google OAuth** — 管理者・顧客の2系統

### フェーズ4: 設計（検証結果を反映／担当: Claude→ユーザー承認）

- [ ] 4-1. **アクセス制御（RLS → アプリ層）** ★**最大の作業。会計データを扱うため最も丁寧にやる**
- [ ] 4-2. データモデル（列挙型・`timestamptz` の置き換え、サムネイルをDBからR2へ）
- [ ] 4-3. OCRパイプライン（Queues前提。重複・取りこぼしが構造的に起きない形）
- [ ] 4-4. 外部連携の本番分離（MF OAuthアプリ、Drive の GCP プロジェクト分離、Chatwork、ドメイン）
- [ ] 4-5. 「移行しない」範囲の再確認（既存2社は現行環境のまま）

→ **ここまで完了して開発開始**

## 5. 新リポジトリへ引き継ぐ知識

現行リポジトリの `CLAUDE.md` から、スタックに依存せず有効なもの。

### そのまま引き継ぐ

- **サービスの位置づけ**「AIが記帳を代行するのではなくアシストする」。自動送信は既定オフ・顧客本人のみ有効化・同意者と日時を記録／予測仕訳を送信前に表示／税務判断は保証しない
- **Money Forward APIの仕様**: 税区分の税率は `tax_rate`（小数）で `rate` ではない／軽減税率は「(軽)」表記／同じ系統の8%版を選ぶ／事業者情報は複数形 `/api/v3/offices`／免税事業者では `taxes?available=true` が空配列／勘定科目マスタの `tax_id` は常に信頼する
- **Geminiは存在しない勘定科目IDを作る。** 生成時にマスタと突き合わせ、不正ならリトライ
- **OCRは一度完了すると再実行しない。** プロンプト変更の検証は「読み取り直す」で行う
- **予測仕訳は生成時のまま保存し送信時に作り直さない**（画面で見た仕訳がそのまま送られる保証）
- **顧客向けエラー文言は対応表と対で管理する**（`docs/mf-error-messages.md`）
- **進め方**: 実装着手には都度の明示的な承諾が必要／やり取りは日本語／課題管理表（スプレッドシート）はClaudeが更新する

### 読み替えて引き継ぐ

- **RLSの落とし穴3件** — D1にRLSはない。「DBが守ってくれる前提を置かない」という教訓として引き継ぎ、アプリ層の設計に反映する
- **Vercel固有の制約**（4.5MBボディ上限、`serverActions.bodySizeLimit` は experimental 配下、`after()` の実行時間）— Cloudflareでは前提が変わる。**ただし画像縮小（`lib/images/shrink-image.ts`）は帯域と体感速度の面で残す価値がある**
- **Vercelログは1時間で消える** → Cloudflareのログ保持を確認し、アプリ側の実行ログ（現行の `activity_logs` 相当）は必ず持つ

### 引き継がない

- Supabase固有の運用（RLSポリシー、`createAdminClient()`、Storageバケット）
- Vercel Cronの1日1回制限にまつわる回避策
- 現行環境の未対応TODO（現行セッション側で管理を続ける）

## 6. 現行環境側の残作業（このリポジトリで継続）

Cloudflare構築とは独立に、現行環境で続ける保守。

- 予測仕訳の上限20件が効いてしまう問題（アップロード・Cron両経路）
- 送信済み元ファイルの削除漏れ（RLSで黙って失敗する）
- Cronの未完走（16日中5日 `cron_run` サマリーなし・原因未特定）
- 分類ルールごとのDriveフォルダIDに検証がない（顧客単位の検証は2026-09-07に対応済み）
