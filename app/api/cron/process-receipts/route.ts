import { NextResponse } from "next/server";
import { logActivity } from "@/lib/logging/activity-log";
import { processCustomerPendingSubmissions } from "@/lib/receipts/process-submissions";
import { createAdminClient } from "@/lib/supabase/admin";

const activityLogRetentionDays = 30;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret) {
    console.error("CRON_SECRET is not configured; refusing to run cron.");
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 },
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase;

  try {
    supabase = createAdminClient();
  } catch (adminClientError) {
    const message =
      adminClientError instanceof Error
        ? adminClientError.message
        : "Failed to create Supabase admin client.";
    console.error("Cron: failed to create Supabase admin client", adminClientError);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    const { data: customers, error } = await supabase
      .from("customer_accounts")
      .select("id")
      .eq("approval_status", "approved")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Cron: failed to fetch approved customers", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results: Array<{
      customerId: string;
      processed: number;
      failed?: number;
      errors?: string[];
      error?: string;
    }> = [];

    for (const customer of customers ?? []) {
      try {
        const result = await processCustomerPendingSubmissions({
          supabase,
          customerId: customer.id,
          limit: 5,
          source: "cron",
        });
        results.push({
          customerId: customer.id,
          processed: result.processed,
          failed: result.failed,
          errors: result.errors,
        });
      } catch (processError) {
        results.push({
          customerId: customer.id,
          processed: 0,
          error:
            processError instanceof Error
              ? processError.message
              : "Processing failed.",
        });
      }
    }

    const totalProcessed = results.reduce((sum, row) => sum + row.processed, 0);
    const totalFailed = results.reduce(
      (sum, row) => sum + (row.failed ?? 0) + (row.error ? 1 : 0),
      0,
    );

    try {
      await logActivity({
        supabase,
        eventType: "cron_run",
        status: totalFailed > 0 ? "error" : "success",
        message: `Cron実行: 対象${results.length}顧客 / 送信成功${totalProcessed}件 / 失敗${totalFailed}件`,
        source: "cron",
      });
    } catch (logError) {
      console.error("Cron: failed to write cron_run activity log", logError);
    }

    try {
      const retentionCutoff = new Date(
        Date.now() - activityLogRetentionDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { error: cleanupError } = await supabase
        .from("activity_logs")
        .delete()
        .lt("created_at", retentionCutoff);

      if (cleanupError) {
        console.error("Failed to clean up old activity logs", cleanupError);
      }
    } catch (cleanupThrown) {
      console.error("Cron: activity log cleanup threw", cleanupThrown);
    }

    return NextResponse.json({
      processedCustomers: results.length,
      results,
    });
  } catch (unexpectedError) {
    console.error("Cron: unexpected failure", unexpectedError);
    return NextResponse.json(
      {
        error:
          unexpectedError instanceof Error
            ? unexpectedError.message
            : "Unexpected cron failure.",
      },
      { status: 500 },
    );
  }
}
