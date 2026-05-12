# デプロイ構成メモ

## 方針

Webサーバーを個別に用意せず、Vercel、Supabase、Google Driveを組み合わせて運用する。

## 利用サービス

### Vercel

役割:

- Next.jsアプリのホスティング
- HTTPS対応
- 本番・プレビュー環境の管理
- GitHub連携による自動デプロイ

### Supabase

役割:

- PostgreSQLデータベース
- Googleログイン
- 顧客・管理者・送信履歴データの保存
- 権限管理の補助

### Google Drive API

役割:

- 顧客ごとの証憑ファイル保存
- PDF, JPG, PNG, HEICなどのアップロード先
- 管理者画面から送信ファイルを確認するためのリンク管理

## 本番環境で必要になる設定

### Vercel環境変数

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`
- `GOOGLE_DRIVE_REDIRECT_URI`
- `APP_BASE_URL`

### Supabase側の設定

- Googleログインの有効化
- アプリURLの登録
- 認証リダイレクトURLの登録
- 顧客・管理者・送信履歴テーブルの作成
- Row Level Securityの設計

### Google Cloud側の設定

- Google Cloudプロジェクト作成
- OAuth同意画面の設定
- Google Drive APIの有効化
- OAuthクライアントID作成
- 管理者アカウントでDriveアクセスを許可

## 初期MVPの保存方式

管理者が顧客ごとにGoogle DriveフォルダIDを登録する。

送信時の流れ:

1. 顧客がファイルと取引内容を送信
2. アプリが顧客の承認状態を確認
3. 顧客に紐づくDriveフォルダIDを取得
4. Google Driveへファイルをアップロード
5. DriveファイルIDと表示URLをSupabaseへ保存
6. 顧客と管理者の履歴画面に表示

## 運用上の注意

- 証憑には個人情報や取引情報が含まれるため、管理者権限を限定する
- 顧客別フォルダの共有設定は必要最小限にする
- Drive上のファイルを削除した場合、アプリ側の履歴リンクが切れる可能性がある
- 本番公開前に、アップロードできるファイルサイズ上限を決める
- HEICのサムネイル表示は環境差があるため、MVPでは保存優先で扱う

## 次の実装ステップ

1. Next.jsアプリを作成する
2. Supabaseプロジェクトを作成する
3. Googleログインを設定する
4. 顧客登録と承認待ち画面を作る
5. 管理者の顧客承認画面を作る
6. Google Driveアップロードを実装する
