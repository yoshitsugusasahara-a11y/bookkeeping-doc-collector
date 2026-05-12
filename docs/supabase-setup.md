# Supabase設定手順

## 1. Supabaseプロジェクトを作成

Supabaseで新しいプロジェクトを作成する。

控える値:

- Project URL
- Publishable key または anon public key
- service_role key

## 2. 環境変数を設定

`.env.example`をコピーして、`.env.local`を作成する。

```powershell
copy .env.example .env.local
```

`.env.local`にSupabaseの値を入れる。

```text
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SupabaseのPublishable key
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY`は管理者用の強いキーなので、ブラウザ側には出さない。

## 3. テーブルを作成

SupabaseのSQL Editorを開き、`supabase/schema.sql`の内容を貼り付けて実行する。

作成される主なテーブル:

- `profiles`: ログインユーザーの基本情報
- `customer_accounts`: 顧客名、承認状態、顧客専用URL、Drive保存先
- `admin_users`: 管理者として扱うメール・ユーザー
- `submissions`: 顧客が送信した証憑の履歴

## 4. Googleログインを有効化

SupabaseのAuthentication設定でGoogle Providerを有効化する。

Supabase側のCallback URL:

```text
https://xxxxxxxxxxxx.supabase.co/auth/v1/callback
```

Google CloudでOAuthクライアントを作成し、上記Callback URLをAuthorized redirect URIsに登録する。

Google Cloudで作成した値をSupabaseに入力する。

```text
Client IDs: Google CloudのClient ID
Client Secret: Google CloudのClient Secret
```

## 5. ローカルアプリのリダイレクトURL

ローカルでログインテストを行う場合、SupabaseのAuthentication URL設定に以下を登録する。

Site URL:

```text
http://127.0.0.1:3000
```

Redirect URLs:

```text
http://127.0.0.1:3000/auth/callback
```

Vercelに公開した後は、本番URLのCallback URLも追加する。

```text
https://本番ドメイン/auth/callback
```

## 6. 最初の管理者を登録

最初の管理者は、Supabase SQL Editorから`admin_users`にメールアドレスを登録する。

```sql
insert into public.admin_users (email)
values ('admin@example.com')
on conflict (email) do nothing;
```

そのメールアドレスでGoogleログインしたユーザーが管理者として扱われる。

## 現在の実装状態

アプリには以下を追加済み。

- `/client/[clientSlug]`: 顧客ログイン入口
- `/admin/login`: 管理者ログイン入口
- `/auth/callback`: Supabase OAuthコールバック

次の実装で、ログインユーザーのプロフィール作成、顧客登録、承認待ち画面を接続する。
