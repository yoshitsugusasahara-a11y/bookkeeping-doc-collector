import { NextResponse } from "next/server";
import { processCustomerPendingSubmissions } from "@/lib/receipts/process-submissions";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: customers, error } = await supabase
    .from("customer_accounts")
    .select("id")
    .eq("approval_status", "approved")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ customerId: string; processed: number; error?: string }> = [];

  for (const customer of customers ?? []) {
    try {
      const processed = await processCustomerPendingSubmissions({
        supabase,
        customerId: customer.id,
        limit: 20,
      });
      results.push({ customerId: customer.id, processed });
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

  return NextResponse.json({
    processedCustomers: results.length,
    results,
  });
}
