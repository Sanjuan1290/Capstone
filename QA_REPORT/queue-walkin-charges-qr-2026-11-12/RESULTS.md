# Queue labels, walk-in services, charge breakdown and QR Ph controls

Date: November 12, 2026, Asia/Manila. Repository baseline: `4f5b782`.

## Result

Implemented locally and validated with synthetic fixtures. Frontend production build succeeds. All 34 browser cases pass. No production database, payment provider, SMS service or hosted deployment was changed.

Production readiness remains conditional on applying the registered queue migration, deploying both applications, checking the deployed branch payment settings, and reviewing the existing regression/lint failures below. Live TiDB metadata and real PayMongo settlement were not tested in this task.

## Implemented behavior

- Queue labels show `MED-001` / `DER-001` without doctor IDs. Now Calling also fits the shorter label at mobile widths.
- New queue numbers use one sequence per branch, Philippine calendar date and clinic department. Different doctors in the same department share the sequence. A new date starts at 1; no cron job or deletion is needed. Existing queue rows keep their numbers.
- Patient and queue advisory locks remain held through commit. A locking read obtains the latest committed department number instead of an older transaction snapshot. Existing appointment and active-queue duplicate checks remain.
- Walk-in check-in now follows Patient → Service → Visit Details → Review. The service step reuses the online booking cards, category filters and pricing presentation. Doctor availability and acceptance still control walk-ins; no appointment time slot is reserved for a walk-in.
- The legacy Staff queue check-in modal also requires a service for a new visit. The server validates the active service against the verified branch and clinic department, then saves its ID, name, price, duration and notes. Existing scheduled check-ins retain the original appointment and service.
- Charge Summary lists every service, included item, additional medicine/service and custom charge, plus discounts and the resulting total. Included material amounts come from saved snapshots and are identified as included, so they are not added twice. Actual changed material quantities use their recorded price; legacy missing prices are not invented.
- Example tested: service PHP 540 (service portion PHP 350 + included Gauze PHP 190), extra medicine PHP 20, custom charge PHP 30 = subtotal PHP 590; discount PHP 135 = total PHP 455.
- QR Ph creation now always checks `branch_payment_settings.qrph_enabled` in TEST and LIVE. The old optional `CARAIT_ENFORCE_QRPH_BRANCH_TOGGLE` bypass was removed. The setting is checked again with a row lock inside QR creation to handle a concurrent settings change.
- Status reports branch availability and the frontend requires both the branch setting and server availability. Disabled branches show a disabled message and cannot generate another QR.
- Existing payable QR attempts continue polling/reconciliation when collection is disabled. Turning the toggle off does not invalidate a code already issued by the provider. Cash remains blocked until verified cancellation or reconciliation; provider-verified payments still use the existing settlement path.

## Verification results

These groups overlap; their counts are not a unique-test total.

| Check | Actual result |
| --- | --- |
| Focused queue, service, QR toggle, migration and frontend contracts | **49/49 passed** |
| Frontend charge, booking, payment, QR cancellation and pricing regressions | **27/27 passed** |
| Broader gateway, queue, branch authorization and checkout reopening regressions | **72/73 passed** |
| Existing stock-alert, birthdate and walk-in acceptance regressions | **18/19 passed** |
| Vitest queue workflow, payment amounts, billing items and consultation extras | **14/14 passed**, 5 files |
| Browser tests using built application and synthetic APIs | **34/34 passed**, headless Edge, desktop and mobile |
| Frontend production build | Passed, including **25/25** prebuild guards; existing large-bundle warning |
| Backend build checks (plain Node server has no build script) | Syntax **416 modules**, source graph **687 files / 1581 imports**, route bindings **250 references** passed |
| Lint of changed runtime frontend files | **0 errors**, 3 existing hook warnings in AppointmentCreatePage |
| Full frontend lint | **1 error / 23 warnings**, described below |
| Conflict marker scan of runtime sources; whitespace check | No remaining markers; `git diff --check` passed |
| Live TiDB migration/verification | **Not run**; isolated metadata/DDL fixtures used |

Queue tests exercise twelve concurrent same-department check-ins across two doctors, independent branch/department sequences, Philippine midnight (`15:59:59Z` → `16:00:00Z`), retained prior-day rows, missing/inactive/foreign service rejection, service snapshots, and duplicate prevention. Browser cases cover Admin, Staff and Super Admin walk-in submission, complete charge totals, QR-off in both modes, enabled QR creation, retained pending-QR cash locks, queue display at 1440/390px, and the prior full-balance payment / required birthdate / daily stock notification behavior.

## Existing failures

1. `server/tests/gateway/automaticInappPublications20261105.node.test.cjs:25`: “one recipient is notified once after repeated worker runs…” expects publication job status `completed`; it receives `pending` at line 50. The publication worker and this test were unchanged by this task.
2. `server/tests/branchIntegration/walkInAcceptanceLive.node.cjs:47`: “walk-in endpoints and service selection are connected across roles” expects literal text `Add a service performed` in Doctor_Consultation. The current component does not contain it. The doctor consultation component and this test were unchanged; the new service validation/submission tests and all three role browser flows pass.
3. Full lint: `client/src/pages/shared/Inventory.jsx:821`, unused `toast` variable (`no-unused-vars`). Inventory.jsx was unchanged. Full lint also reports 23 warnings; the changed runtime files have only the three existing AppointmentCreatePage hook warnings.

The QR cancellation wiring contract was corrected to inspect the actual Admin cancellation prop and the Staff checkout file, replacing an obsolete adapter-string expectation and a duplicated BillCheckout read. Provider cancellation safety assertions remain.

## Migration and rollout

New file: `server/db/migrations/2026-11-12-queue-daily-department-numbers.sql`.

- Adds `uniq_queue_branch_doctor_day_number` before removing the old global `uniq_queue_doctor_day_number` constraint. A shared doctor can then receive the same daily number at different physical branches without conflicting with the old index.
- Adds `idx_queue_branch_department_day` for the daily department lookup. Historical numbers are retained, including any older per-doctor duplicates; new allocations continue above that department's existing maximum today.
- The migration runner checks index definitions, safely resumes partial DDL and skips already-correct indexes. A recorded migration also checks for schema drift. No queue rows, financial data, existing reversal columns or migration history are deleted or rewritten.
- Runtime schema setup and read-only deployment verification use the same index contract. Historical migration files were not edited. The new SQL SHA-256 is `37b80754a001d8fd32de0c45e9b430a2ab3eb90fcb462b4849c94ffb8f120005`.
- Isolated tests cover partial application, reruns without duplicate-key errors, rejecting incompatible definitions, adding the replacement before dropping the old constraint, retaining historical migration hashes, and prior manually-added reversal columns.

Run the guarded migration runner against the intended deployment database before serving the new backend:

```powershell
cd server
npm.cmd run migrate
npm.cmd run verify:deploy
```

Those commands were **not executed against the user's database** in this task. Deployment verification requires the real deployment environment. The previously prepared daily-stock-alert migration is also still in the working tree/registry. Deploy both backend and rebuilt frontend, then confirm a disabled branch rejects QR creation and check an actual walk-in with the intended service.

TiDB behavior was cross-checked against its official [locking functions](https://docs.pingcap.com/tidb/stable/locking-functions/) and [transaction isolation documentation](https://docs.pingcap.com/tidb/stable/transaction-isolation-levels/); this is not a live database concurrency test.

## Files changed for this request

### Runtime frontend

- `client/src/utils/queueLabel.mjs`
- `client/src/pages/displayPage/QueueDisplay.jsx`
- `client/src/pages/shared/AppointmentCreatePage.jsx`
- `client/src/pages/staffPage/Staff_WalkInQueue.jsx`
- `client/src/utils/chargeSummary.mjs` (new)
- `client/src/components/billing/ChargeSummaryBreakdown.jsx` (new)
- `client/src/components/billing/BillCheckout.jsx`
- `client/src/pages/adminPage/Admin_CheckoutDetail.jsx`
- `client/src/pages/staffPage/Staff_CheckoutDetail.jsx`
- `client/src/components/billing/CheckoutPaymentSection.jsx`
- `client/src/components/billing/QrPhPaymentPanel.jsx`

### Runtime backend and migration

- `server/utils/walkIn.js`
- `server/controllers/admin.controller.js`
- `server/controllers/staff.controller.js`
- `server/routers/paymongoGateway.js`
- `server/utils/queueNumberingSchema.js` (new)
- `server/db/migrations/2026-11-12-queue-daily-department-numbers.sql` (new)
- `server/scripts/branchMigrations.js`
- `server/scripts/verifyDeployment.js`
- `server/utils/schema.js`

### Tests and evidence

- `server/tests/queue/walkInServiceDaily20261112.node.cjs` (new)
- `server/tests/gateway/qrBranchToggle20261112.node.cjs` (new)
- `server/tests/deployment/queueNumbering20261112.node.cjs` (new)
- `server/tests/helpers/queueSchemaFixture.cjs` (new)
- `server/tests/deployment/migrationRunner.node.cjs`
- `server/tests/branchIntegration/walkInBranchSafety.node.cjs`
- `server/tests/gateway/batch3CancellationSafety.node.cjs`
- `client/tests/chargeSummary20261112.node.test.mjs` (new)
- `client/tests/queueLabels20261111.node.test.mjs`
- `client/tests/appointmentDedicatedPage.node.test.mjs`
- `client/tests/batch3QrCancellationUi.node.test.mjs`
- `client/tests/browser/queueWalkinChargesQr20261112.spec.mjs` (new)
- `client/tests/browser/dailyStockWalkInPayments20261112.spec.mjs` (four-step expectation)
- `client/tests/browser/helpers/clinic20261111.mjs` (exports synthetic bill fixture)
- This report, local Playwright config and browser runner. Logs, browser JSON and synthetic screenshots remain local ignored artifacts under this folder.

## Reproduce the browser checks

```powershell
cd client
npm.cmd run build
cd ..
node QA_REPORT/queue-walkin-charges-qr-2026-11-12/run-browser.cjs
```

Evidence inspected: `queue-390.png`, `charges-staff.png`, `walkin-review-admin.png`. Additional screenshots cover each role's review and charge summary and the desktop queue display.
