# Google Drive連携設定

## 目的

顧客が送信したファイル本体を、管理者が指定したGoogle Driveフォルダへ保存する。

## 1. Google Drive APIを有効化

Google Cloud Consoleで、現在使っているプロジェクトを開く。

```text
APIとサービス
ライブラリ
Google Drive API
有効にする
```

## 2. OAuthクライアントにリダイレクトURIを追加

Google Cloud Consoleで以下を開く。

```text
APIとサービス
認証情報
OAuth 2.0 クライアントID
```

承認済みのリダイレクトURIに以下を追加する。

```text
http://localhost:3000/api/google-drive/callback
```

## 3. `.env.local`にGoogle OAuth情報を設定

Google CloudのOAuthクライアントから、Client IDとClient Secretをコピーする。

```text
GOOGLE_CLIENT_ID=Google CloudのClient ID
GOOGLE_CLIENT_SECRET=Google CloudのClient Secret
GOOGLE_DRIVE_REDIRECT_URI=http://localhost:3000/api/google-drive/callback
```

## 4. リフレッシュトークンを取得

アプリを起動した状態で、以下を開く。

```text
http://localhost:3000/api/google-drive/start
```

Google Driveへ保存する管理者アカウントで認可する。

認可後に表示された値を、`.env.local`に設定する。

```text
GOOGLE_DRIVE_REFRESH_TOKEN=表示されたリフレッシュトークン
```

## 5. 顧客ごとにDriveフォルダIDを設定

管理者画面の顧客詳細で、Google Driveの保存先フォルダIDを登録する。

フォルダIDは、Google DriveのフォルダURLのこの部分。

```text
https://drive.google.com/drive/folders/ここがフォルダID
```

## 6. 送信テスト

顧客画面からファイルを送信する。

Drive連携が成功すると、送信履歴に「Driveで開く」リンクが表示される。
