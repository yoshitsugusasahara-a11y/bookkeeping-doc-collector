# Money Forward accounting integration plan

## Current decision

Receipt images will not be saved to Money Forward Cloud Box as a separate step.
The app will create a journal in Money Forward Cloud Accounting and then attach
the receipt image to that journal through the accounting voucher API.

## API flow

1. Customer connects Money Forward through OAuth.
2. The app stores the customer-specific access token and refresh token.
3. Customer uploads a receipt.
4. Gemini extracts receipt data.
5. The app generates a draft journal payload.
6. The app posts the journal to `/api/v3/journals`.
7. The app posts the receipt image to `/api/v3/vouchers` with the created journal ID.
8. The app stores the journal ID and voucher file ID on the submission.

## Required OAuth scopes

```text
mfc/accounting/offices.read
mfc/accounting/accounts.read
mfc/accounting/taxes.read
mfc/accounting/journal.write
mfc/accounting/voucher.write
```

`mfc/accounting/voucher.write` is still required because receipt files are
attached as vouchers in Cloud Accounting.
