# 記帳資料回収Webアプリ 仕様たたき台

## 採用する構成

本アプリは、個別のWebサーバーを用意せず、以下のマネージドサービスを使って運用する。

- Vercel: Webアプリ本体の公開、HTTPS、デプロイ管理
- Supabase: 顧客情報、承認状態、送信履歴などのデータベース
- Google認証: 顧客・管理者のログイン
- Google Drive API: 顧客ごとの証憑ファイル保存

この構成により、サーバー管理を最小化しながら、スマートフォン向けのアップロード画面、管理者画面、承認フロー、送信履歴管理を実装する。

## 目的

記帳代行に必要な領収書、請求書、通帳画像、その他証憑を、顧客がスマートフォンから簡単に送信できるWebアプリを作成する。

送信された画像と取引内容メモは顧客ごとに管理し、画像ファイルは顧客に紐づくGoogleドライブへ保存する。管理者は顧客アカウントの承認、Googleドライブ連携、送信履歴の確認を行う。

## 想定ユーザー

- 顧客: スマートフォンで証憑を1枚ずつ撮影し、取引内容を入力して送信する
- 管理者: 顧客アカウントを承認し、顧客ごとのGoogleドライブ保存先と送信履歴を管理する

## MVPで作る機能

### 顧客向け

1. 顧客専用URLからアクセス
2. Google認証でログイン
3. 初回アカウント作成時にメールアドレスと顧客名を登録
4. 管理者承認前は利用不可画面を表示
5. 画像・PDFアップロード
   - PDF, JPG, PNG, HEICを対象
   - 1回につき1ファイル送信
   - スマートフォンのカメラ撮影またはファイル選択を想定
6. 取引内容メモ入力
7. 送信完了表示
8. 送信履歴一覧
   - サムネイル
   - 取引内容メモ
   - 送信日時
   - ファイル種別

### 管理者向け

1. 顧客とは別URLの管理者ログイン
2. Google認証でログイン
3. 管理者権限のあるユーザーのみ利用可能
4. 顧客アカウント一覧
5. 顧客アカウント承認
6. 顧客ごとのGoogleドライブ保存先設定
7. 顧客ごとの送信履歴確認
8. 送信された画像・PDFへのリンク表示

## 技術構成

### アプリ

- Next.js
  - Vercelへのデプロイと相性が良い
  - 顧客画面、管理者画面、APIを同じプロジェクトで管理できる

### 認証

- 初期候補: Supabase AuthのGoogleログイン
  - Supabaseのユーザー情報と業務データを紐づけやすい
  - 管理画面で承認状態を管理しやすい

### データベース

- Supabase PostgreSQL
  - 顧客、承認状態、送信履歴、Googleドライブ保存先を管理

### ファイル保存

- Google Drive API
  - 顧客ごとのGoogle DriveフォルダIDを保存
  - 顧客が送信したファイルを該当フォルダにアップロード

## 主要画面

### 顧客画面

- `/client/[clientSlug]`
  - 顧客専用URL入口
- `/client/[clientSlug]/signup`
  - 初回登録
- `/client/[clientSlug]/pending`
  - 承認待ち
- `/client/[clientSlug]/upload`
  - 画像と取引内容の送信
- `/client/[clientSlug]/submissions`
  - 送信履歴

### 管理者画面

- `/admin/login`
- `/admin/customers`
- `/admin/customers/[customerId]`
  - 顧客詳細
  - 承認状態
  - Drive保存先
  - 送信履歴

## データモデル案

### users

- id
- email
- name
- role: `customer` または `admin`
- created_at
- updated_at

### customer_accounts

- id
- user_id
- customer_name
- client_slug
- approval_status: `pending`, `approved`, `rejected`
- drive_folder_id
- drive_folder_name
- approved_at
- created_at
- updated_at

### submissions

- id
- customer_account_id
- uploaded_by_user_id
- transaction_note
- file_name
- mime_type
- file_size
- drive_file_id
- drive_view_url
- thumbnail_url
- submitted_at

### admin_users

- id
- user_id
- email
- created_at

## 権限ルール

- 顧客は自分の顧客アカウントと送信履歴のみ閲覧可能
- 承認前の顧客はアップロード不可
- 管理者は承認済みの管理者メールアドレスのみ利用可能
- 顧客画面と管理画面はURLと権限チェックの両方で分離

## Google Drive連携方針

MVPでは、管理者側で顧客ごとのDriveフォルダIDを登録する方式から始める。

理由:

- 初期実装がシンプル
- 既存の顧客別フォルダをそのまま使える
- 保存先を管理者が明示的に確認できる

将来的には、管理者が画面からフォルダを選択できる機能や、顧客フォルダの自動作成も検討する。

## 実装順序

1. Next.jsプロジェクト作成
2. Supabaseプロジェクト作成
3. Supabase AuthでGoogleログイン設定
4. 顧客登録と承認待ち画面
5. 管理者の顧客承認画面
6. 画像アップロード画面
7. Google Drive保存
8. 送信履歴一覧
9. 管理者の顧客別送信履歴
10. Vercelへデプロイ
11. 独自ドメイン設定

## 確認したい事項

1. 顧客専用URLは、顧客ごとに固定の短い文字列を使うか
   - 例: `/client/tokyo-shokai`
2. 顧客は1社につき1ユーザーか、複数ユーザーを許可するか
3. Googleドライブは顧客ごとに既存フォルダを選ぶか、自動作成するか
4. 管理者は複数人で利用するか
5. 送信後の画像削除・修正を顧客に許可するか
6. 月別・会計期間別の分類が必要か
