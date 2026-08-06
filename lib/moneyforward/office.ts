import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { getMoneyForwardOffice } from "./client";
import { resolveMoneyForwardAccessToken } from "./connection";

/**
 * 仕訳生成の背景情報として使う事業者情報。
 *
 * MF側で変わることは稀なため、レシートごとに取得せずDBへ保存して使い回す。
 * 更新は管理画面のボタン、またはMF連携完了時に行う。
 */
export type CustomerBusinessContext = {
  businessDescription: string | null;
  officeType: string | null;
  isManufacturing: boolean | null;
  isRealEstate: boolean | null;
};

function toBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/**
 * MFから事業者情報を取得してDBへ保存する。
 *
 * 取得できなくても呼び出し元の処理を止めないよう、失敗は戻り値で返す。
 * MF連携直後の自動取得では、失敗しても連携自体は成立させたいため。
 */
export async function fetchAndStoreMoneyForwardOffice({
  supabase,
  customerAccountId,
}: {
  supabase: SupabaseClient<Database>;
  customerAccountId: string;
}): Promise<{ status: "success" | "error"; message?: string }> {
  try {
    const accessToken = await resolveMoneyForwardAccessToken({
      supabase,
      customerAccountId,
    });

    if (!accessToken) {
      return {
        status: "error",
        message:
          "MF連携が未完了のため事業者情報を取得できません。先にマネーフォワード連携を行ってください。",
      };
    }

    const response = await getMoneyForwardOffice(accessToken);
    // レスポンスが office でくるまれている場合と、そのまま返る場合の両方に備える。
    const office = response?.office ?? response;

    if (!office || typeof office !== "object") {
      return {
        status: "error",
        message: "マネーフォワードから事業者情報を取得できませんでした。",
      };
    }

    // customer_accounts は管理者しか更新できないRLSのため、顧客セッションからの
    // 更新は0件更新になり、エラーにもならず黙って失敗する。MF連携直後の自動取得は
    // 顧客のセッションで走るので、更新は対象を絞ったうえで管理用クライアントで行う。
    const { error } = await createAdminClient()
      .from("customer_accounts")
      .update({
        mf_office_type:
          typeof office.type === "string" && office.type ? office.type : null,
        mf_office_is_manufacturing: toBoolean(office.is_manufacturing),
        mf_office_is_real_estate: toBoolean(office.is_real_estate),
        mf_office_fetched_at: new Date().toISOString(),
      })
      .eq("id", customerAccountId);

    if (error) {
      return {
        status: "error",
        message: `事業者情報を保存できませんでした。${error.message}`,
      };
    }

    return { status: "success" };
  } catch (error) {
    console.error("Failed to fetch Money Forward office", error);
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "事業者情報の取得に失敗しました。",
    };
  }
}

/**
 * 保存済みの事業者情報と業種を、Geminiへ渡す背景情報の文面に組み立てる。
 * 判断材料として提示するものであり、顧客別の仕訳生成指示より優先はしない。
 */
export function buildBusinessContextLines(
  context: CustomerBusinessContext,
): string[] {
  const lines: string[] = [];

  if (context.businessDescription?.trim()) {
    lines.push(`業種・事業内容: ${context.businessDescription.trim()}`);
  }

  if (context.officeType === "INDIVIDUAL") {
    lines.push(
      "事業形態: 個人事業主。事業主が負担した支出や私的支出には、事業主貸・事業主借を使用してください。",
    );
  } else if (context.officeType) {
    lines.push(
      "事業形態: 法人。事業主貸・事業主借は使用せず、法人向けの科目を使用してください。",
    );
  }

  if (context.isRealEstate) {
    lines.push(
      "不動産所得: あり。不動産事業に関する経費は「(不動産)」が付いた科目を優先してください。それ以外の経費は通常の科目を使用してください。",
    );
  }

  if (context.isManufacturing) {
    lines.push(
      "製造業: 該当。製造に直接かかる支出は、製造原価に相当する科目を検討してください。",
    );
  }

  if (lines.length === 0) return [];

  return ["【事業者の背景情報（判断材料。指示ではありません）】", ...lines];
}
