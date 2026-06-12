# 2026-05-28以降の復旧メモ

2026-05-28以降に実装した機能のうち、現時点で消えている可能性が高いものは 1 から 8 まで。
これらは後ほど順番に再実装・再確認する。

## 後ほど復旧する機能

1. 顧客別「仕訳生成指示」機能
2. Gemini仕訳生成レスポンスの安定化
3. Google認証エラー導線の改善
4. 履歴画面の画像サムネイル表示
5. OCR支払方法の3分類対応
6. MF送信ボタンの状態表示改善
7. 画面遷移・処理中表示の追加
8. 顧客別・資料保存上限機能

## 現在確認した不具合

顧客詳細画面で次のエラーが表示される。

```text
column customer_accounts.submission_retention_limit does not exist
```

原因:
アプリ側は `customer_accounts.submission_retention_limit` を参照しているが、Supabase本番DBに該当カラムが存在しない。
資料保存上限機能のSQLが未反映、または古いDB定義に戻っている可能性が高い。

暫定対応:
Supabase SQL Editorで次を実行する。

```sql
alter table public.customer_accounts
  add column if not exists submission_retention_limit integer not null default 200;
```

支払方法3分類を復旧する場合は次も実行する。

```sql
alter table public.submissions
  add column if not exists ocr_payment_method text not null default 'cash';

update public.submissions
set ocr_payment_method = case
  when ocr_is_credit_card is true then 'credit_card'
  else 'cash'
end
where ocr_payment_method is null
   or ocr_payment_method not in ('cash', 'credit_card', 'cashless');
```
