# Development Notes

このプロジェクトで作業するときは、以下を必ず確認してください。

## 正しい作業フォルダ

- 実際のアプリ本体は `C:\Users\user\Desktop\codex test\bookkeeping-doc-collector` です。
- `C:\Users\user\Desktop\codex test` 直下にも古いアプリ関連ファイルが残っていることがありますが、通常は編集対象ではありません。
- 明示的な指示がない限り、コード修正・ビルド確認・Git確認は必ず `bookkeeping-doc-collector` フォルダ内で行います。

## ビルド確認

ローカルでビルド確認する場合は、`C:\Users\user\Desktop\codex test\bookkeeping-doc-collector` で次を実行します。

```powershell
..\node_modules\.bin\next.cmd build
```

複数の lockfile に関する警告が表示されることがありますが、以前から確認されている警告です。ビルドが成功しているかを優先して確認します。

## Git / GitHub Desktop 運用

- コミット・プッシュは基本的にユーザーが GitHub Desktop で実行します。
- Codex 側で勝手にコミット・プッシュしません。必要な場合はユーザーの明示的な依頼を待ちます。
- コミット・プッシュ前には、Codex が必ず変更内容の Summary を作成してユーザーに表示します。
- Summary は GitHub Desktop のコミットメッセージや説明欄に使えるよう、短く分かりやすくまとめます。
- 過去に反映済みだった機能の復旧が必要な場合は、GitHub の履歴を参照して差分確認できます。

## デプロイ

- Vercel は GitHub の `main` ブランチを元にデプロイします。
- 環境変数を Vercel で変更した場合は、変更を反映するために Redeploy が必要です。

## 注意事項

- `.env.local` などの秘密情報は Git に含めません。
- Google Drive と Money Forward 側に保存済みの資料・仕訳は、アプリ内データ削除とは別管理です。
- Supabase の SQL 変更が必要な場合は、実行する SQL を先にユーザーへ提示してから進めます。
