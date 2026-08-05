import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getValidMoneyForwardAccessToken } from "./client";

/**
 * 顧客のMF連携から、有効なアクセストークンを取得する。
 * 期限が近ければリフレッシュし、新しいトークンをDBへ保存する。
 *
 * 連携そのものが存在しない場合は null を返す（呼び出し側で扱いを決める）。
 * リフレッシュやトークン保存に失敗した場合は例外を投げる。
 */
export async function resolveMoneyForwardAccessToken({
  supabase,
  customerAccountId,
}: {
  supabase: SupabaseClient<Database>;
  customerAccountId: string;
}): Promise<string | null> {
  const { data: connection } = await supabase
    .from("mf_connections")
    .select("access_token, refresh_token, token_type, scope, expires_at")
    .eq("customer_account_id", customerAccountId)
    .maybeSingle();

  if (!connection) return null;

  let activeConnection = connection;
  let refreshed;

  try {
    refreshed = await getValidMoneyForwardAccessToken(activeConnection);
  } catch (refreshError) {
    // 他の処理（Cron・手動実行など）が直前に同じrefresh_tokenを使って
    // ローテーション済みの場合、DBには新しいトークンが保存されている。
    // 再読込して自分の持っていたトークンと違えば、そちらでやり直す。
    const { data: latestConnection } = await supabase
      .from("mf_connections")
      .select("access_token, refresh_token, token_type, scope, expires_at")
      .eq("customer_account_id", customerAccountId)
      .maybeSingle();

    if (
      !latestConnection ||
      latestConnection.refresh_token === activeConnection.refresh_token
    ) {
      throw refreshError;
    }

    activeConnection = latestConnection;
    refreshed = await getValidMoneyForwardAccessToken(activeConnection);
  }

  if (refreshed) {
    const { data: savedRows, error: saveError } = await supabase
      .from("mf_connections")
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        token_type: refreshed.token_type,
        scope: refreshed.scope,
        expires_at: refreshed.expires_at,
      })
      .eq("customer_account_id", customerAccountId)
      .select("customer_account_id");

    if (saveError || !savedRows || savedRows.length === 0) {
      // 保存に失敗したまま処理を続けると、DBに残った古いrefresh_tokenが
      // 次回以降 invalid_grant で失敗し続けるため、ここで明示的に失敗させる。
      throw new Error(
        `MFトークンの保存に失敗しました。${saveError?.message ?? "更新対象の連携情報が見つかりませんでした。"}`,
      );
    }
  }

  return refreshed?.access_token ?? activeConnection.access_token;
}
