# Development Notes

このプロジェクトで作業するときは、以下を必ず確認してください。

## プロジェクト概要

記帳代行事務所（Seventh Sense）が顧客（クライアント企業）から領収書・証憑を回収し、マネーフォワード会計へ自動仕訳登録するWebアプリ。

**主な処理フロー**

1. 顧客がスマホで領収書を撮影・アップロード
2. Gemini API で即時OCR（日付・金額・店舗・支払方法を抽出）
3. Google Drive に保存（顧客ごとのフォルダへ）
4. Money Forward に仕訳送信 + 証憑添付（手動ボタン または 深夜Cron）

**OCRとMF送信のタイミング**

- OCR: アップロード直後に即時処理
- MF送信: ①顧客が履歴画面のMF送信ボタンを押したとき、または②深夜Cronで自動処理
  - 基本はCronで自動処理されるためボタン操作は不要。任意のタイミングで送りたいときだけボタンを使う

**マネーフォワード連携**

- 顧客（クライアント企業）が各自のMFアカウントをOAuthで連携する
- `mf_connections` テーブルに顧客ごとのアクセストークンを保存

**資料分類ルール**

- Seventh Sense側（管理者）が顧客ごとに設定する
- 顧客は設定しない

**稼働状況**

- 稼働直前。すでに1社の顧客環境と連携済みで入力可能な状態

## 正しい作業フォルダ

- 実際のアプリ本体は `C:\Users\user\Documents\GitHub\bookkeeping-doc-collector` です。
- 明示的な指示がない限り、コード修正・ビルド確認・Git確認は必ず `bookkeeping-doc-collector` フォルダ内で行います。
- 古い `C:\Users\user\Desktop\codex test\bookkeeping-doc-collector` および `C:\Users\user\Documents\GitHub\bookkeeping-doc-collector_old` は触らない。

## ビルド確認

ローカルでビルド確認する場合は、`C:\Users\user\Documents\GitHub\bookkeeping-doc-collector` で次を実行します。

```powershell
npm run build
```

複数の lockfile に関する警告が表示されることがありますが、以前から確認されている警告です。ビルドが成功しているかを優先して確認します。

## Git / GitHub Desktop 運用

- コミット・プッシュは基本的にユーザーが GitHub Desktop で実行します。
- Claude側で勝手にコミット・プッシュしません。必要な場合はユーザーの明示的な依頼を待ちます。
- コミット・プッシュ前には、Claudeが必ず変更内容の Push Summary を作成してユーザーに表示します。
- Summary は GitHub Desktop のコミットメッセージや説明欄に使えるよう、短く分かりやすくまとめます。
- 過去に反映済みだった機能の復旧が必要な場合は、GitHubの履歴を参照して差分確認できます。

## デプロイ

- Vercel は GitHub の `main` ブランチを元にデプロイします。
- 環境変数を Vercel で変更した場合は、変更を反映するために Redeploy が必要です。
- `vercel.json` の Cron は UTC で指定します。日本時間24:00は `0 15 * * *` です。

## 注意事項

- `.env.local` などの秘密情報は Git に含めません。
- Google Drive と Money Forward 側に保存済みの資料・仕訳は、アプリ内データ削除とは別管理です。
- Supabase の SQL 変更が必要な場合は、実行する SQL を先にユーザーへ提示してから進めます。
