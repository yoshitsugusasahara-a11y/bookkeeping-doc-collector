# Codex作業環境メモ

このプロジェクトでCodexが作業するときの前提をまとめます。コミット・プッシュ時にフォルダを取り違えないためのメモです。

## 正しいリポジトリ

GitHub Desktopが見ている本来のリポジトリは次です。

```text
C:\Users\user\Desktop\codex test\bookkeeping-doc-collector
```

GitHubリモートは次です。

```text
https://github.com/yoshitsugusasahara-a11y/bookkeeping-doc-collector.git
```

今後のソース修正、ファイル追加、コミット準備は、原則としてこのフォルダ内で行います。

## 注意が必要なフォルダ

Codexの初期作業フォルダは次になることがあります。

```text
C:\Users\user\Desktop\codex test
```

この親フォルダにも `app`、`lib`、`supabase` などが存在しますが、GitHub Desktopが通常見ているリポジトリではありません。ここだけを編集すると、GitHub Desktopに変更が表示されません。

## GitHub Desktop運用

通常のコミット・プッシュはGitHub Desktopで行います。

1. Current repository が `bookkeeping-doc-collector` になっていることを確認
2. Changes に変更ファイルが表示されていることを確認
3. Summary を入力して Commit
4. Push origin

Codex側で直接 `git add` や `git commit` を実行すると、WindowsユーザーとCodex実行ユーザーの違いにより `dubious ownership` や `.git/index.lock` の権限エラーが出ることがあります。そのため、コミット・プッシュはGitHub Desktopを優先します。

## CodexでGit状態を見る場合

CodexからGit状態を確認する場合は、次のフォルダを対象にします。

```text
C:\Users\user\Desktop\codex test\bookkeeping-doc-collector
```

Codex実行ユーザーが異なるため、必要に応じて一時的に `safe.directory` を指定して確認します。

## 開発サーバー

PowerShellで起動する場合は、PowerShellの実行ポリシー回避のため `npm` ではなく `npm.cmd` を使います。

```powershell
cd "C:\Users\user\Desktop\codex test\bookkeeping-doc-collector"
npm.cmd run dev -- --hostname 127.0.0.1 --port 3000
```

ただし、このフォルダに `node_modules` がない場合は、初回に依存関係のインストールが必要です。

## Vercel / Supabase

本番環境はVercelにデプロイしています。

```text
https://bookkeeping-doc-collector.vercel.app/
```

SupabaseのSQL変更が必要な実装では、CodexがSQL内容を明示し、ユーザーがSupabase SQL Editorで実行します。

## 今後の基本方針

- Codexはまず正しいリポジトリパスを確認する
- 修正は `C:\Users\user\Desktop\codex test\bookkeeping-doc-collector` に入れる
- GitHub Desktopに変更が表示されるかを確認してからコミット案内する
- 親フォルダ `C:\Users\user\Desktop\codex test` だけに変更を残さない
