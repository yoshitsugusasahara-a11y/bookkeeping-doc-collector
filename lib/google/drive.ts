import { Readable } from "node:stream";
import { google } from "googleapis";

export type DriveUploadResult = {
  fileId: string;
  viewUrl: string;
};

export function isGoogleDriveConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_DRIVE_REFRESH_TOKEN &&
      process.env.GOOGLE_DRIVE_REDIRECT_URI,
  );
}

function createDriveClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;

  if (!clientId || !clientSecret || !refreshToken || !redirectUri) {
    throw new Error("Google Drive連携の環境変数が設定されていません。");
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  auth.setCredentials({ refresh_token: refreshToken });

  return google.drive({ version: "v3", auth });
}

export async function uploadFileToDrive({
  file,
  folderId,
  fileName,
}: {
  file: File;
  folderId: string;
  fileName: string;
}): Promise<DriveUploadResult> {
  const drive = createDriveClient();
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const response = await drive.files.create({
    fields: "id, webViewLink",
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: file.type || "application/octet-stream",
      body: Readable.from(fileBuffer),
    },
  });

  const fileId = response.data.id;

  if (!fileId) {
    throw new Error("Google Driveへのアップロードに失敗しました。");
  }

  return {
    fileId,
    viewUrl:
      response.data.webViewLink ||
      `https://drive.google.com/file/d/${fileId}/view`,
  };
}

export async function moveDriveFile({
  fileId,
  folderId,
}: {
  fileId: string;
  folderId: string;
}): Promise<DriveUploadResult> {
  const drive = createDriveClient();
  const current = await drive.files.get({
    fileId,
    fields: "parents",
  });
  const previousParents = current.data.parents?.join(",");

  const response = await drive.files.update({
    fileId,
    addParents: folderId,
    removeParents: previousParents,
    fields: "id, webViewLink",
  });

  if (!response.data.id) {
    throw new Error("Google Driveファイルの移動に失敗しました。");
  }

  return {
    fileId: response.data.id,
    viewUrl:
      response.data.webViewLink ||
      `https://drive.google.com/file/d/${response.data.id}/view`,
  };
}
