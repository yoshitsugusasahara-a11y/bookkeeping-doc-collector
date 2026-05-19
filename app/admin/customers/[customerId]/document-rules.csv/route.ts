import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function escapeCsv(value: string | null) {
  const text = value ?? "";
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const { customerId } = await params;
  const supabase = await createClient();
  const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");

  if (adminError || !isAdmin) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { data: customer } = await supabase
    .from("customer_accounts")
    .select("customer_name")
    .eq("id", customerId)
    .maybeSingle();

  if (!customer) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data: rules, error } = await supabase
    .from("document_rules")
    .select("document_name, file_name_rule")
    .eq("customer_account_id", customerId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const rows = [
    ["資料名", "ファイル名ルール"],
    ...(rules ?? []).map((rule) => [
      rule.document_name,
      rule.file_name_rule,
    ]),
  ];
  const csv = `\uFEFF${rows
    .map((row) => row.map((value) => escapeCsv(value)).join(","))
    .join("\r\n")}\r\n`;
  const safeCustomerName = customer.customer_name.replace(/[\\/:*?"<>|]/g, "_");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(
        `${safeCustomerName}_document_rules.csv`,
      )}"`,
    },
  });
}
