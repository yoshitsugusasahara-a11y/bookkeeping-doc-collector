import { NextResponse, type NextRequest } from "next/server";
import { google } from "googleapis";

function htmlPage(content: string) {
  return new NextResponse(
    `<!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Google Drive連携</title>
        <style>
          body {
            background: #fbfcfa;
            color: #17211b;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            line-height: 1.7;
            margin: 0;
            padding: 32px;
          }
          main {
            background: #fff;
            border: 1px solid #dce3df;
            border-radius: 8px;
            box-shadow: 0 18px 45px rgba(28, 38, 32, 0.1);
            margin: 8vh auto;
            max-width: 760px;
            padding: 28px;
          }
          h1 { margin-top: 0; }
          code, textarea {
            background: #f4f7f5;
            border: 1px solid #dce3df;
            border-radius: 8px;
            display: block;
            font: 14px ui-monospace, SFMono-Regular, Consolas, monospace;
            padding: 14px;
            width: 100%;
          }
          textarea { min-height: 120px; }
        </style>
      </head>
      <body><main>${content}</main></body>
    </html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    },
  );
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");

  if (error) {
    return htmlPage(`
      <h1>Google Drive連携に失敗しました</h1>
      <p>Googleからエラーが返されました。</p>
      <code>${error}</code>
    `);
  }

  if (!code) {
    return htmlPage(`
      <h1>認可コードがありません</h1>
      <p>最初からやり直してください。</p>
      <code>http://localhost:3000/api/google-drive/start</code>
    `);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return htmlPage(`
      <h1>環境変数が不足しています</h1>
      <p>.env.localにGoogle Drive連携用の値を設定してください。</p>
    `);
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const { tokens } = await auth.getToken(code);

  if (!tokens.refresh_token) {
    return htmlPage(`
      <h1>リフレッシュトークンを取得できませんでした</h1>
      <p>Google CloudのOAuth設定を確認し、もう一度以下から認可してください。</p>
      <code>http://localhost:3000/api/google-drive/start</code>
    `);
  }

  return htmlPage(`
    <h1>Google Drive連携トークンを取得しました</h1>
    <p>以下の値を.env.localのGOOGLE_DRIVE_REFRESH_TOKENに設定してください。</p>
    <textarea readonly>${tokens.refresh_token}</textarea>
    <p>設定後、アプリを再起動してください。</p>
  `);
}
