import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

const receiptUploadBucket = "receipt_uploads";
const defaultSubmissionRetentionLimit = 200;
const maxSubmissionRetentionLimit = 5000;
const cleanupBatchSize = 100;

export function normalizeSubmissionRetentionLimit(value: unknown) {
  const numericValue =
    typeof value === "number" ? value : Number.parseInt(String(value || ""), 10);

  if (!Number.isFinite(numericValue)) {
    return defaultSubmissionRetentionLimit;
  }

  return Math.min(
    Math.max(Math.floor(numericValue), 1),
    maxSubmissionRetentionLimit,
  );
}

export async function cleanupCustomerOldSubmissions({
  supabase,
  customerId,
  limit,
}: {
  supabase: SupabaseClient<Database>;
  customerId: string;
  limit: number;
}) {
  const normalizedLimit = normalizeSubmissionRetentionLimit(limit);
  let deletedCount = 0;
  const cleanupClient = (() => {
    try {
      return createAdminClient();
    } catch {
      return supabase;
    }
  })();

  while (true) {
    const { data: oldSubmissions, error } = await cleanupClient
      .from("submissions")
      .select("id, source_storage_path")
      .eq("customer_account_id", customerId)
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: false })
      .range(normalizedLimit, normalizedLimit + cleanupBatchSize - 1);

    if (error) throw error;
    if (!oldSubmissions || oldSubmissions.length === 0) break;

    const storagePaths = oldSubmissions
      .map((submission) => submission.source_storage_path)
      .filter((path): path is string => Boolean(path));

    if (storagePaths.length > 0) {
      const { error: storageError } = await cleanupClient.storage
        .from(receiptUploadBucket)
        .remove(storagePaths);

      if (storageError) {
        console.warn("Failed to remove old submission storage files", {
          customerId,
          storagePaths,
          error: storageError,
        });
      }
    }

    const ids = oldSubmissions.map((submission) => submission.id);
    const { error: deleteError } = await cleanupClient
      .from("submissions")
      .delete()
      .eq("customer_account_id", customerId)
      .in("id", ids);

    if (deleteError) throw deleteError;

    deletedCount += ids.length;
  }

  return deletedCount;
}
