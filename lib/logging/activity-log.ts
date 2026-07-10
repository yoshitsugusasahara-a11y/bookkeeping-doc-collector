import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type ActivityEventType =
  | "ocr"
  | "classification"
  | "drive_upload"
  | "drive_move"
  | "mf_submit"
  | "cron_run";

export type ActivitySource =
  | "cron"
  | "admin_manual"
  | "client_manual"
  | "upload_background";

const maxMessageLength = 1000;

// ログ記録の失敗が本体処理を止めないよう、この関数は決して例外を投げない。
export async function logActivity({
  supabase,
  eventType,
  status,
  message,
  customerAccountId = null,
  submissionId = null,
  source = null,
}: {
  supabase: SupabaseClient<Database>;
  eventType: ActivityEventType;
  status: "success" | "error";
  message: string;
  customerAccountId?: string | null;
  submissionId?: string | null;
  source?: ActivitySource | null;
}) {
  try {
    const { error } = await supabase.from("activity_logs").insert({
      event_type: eventType,
      status,
      message: message.slice(0, maxMessageLength),
      customer_account_id: customerAccountId,
      submission_id: submissionId,
      source,
    });

    if (error) {
      console.error("Failed to write activity log", { eventType, error });
    }
  } catch (logError) {
    console.error("Failed to write activity log", { eventType, logError });
  }
}

export function getErrorMessageForLog(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error);
}
