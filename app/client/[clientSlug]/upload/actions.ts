"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserOrRedirect } from "@/lib/auth/profile";
import { analyzeReceiptWithGemini } from "@/lib/gemini/receipt-ocr";
import { isGoogleDriveConfigured, uploadFileToDrive } from "@/lib/google/drive";
import { createClient } from "@/lib/supabase/server";

type UploadState = {
  status: "idle" | "success" | "error";
  message: string;
};

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

function inferMimeType(file: File) {
  if (file.type) return file.type.toLowerCase();

  const fileName = file.name.toLowerCase();
  if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (fileName.endsWith(".png")) return "image/png";
  if (fileName.endsWith(".heic")) return "image/heic";
  if (fileName.endsWith(".heif")) return "image/heif";
  if (fileName.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

export async function createSubmission(
  clientSlug: string,
  _prevState: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const transactionNote = String(formData.get("transactionNote") || "").trim();
  const thumbnailDataUrl = String(formData.get("thumbnailDataUrl") || "");
  const fileValue = formData.get("receiptFile");

  if (!transactionNote) {
    return { status: "error", message: "取引内容を入力してください。" };
  }

  if (!(fileValue instanceof File) || fileValue.size === 0) {
    return { status: "error", message: "画像またはPDFを選択してください。" };
  }

  const mimeType = inferMimeType(fileValue);

  if (!allowedMimeTypes.has(mimeType)) {
    return {
      status: "error",
      message: "JPG、PNG、HEIC、PDFのいずれかを選択してください。",
    };
  }

  const supabase = await createClient();
  const user = await getCurrentUserOrRedirect(
    supabase,
    `/client/${clientSlug}`,
  );

  const { data: account } = await supabase
    .from("customer_accounts")
    .select("id, approval_status, drive_folder_id")
    .eq("user_id", user.id)
    .eq("client_slug", clientSlug)
    .maybeSingle();

  if (!account) {
    redirect(`/client/${clientSlug}/signup`);
  }

  if (account.approval_status !== "approved") {
    redirect(`/client/${clientSlug}/pending`);
  }

  let driveFileId: string | null = null;
  let driveViewUrl: string | null = null;
  const ocr = await analyzeReceiptWithGemini({
    file: fileValue,
    mimeType,
    transactionNote,
  });

  if (account.drive_folder_id && isGoogleDriveConfigured()) {
    try {
      const uploadedFile = await uploadFileToDrive({
        file: fileValue,
        folderId: account.drive_folder_id,
        fileName: fileValue.name || "uploaded-file",
      });
      driveFileId = uploadedFile.fileId;
      driveViewUrl = uploadedFile.viewUrl;
    } catch (driveError) {
      console.error("Failed to upload file to Google Drive", driveError);
      return {
        status: "error",
        message:
          "Google Driveへの保存に失敗しました。フォルダIDまたはDrive連携設定を確認してください。",
      };
    }
  }

  const { error } = await supabase.from("submissions").insert({
    customer_account_id: account.id,
    uploaded_by_user_id: user.id,
    transaction_note: transactionNote,
    file_name: fileValue.name || "uploaded-file",
    mime_type: mimeType,
    file_size: fileValue.size,
    drive_file_id: driveFileId,
    drive_view_url: driveViewUrl,
    ocr_status: ocr.status,
    ocr_error: ocr.error,
    ocr_raw_response: ocr.rawResponse,
    ocr_processed_at: ocr.status === "completed" ? new Date().toISOString() : null,
    ocr_date: ocr.status === "completed" ? ocr.result.date : null,
    ocr_amount: ocr.status === "completed" ? ocr.result.amount : null,
    ocr_store: ocr.status === "completed" ? ocr.result.store : null,
    ocr_summary: ocr.status === "completed" ? ocr.result.summary : null,
    ocr_is_credit_card:
      ocr.status === "completed" ? ocr.result.is_credit_card : null,
    thumbnail_url:
      thumbnailDataUrl.startsWith("data:image/") &&
      thumbnailDataUrl.length < 700_000
        ? thumbnailDataUrl
        : null,
  });

  if (error) {
    return {
      status: "error",
      message: "送信履歴を保存できませんでした。時間をおいて再度お試しください。",
    };
  }

  revalidatePath(`/client/${clientSlug}/submissions`);
  revalidatePath("/admin/customers");
  return {
    status: "success",
    message: "送信が完了しました。続けて次の資料を送信できます。",
  };
}
