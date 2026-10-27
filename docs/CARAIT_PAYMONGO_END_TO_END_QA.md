# CARAIT Clinic PayMongo QR Ph QA

**Audit date:** 2026-10-20  
**Base repository revision reviewed:** `ac11370` (`feat: Enhance PayMongo integration to support live payments with explicit activation`); audit fixes below are uncommitted.  
**Deployment decision:** **NOT READY**

This audit separates source and local automated checks from checks requiring a disposable database, PayMongo TEST account, hosted deployment, or browser session. Mocked webhook tests are not evidence of a PayMongo transaction or delivery.

## A. Implementation status

The TEST/LIVE implementation patch is present in the current repository. `server/utils/paymongoMode.js`, `paymongoClient.js`, `paymongoWebhookSignature.js`, `paymongoRefundVerification.js`, `envValidation.js`, and `routers/paymongoGateway.js` contain the mode selection, key-prefix checks, live activation gate, mode-specific signature validation, event isolation, provider intent/refund verification, and reconciliation path. The current commit subject confirms the feature patch is in this checkout; it does not establish that Render or Cloudflare Pages runs this revision.

The workspace configuration has `PAYMONGO_MODE=live`, the live activation gate is `false`, and PayMongo credentials are configured. Production-mode runtime configuration validation passed with the live-disabled warning. Secret values were not printed or copied into this report. No payment request was made. No disposable QA database was identified, and the configured database was not contacted.

The code uses matching `sk_test_`/`pk_test_` or `sk_live_`/`pk_live_` prefixes and does not fall back across modes. Selected-mode missing or mismatched keys fail startup validation. LIVE mode starts with a warning while QR creation remains off unless `PAYMONGO_LIVE_ENABLED=true`; both the gateway route and PayMongo client enforce that gate. The frontend labels TEST and LIVE and warns that a LIVE QR moves real money.

The webhook route is mounted before JSON parsing with a raw body parser. Signature verification chooses `te` or `li`, signs the timestamp plus raw bytes with HMAC-SHA256, checks a five-minute timestamp window, and compares timing-safely. The handler validates event IDs and mode, supports `payment.paid`, `payment.failed`, and `qrph.expired`, checks amount/currency/QR method, and independently retrieves the Payment Intent before settlement. The actual dashboard subscription and delivery history remain unverified. PayMongo's current QR Ph guide documents the same intent → QR payment method → attach flow and these event types; its webhook documentation defines raw-body signature validation and mode-specific signature fields. [QR Ph API](https://docs.paymongo.com/docs/payment-acceptance-qr-ph-api), [webhook signature setup](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management)

Settlement routes through the existing `staffCtrl.payBill` transaction. Source review found a branch-locked bill read, a unique payment idempotency key, branch-specific receipt allocation, checkout inventory deduction only when a bill becomes fully paid, audit writing, and transaction commit/rollback. Gateway attempt status is updated after that transaction; reconciliation can find the same idempotent local payment after a retry. This is source and mocked-test evidence, not a TiDB execution result.

The deployed backend revision and public health/readiness results could not be verified. GET attempts to `/api/health` and `/api/ready` failed at the local TLS/network handshake before receiving an HTTP response. This is not evidence that the endpoints are down. No Render or PayMongo dashboard session was available.

## B. Complete transaction flow

| Step | Feature | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| 1 | Patient appointment | Synthetic appointment is created for the correct doctor and branch | Not run; no disposable QA database or QA account | **BLOCKED** |
| 2 | Doctor consultation | Consultation finalizes and creates the expected billable items once | Not run; no disposable QA database or synthetic clinician session | **BLOCKED** |
| 3 | Staff billing | Confirmed bill has the correct total and outstanding balance | Not run against a QA clinic record | **BLOCKED** |
| 4 | QR generation | PayMongo returns one PHP QR for the exact centavo balance and correct bill/branch | Live gate behavior and amount/mode checks are covered locally; no provider QR was generated | **NOT TESTED** |
| 5 | Payment simulation | PayMongo TEST simulator completes a successful transaction | No TEST credentials or simulator transaction used | **NOT TESTED** |
| 6 | Webhook delivery | PayMongo delivers a signed event and backend verifies it | Mocked event tests pass; no PayMongo delivery or dashboard evidence | **BLOCKED** |
| 7 | TiDB settlement | Correct payment, mode, balance, actor/audit, and branch records commit atomically | Source and mocked transaction-path checks only; no disposable TiDB connected | **BLOCKED** |
| 8 | Receipt | Exactly one correctly attributed QR Ph receipt is generated and printable | Source transaction and receipt display reviewed; no receipt generated in a database | **BLOCKED** |
| 9 | Inventory | Checkout quantities and batches are deducted once, only at the intended billing stage | Branch-aware inventory source checks pass; no bill or batch was changed | **BLOCKED** |
| 10 | Transaction history | Staff, Branch Admin, Super Admin, reports, and receipt history agree | Generic payment-ledger filters include payment methods; no QR Ph transaction to inspect in these screens | **BLOCKED** |
| 11 | Reconciliation | A provider-paid intent can recover local settlement without duplicates | Mocked reconciliation test settles once; no provider or database restart test | **BLOCKED** |
| 12 | UI completion | Checkout shows final state after polling/refresh on supported viewports | Build and source review pass; no browser/Playwright session or screenshots | **NOT TESTED** |

## C. Test mode results

No test was run against PayMongo TEST infrastructure. The current workspace is configured for LIVE mode, and no PayMongo API request was made.

Local automated checks completed:

- `server`: production-mode runtime configuration validation passed against the workspace `.env` without starting the server or connecting to a database; `npm run verify:source` passed (409 source files, 1,006 relative imports); `npm run test:node` passed (222 tests); `npm test` passed (77 Vitest files, 262 tests).
- `client`: `npm run lint` passed with 14 existing warnings and no errors; `npm run build` passed with the existing large-chunk advisory; `npm run test:hosting` passed (5 tests); `npm run test:design` passed (8 tests); `npm run test:autosave` passed (7 tests).
- PayMongo-specific Node tests cover synthetic TEST/LIVE config validation, key mismatch rejection, LIVE gate behavior, HMAC mode/timestamp checks, cross-mode rejection, independent intent checks, failed/expired events, duplicate/concurrent delivery, branch-authorization source contracts, and mocked reconciliation. The concurrent test models the controller's idempotency key; it does not exercise database locking or real inventory rows.
- `client/tests/paymongoBillingUi.node.test.mjs` verifies the QR Ph payment-method label.

PayMongo's testing guide says TEST QR payments must be completed with the returned `test_url`, not a real payment app. Webhook delivery is at-least-once and non-2xx responses can be retried up to twelve times, so local idempotency tests do not replace checking actual Event Deliveries. [PayMongo QR testing guide](https://docs.paymongo.com/docs/payment-acceptance-testing), [webhook delivery concepts](https://docs.paymongo.com/docs/developer-tools-webhooks-key-concepts)

## D. LIVE mode readiness

- **Source support:** present. Synthetic tests and production-mode validation of the workspace configuration confirm valid LIVE settings can pass while the activation gate remains off.
- **Current local gate:** off. No payment-creation path was invoked to create a LIVE QR.
- **Merchant approval and QR Ph capability:** not checked; no PayMongo dashboard access was available.
- **Deployment configuration and running revision:** not verified.
- **Technical readiness for a controlled LIVE payment:** not established. Sandbox end-to-end verification and isolated financial-record verification must pass first.
- **Real payment, refund, settlement, or production replay:** none performed.

## E. Bugs fixed

| Files | Defect | Fix | Regression evidence |
|---|---|---|---|
| `server/utils/envValidation.js`, `server/tests/gateway/paymongoEnvValidation.node.cjs` | Credentials could be set without a mode, and an invalid `PAYMONGO_LIVE_ENABLED` value silently acted as disabled. | Startup validation now requires a mode whenever any PayMongo credential is set and accepts only `true`/`false` for the gate. | Synthetic TEST/LIVE startup, missing/mismatched credentials, missing mode, and bad gate tests pass. |
| `client/src/utils/billingUi.js`, `client/tests/paymongoBillingUi.node.test.mjs` | QR Ph receipts and transaction history fell through to the generic label “Qrph”. | Added the explicit display label “QR Ph”; the same helper is used by billing history and receipt printing. | Client Node regression test passes. |
| `server/tests/gateway/paymongoWebhook.node.cjs`, `server/tests/gateway/paymongoQr.node.cjs` | Existing mocked coverage did not cover concurrent duplicate delivery, failure/expiry, successful webhook-loss reconciliation, or local idempotency/branch route contracts. | Added focused regression cases for those paths and controller contracts. | PayMongo-focused set passes; these remain mocks/source checks, not provider/TiDB integration. |
| `docs/DEPLOYMENT_RUNBOOK_2026-10-20.md`, `docs/PREDEPLOYMENT_AUDIT_2026-10-20.md`, `docs/CARAIT_FULL_SYSTEM_QA_20261020.md` | Prior repository documents described PayMongo as TEST-only after the LIVE patch had landed. | Updated payment-mode guidance to describe gated LIVE support and the current verification state. | Reviewed against the current source revision. |

## F. Remaining issues

- No isolated TEST-mode PayMongo account, disposable QA database, or synthetic role accounts were available, so the appointment-to-settlement workflow remains unverified.
- The LIVE credential configuration is present in the workspace with the gate off; no disposable QA database was identified, and the configured database was not contacted.
- The deployed Render revision, `/api/health`, `/api/ready`, webhook endpoint subscriptions, PayMongo Event Deliveries, merchant LIVE capability, and Cloudflare Pages deployment were not verified.
- No browser automation runner was available. Desktop, tablet, mobile, polling, modal behavior, console/network traces, and screenshots remain untested.
- Database migration `2026-10-16-paymongo-test-qr.sql` exists in source, but whether it is applied to the deployed TiDB schema is unknown.
- No additional payment-code defect was confirmed in the inspected settlement path. The remaining findings are unverified external/integration conditions, not claims that the complete payment flow passed.

## G. Deployment readiness

**NOT READY**

The source changes and local regression suites are present and pass, but no real provider sandbox transaction, signed provider delivery, isolated TiDB commit, receipt, inventory movement, browser flow, or deployed runtime was verified. No production record was modified, no money was charged, and no secret value was exposed in logs or this report.


