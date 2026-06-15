# 2026-05-28以降の復旧メモ

2026-05-28以降に実装した機能のうち、一時的に消えている可能性が高いものとして 1 から 8 までを洗い出した。
2026-06-15時点で、下記の復旧対象は再実装・再確認済み。

## 復旧完了した機能

1. 顧客別「仕訳生成指示」機能: 復旧完了
2. Gemini仕訳生成レスポンスの安定化: 復旧完了
3. Google認証エラー導線の改善: 復旧完了
4. 履歴画面の画像サムネイル表示: 復旧完了
5. OCR支払方法の3分類対応: 復旧完了
6. MF送信ボタンの状態表示改善: 復旧完了
7. 画面遷移・処理中表示の追加: 復旧完了
8. 顧客別・資料保存上限機能: 復旧完了

## 解消済みの不具合

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

上記のDBカラム不足と、資料保存上限実行時の `submissions` 削除権限不足は、SQL反映後に解消済み。

## 日次処理メモ

MF会計への仕訳送信を含む日次処理の入口は実装済み。

- Vercel Cron設定: `vercel.json`
- 実行パス: `/api/cron/process-receipts`
- スケジュール: `0 8 * * *`
- 処理内容:
  - 承認済み顧客を取得
  - 顧客ごとに未送信・未処理の資料を最大20件ずつ処理
  - `processCustomerPendingSubmissions` により、OCR済みデータのMF送信、Google Drive保存などを実行

ただし、実際に本番で定時送信させるには、Vercel側のCron実行環境と必要な環境変数、特に `CRON_SECRET` の扱いを確認すること。
