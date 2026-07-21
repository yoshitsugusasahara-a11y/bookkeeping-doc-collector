import { createAdminClient } from "@/lib/supabase/admin";

export const GOOGLE_DRIVE_TOKEN_LIFETIME_DAYS = 7;

export async function recordGoogleDriveTokenIssued() {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("google_drive_token_status")
    .upsert({ id: true, issued_at: new Date().toISOString() });

  if (error) {
    console.error("Failed to record Google Drive token issued_at", error);
  }
}

export function getGoogleDriveTokenExpiry(issuedAt: string) {
  const issued = new Date(issuedAt);
  return new Date(
    issued.getTime() + GOOGLE_DRIVE_TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
  );
}
