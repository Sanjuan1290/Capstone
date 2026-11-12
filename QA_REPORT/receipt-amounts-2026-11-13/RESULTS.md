# Receipt payment amounts — November 13, 2026

Reviewed against commit `edf8cb6`. Local implementation and testing only; no deployment, database changes, migrations, real payments or refunds were performed.

## Result

- Removed Remaining Balance from bill history details and the shared printed receipt. History list rows show Bill Total and Net paid for settled and partially paid bills.
- Each cash payment displays its saved Amount Paid, Cash Received and Change. Example: ₱1,949 paid, ₱2,000 received, ₱51 change.
- Online payments display Amount Paid and omit Cash Received and Change, even when legacy payloads contain those fields.
- Historical cash payments with missing tender/change show “Not recorded.” Values are never inferred from the current bill or fabricated as zero.
- Refund details, refund/void status badges, bill calculations and payment collection remain intact. Voided payment amounts are identified as Voided Amount. Staff refund restrictions remain intact.

## Changed application files

- `client/src/components/billing/BillHistoryDetail.jsx`: active Admin, Super Admin and Staff bill history details.
- `client/src/components/billing/BillHistory.jsx`: alternate history renderer kept consistent.
- `client/src/components/billing/BillingWorkspace.jsx`: history list no longer displays balances; payment collection still shows Balance due.
- `client/src/components/billing/PaymentReceiptAmounts.jsx`: shared accessible payment amount display.
- `client/src/utils/paymentReceiptAmounts.mjs`: saved payment values and cash-only fields.
- `client/src/utils/billingReceiptTemplate.mjs`: shared receipt used by all portals.

## Verification

| Check | Actual result |
| --- | --- |
| Receipt amounts, A5 receipt, history service contracts and QR Ph labels | **21 passed, 0 failed** (`focused.log`) |
| Wider billing replacement regression checks, including the above | **30 passed, 1 failed** (`unit.log`) |
| Built application in headless Edge, with synthetic API responses | **8 passed, 0 failed**, Admin/Super Admin/Staff cash and QR Ph print flows, historical missing fields, partial-payment history and payment collection |
| Browser runtime errors and unexpected API mutations in role/payment scenarios | **None** |
| Production frontend build and prebuild contracts | **Passed**, 25 prebuild checks; existing bundle-size warning |
| Full frontend ESLint | **0 errors, 23 existing warnings** |
| Patch whitespace check | **Passed** |
| Printed A5 cash PDF | **Generated successfully, one page** (`receipt-cash.pdf`) |

The receipt tests also cover exact cash payments with zero change, all four online methods, refunds, partial refunds, voids, HTML escaping, unknown legacy amounts, partial-payment status and multipage item tables. Browser tests use mocked API responses; they do not exercise a live production database or payment provider.

## Existing regression failure

`client/tests/billingReplacement20261105.node.test.mjs` — **pending clinical adjustments are reviewed on bill, not by a Doctor**: expects the literal source pattern `staffOnly && <div className` in `ChargeAdjustmentsPanel.jsx`. The panel and this regression test are both unchanged from `edf8cb6` (`git diff --quiet HEAD` for both files returned 0). This existing source-text assertion is outside the receipt display changes and was not rewritten to make the suite pass.

## Deployment

This patch requires a frontend deployment. It uses existing payment API fields `amount`, `amount_received` and `change_amount`; no database migration is needed. The receipt-specific checks pass. The existing wider billing regression failure remains reported above. The hosted website has not been updated by this work.

## Reproduce

From the repository root:

```powershell
npm.cmd run build --prefix client
npm.cmd run lint --prefix client
node --test client/tests/billingReceiptA5_20261105.node.test.mjs client/tests/paymentReceiptAmounts20261113.node.test.mjs client/tests/billingHistoryServiceContracts.node.test.mjs client/tests/paymongoBillingUi.node.test.mjs
node QA_REPORT/receipt-amounts-2026-11-13/run-browser.cjs
```

Evidence: `browser-results.json`, `history-cash.png`, `receipt-cash.png`, `receipt-cash.pdf` and ignored local logs alongside this report. Browser runner starts and stops a hidden local Vite preview; all API requests in these scenarios are mocked.
