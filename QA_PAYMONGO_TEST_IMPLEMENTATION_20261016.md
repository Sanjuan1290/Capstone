# CARAIT — QA remediation and PayMongo Dynamic QR Ph test implementation

**Date:** October 16, 2026  
**Status:** **STAGING / NOT PRODUCTION-READY**. Source implementation and dependency-free tests only. No PayMongo credentials, public webhook, running MySQL, npm dependencies, or browser session were available in this runtime. Do not treat these tests as a live payment or completed five-role end-to-end certification.

## Delivered changes

### Correctness and branch isolation
1. Consultation-generated bills explicitly retain the source appointment's `branch_id`, including safe updates on the already-existing draft. This prevents cross-branch bills silently defaulting to Branch 1.
2. Service and inventory lookups while creating bills are restricted to the current physical branch. Foreign IDs fail instead of contaminating a bill or silently disappearing.
3. Existing clinical-material validation now passes the physical branch when checking catalog service consumables.
4. Eight inventory movement log insertion paths include explicit `branch_id`; manual stock movement audits now include branch attribution.
5. Production origin checks now include the `superadmin_token` cookie.
6. Migration checksum validation allows Windows CRLF versus LF and end-of-file newline variations, while refusing substantive SQL changes.
7. Read-only historical branch-attribution SQL report added under `server/db/reconciliation/`. **It is not an automatic repair migration**. Never execute the commented repairs without backup and manual review of each discrepancy.

### PayMongo TEST mode Dynamic QR Ph
1. After checkout bill confirmation, authorized Staff or branch Admin can generate an exact-outstanding-balance QR Ph through PayMongo Payment Intents / QR Ph Payment Methods / attach.
2. Secrets reside exclusively in `server/.env`; `server/.env.example` has `PAYMONGO_MODE=test`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_PUBLIC_KEY`, `PAYMONGO_WEBHOOK_SECRET`.
3. An active QR attempt is persisted in `payment_gateway_attempts` and prevents concurrent manual payment, duplicated QR creation, editing and reopening of the bill until reconciled.
4. The webhook `/api/webhooks/paymongo` preserves the raw JSON body, checks PayMongo HMAC `Paymongo-Signature` test `te`, enforces a five-minute timestamp tolerance, checks test mode, event amount/currency/QR source/intended branch/bill and **fetches the succeeded Payment Intent independently**.
5. Valid `payment.paid` events use the **existing** atomic billing payment/receipt/checkout dispensing service. This reuses batch/FEFO and double-deduction guards. Webhook replays and request retries must not cause duplicate receipts. QRPh cannot be manually spoofed using the normal payment endpoint.
6. Browser checkout panel appears in **Staff Checkout** and **Admin / Super Admin branch workspace Checkout**. It displays the PayMongo test QR, available simulator link, pending/paid/review status, polling, clear warning that a test QR **must not be scanned with real money**, and UI lock of manual payment while pending.
7. Provider-paid webhook settlement preserves the original human staff/admin bill confirmer rather than overwriting it with the machine actor.
8. Payments are attributed to the branch and have a unique provider payment ID, intent ID and event ID. QR payment data lives in two additive tables.

## New/changed key files

- `server/utils/billing.js`
- `server/controllers/admin.controller.js`
- `server/controllers/doctor.controller.js`
- `server/controllers/staff.controller.js`
- `server/controllers/billingCorrections.controller.js`
- `server/utils/{supplyTransfers,manualInventoryMovement,inventoryReadiness}.js`
- `server/middlewares/httpSecurity.middleware.js`
- `server/utils/paymongoClient.js` (new)
- `server/utils/paymongoWebhookSignature.js` (new)
- `server/routers/paymongoGateway.js` (new)
- `server/routers/{staff,branches}.router.js`
- `server/server.js`
- `server/scripts/{branchMigrations,verifyBranchRouteCoverage}.js`
- `server/db/migrations/2026-10-16-paymongo-test-qr.sql` (new)
- `server/db/reconciliation/2026-10-16-branch-attribution-review.sql` (new, read-only)
- `server/.env.example`
- `server/tests/gateway/` (new)
- `server/tests/checkouts/reopen-editing.node.cjs`
- `client/src/components/billing/QrPhPaymentPanel.jsx` (new)
- `client/src/services/{admin,staff}.service.js`
- `client/src/pages/{adminPage/Admin_CheckoutDetail,staffPage/Staff_CheckoutDetail}.jsx`

## Steps for setting up a PayMongo sandbox (you perform)

1. **Back up your current MySQL database**, restore a disposable test database and verify it, and keep copies of the current application source. Do not run tests against clinical production data.
2. Apply the attached **patch ZIP** to the *corresponding* current `AllCodes(9)` source tree. Prefer patching your existing repository so it retains its real images and other binary assets (the text export stores public image URLs, not the binary images).
3. In your terminal:
   ```sh
   cd server
   npm ci
   npm run migrate
   npm run verify:reports-sql
   npm run verify:deploy
   npm run test:node
   npm test
   ```
4. In `server/.env`, use **TEST** credentials from the PayMongo Dashboard (do not put them in React or chat):
   ```dotenv
   PAYMONGO_MODE=test
   PAYMONGO_SECRET_KEY=sk_test_REPLACE_ME
   PAYMONGO_PUBLIC_KEY=pk_test_REPLACE_ME
   PAYMONGO_WEBHOOK_SECRET=whsk_REPLACE_ME
   ```
   Retain all required existing DB, JWT, SMTP/SMS (if needed) and client config variables. Restart Express after changing `.env`.
5. You must expose the Express server through a publicly reachable **HTTPS** domain or temporary tunnel (e.g. Cloudflare Tunnel) and create a **test-mode** webhook in PayMongo Dashboard → Developers / Webhooks pointing to:
   `https://YOUR_HTTPS_BACKEND/api/webhooks/paymongo`
   Subscribe at least to `payment.paid`, `payment.failed`, and `qrph.expired`. Copy the exact webhook **signing secret** for that endpoint into the server `.env`. It is *not* your API secret key.
6. Run the React client, sign in as Staff or an Admin assigned to a branch; create/confirm a bill with a positive outstanding amount, open Checkout / Collect Payment, and click **Generate Test QR Ph**. You should see a QR and (when supplied by PayMongo) a simulation link. **Do not scan a TEST QR using any real bank or wallet app or transfer real funds.** Use PayMongo's test/simulation flow.
7. Watch PayMongo webhook deliveries and server logs; verified `payment.paid` should atomically create a receipt, deduct separately sold stock **once** when paid in full, update bill status, and refresh the page. Retry the same event and refresh to verify no duplicate receipt.
8. Run `cd client && npm ci && npm run lint && npm run build`, then perform five-role browser QA with a copy of your test database and test users.

## Test and release-gate results from THIS runtime

| Gate | Result | What it establishes |
|---|---|---|
| Dependency-free Node regression suite | **131/131 PASS** | Pure/source mocked tests including HMAC tamper/replay, non-QR payload, amount, intent, webhook replay, branch-scoped SQL patterns, pending QR locks and Windows migration hashes |
| Admin branch route checker | **124 known calls, 0 unmatched** | Admin client static routes only; *not* runtime authorization or Staff/Doctor/Patient coverage |
| Relative import graph | **372 source files / 958 imports PASS** | Every analyzed relative source import resolves |
| Server JavaScript syntax | **212 files PASS** | Node syntax only |
| Complete server Vitest suite | **BLOCKED** | `npm ci --offline` dependencies missing in this container |
| Client ESLint and Vite build | **BLOCKED** | Dependencies unavailable; previous report listed 22 lint errors, not revalidated here |
| Real two-branch MySQL workflow | **BLOCKED** | No local MySQL instance / integration harness from the earlier 38/38 progress report |
| Live PayMongo test environment | **BLOCKED** | No test keys, test webhook secret or public HTTPS endpoint supplied |
| Playwright real browser five-role walkthrough | **BLOCKED** | No running frontend/backend/MySQL environment here |

The earlier report's **38/38 MySQL integration tests are NOT re-runnable from `AllCodes(9).txt`**: the `clinicWorkflow.int.cjs` harness and October 16 historical repair migration described there were absent in this baseline. The added QR test files are **mock/source-level** safeguards, not substituted proof of real bank or inventory settlement.

## Critical remaining QA items before production

1. Restore or recreate the original two-branch API integration test using a **disposable** MySQL schema; exercise all five roles from creation to payment, negative cross-branch accesses, and the 35 → 32 → 30 stock reconciliation with exact batch/location logs.
2. Confirm the real PayMongo test QR API responses, status transitions, signed test webhook and simulator with your account. Verify actual server/webhook process crashes, timeouts, duplicate deliveries and delayed events.
3. Add a safe admin **Reconcile PayMongo Attempt** workflow for QR attempts stuck in `review`, provider timeouts, or missing expiry events. Currently the application intentionally blocks conflicting payments rather than auto-unlocking money that may have been charged. Do not bypass this lock manually without provider verification.
4. Handle late provider-paid webhooks after a provider-declared expiry as explicit reconciliation; a lost webhook must not silently allow a second manual payment.
5. Reconcile historical bill and inventory branch data using the read-only SQL report. Decide and review every proposed repair before an idempotent data migration. The historical repair migration mentioned in the previous AI's progress log was NOT found in this upload.
6. Extend static route verification to Staff/Doctor/Patient AND execute endpoint ownership tests. Fix frontend lint warnings/errors and full build failures rather than weakening tests.
7. Real Playwright tests: Admin & Super Admin setup, staff permissions, Doctor schedules, Patient booking, queue, consultation, actual materials consumption, cashier/QR, receipt, refund, partial payments, mobile/tablet/desktop screenshots and inaccessible controls.
8. Review refund policy, clinic-approved mandatory clinical fields, local BIR-compliant receipt text/numbering, reconciliation reports and reporting of QR Ph transaction fees. The QR gateway code is test-only by design; never drop live keys into the test configuration to collect real money.
9. Implement UX redesign after correctness is verified: consultation patient context + autosave/review checklist, inventory batch/location trace + before/after stock, checkout sticky amounts/paid/balance, clear test status and reconciliation alerts.
10. Only after all gates: implement inventory bulk import/export from the earlier plan, with safe batch stock-in, no stock overwrites, scoped spreadsheet validation, tokenized dry run and audited confirmation.

## Caution about this package

The **patch archive** is intended for your current repository. The **full reconstructed source** is provided for code review and testing but should not overwrite binary assets from your real repository. Neither ZIP includes `.env`, API keys, database contents or credentials. Only additive, non-destructive migration included. **Use staging only.**
