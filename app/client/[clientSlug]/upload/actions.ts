"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getCurrentUserOrRedirect } from "@/lib/auth/profile";
import { processCustomerPendingSubmissions } from "@/lib/receipts/process-submissions";
import { createClient } from "@/lib/supabase/server";

type UploadState = {
  status: "idle" | "success" | "error";
  message: string;
};

const receiptUploadBucket = "receipt_uploads";

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

function sanitizeFileName(fileName: string) {
  return (fileName || "receipt")
    .replace(/[\\/:*?"<>|#%{}[\]^~`]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
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
    .select("id, approval_status")
    .eq("user_id", user.id)
    .eq("client_slug", clientSlug)
    .maybeSingle();

  if (!account) {
    redirect(`/client/${clientSlug}/signup`);
  }

  if (account.approval_status !== "approved") {
    redirect(`/client/${clientSlug}/pending`);
  }

  const sourceStoragePath = `${account.id}/${crypto.randomUUID()}-${sanitizeFileName(
    fileValue.name,
  )}`;

  const { error: storageError } = await supabase.storage
    .from(receiptUploadBucket)
    .upload(sourceStoragePath, fileValue, {
      contentType: mimeType,
      upsert: false,
    });

  if (storageError) {
    console.error("Failed to store receipt file", storageError);
    return {
      status: "error",
      message:
        "ファイルの一時保存に失敗しました。時間をおいて再度お試しください。",
    };
  }

  const { error } = await supabase.from("submissions").insert({
    customer_account_id: account.id,
    uploaded_by_user_id: user.id,
    transaction_note: transactionNote,
    file_name: fileValue.name || "uploaded-file",
    mime_type: mimeType,
    file_size: fileValue.size,
    source_storage_path: sourceStoragePath,
    ocr_status: "pending",
    mf_status: "not_sent",
    thumbnail_url:
      thumbnailDataUrl.startsWith("data:image/") &&
      thumbnailDataUrl.length < 700_000
        ? thumbnailDataUrl
        : null,
  });

  if (error) {
    return {
      status: "error",
      message:
        "送信履歴を保存できませんでした。時間をおいて再度お試しください。",
    };
  }

  revalidatePath(`/client/${clientSlug}/submissions`);
  revalidatePath("/admin/customers");
  after(async () => {
    try {
      const backgroundSupabase = await createClient();
      await processCustomerPendingSubmissions({
        supabase: backgroundSupabase,
        customerId: account.id,
        limit: 10,
      });
    } catch (processError) {
      console.error("Failed to start background receipt processing", processError);
    }
  });

  return {
    status: "success",
    message: "送信を受け付けました。続けて次の資料を送信できます。",
  };
}
