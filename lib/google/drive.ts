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

export type DriveFolderCheck =
  | { status: "ok"; name: string }
  | { status: "not_found" }
  | { status: "not_a_folder" }
  | { status: "not_writable" }
  | { status: "unknown_error"; message: string };

function getHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as {
    code?: unknown;
    status?: unknown;
    response?: { status?: unknown };
  };
  for (const value of [
    candidate.status,
    candidate.code,
    candidate.response?.status,
  ]) {
    if (typeof value === "number") return value;
    if (typeof value === "string" && /^d+$/.test(value)) return Number(value);
  }
  return null;
}

/**
 * フォルダIDが実在し、このアプリの資格情報で書き込めるかを確認する。
 *
 * 設定画面で保存する前に呼ぶ。IDを1文字欠いて貼り付けても保存できてしまうと、
 * 資料の送信時に初めて「File not found」で失敗し、顧客にも管理者にも原因が
 * 分からないまま溜まり続ける（2026-09-07に実際に発生し、19件が送信失敗した）。
 *
 * 実行時と同じ資格情報で確認するため、ここを通れば実際に書き込める。
 */
export async function verifyDriveFolder(
  folderId: string,
): Promise<DriveFolderCheck> {
  const drive = createDriveClient();

  try {
    const response = await drive.files.get({
      fileId: folderId,
      fields: "id, name, mimeType, trashed, capabilities/canAddChildren",
      supportsAllDrives: true,
    });

    const folder = response.data;

    if (folder.trashed) return { status: "not_found" };
    if (folder.mimeType !== "application/vnd.google-apps.folder") {
      return { status: "not_a_folder" };
    }
    if (folder.capabilities?.canAddChildren === false) {
      return { status: "not_writable" };
    }

    return { status: "ok", name: folder.name ?? "" };
  } catch (error) {
    const httpStatus = getHttpStatus(error);
    if (httpStatus === 404) return { status: "not_found" };
    if (httpStatus === 403) return { status: "not_writable" };

    return {
      status: "unknown_error",
      message:
        error instanceof Error
          ? error.message
          : "Google Driveのフォルダを確認できませんでした。",
    };
  }
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
    supportsAllDrives: true,
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
    supportsAllDrives: true,
  });
  const previousParents = current.data.parents?.join(",");

  const response = await drive.files.update({
    fileId,
    addParents: folderId,
    removeParents: previousParents,
    fields: "id, webViewLink",
    supportsAllDrives: true,
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

/**
 * ファイルが指定フォルダに入っている状態にする。既にそこにあれば何もしない。
 *
 * 資料分類をやり直すと振り分け先が変わることがある（ルールが増えた、
 * レシート以外と判定されていたものがレシートになった、など）。そのとき
 * Drive上のファイルも追従させるために使う。
 *
 * moveDriveFile は現在の親を無条件に付け替えるため、既に目的のフォルダに
 * ある場合は同じ親を addParents と removeParents の両方に渡すことになる。
 * それを避けるため、ここでは先に現在の親を確認する。
 */
export async function ensureDriveFileInFolder({
  fileId,
  folderId,
}: {
  fileId: string;
  folderId: string;
}): Promise<{ moved: boolean; viewUrl: string | null }> {
  const drive = createDriveClient();

  const current = await drive.files.get({
    fileId,
    fields: "parents, webViewLink",
    supportsAllDrives: true,
  });

  const parents = current.data.parents ?? [];

  if (parents.includes(folderId)) {
    return { moved: false, viewUrl: current.data.webViewLink ?? null };
  }

  const response = await drive.files.update({
    fileId,
    addParents: folderId,
    removeParents: parents.join(","),
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });

  return { moved: true, viewUrl: response.data.webViewLink ?? null };
}

export async function renameDriveFile({
  fileId,
  fileName,
}: {
  fileId: string;
  fileName: string;
}): Promise<DriveUploadResult> {
  const drive = createDriveClient();
  const response = await drive.files.update({
    fileId,
    requestBody: { name: fileName },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });

  if (!response.data.id) {
    throw new Error("Google Driveファイルのリネームに失敗しました。");
  }

  return {
    fileId: response.data.id,
    viewUrl:
      response.data.webViewLink ||
      `https://drive.google.com/file/d/${response.data.id}/view`,
  };
}
