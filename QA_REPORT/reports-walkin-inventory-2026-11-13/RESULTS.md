# QA results — Reports, walk-ins and inventory — 2026-11-13

Baseline: repository HEAD `71161a2`, initially clean. Changes are local and uncommitted. No hosting deployment, production-data mutation, SMS/email, payment, stock operation or migration execution was performed. Read-only EXPLAIN/metadata checks used the database configured in `server/.env`; this does not prove the hosted Render/TiDB service uses that same database.

## Implemented and reviewed

1. **Reports:** corrected row-array/object handling that zeroed branch aggregates and Super Admin new/returning patient figures. Excluded unconfirmed pending bills, included shared doctors, corrected current available-stock alerts, excluded archived inventory from expiry/location figures, and made report failures explicit. Service-only totals exclude supplies. Usage reference counts distinguish bill IDs from consultation IDs and are accurately labelled. Charts support refund-only negative periods. Selling-value estimates are distinguished from purchase cost. MySQL decimal strings format correctly in the PDF.
2. **Staff Walk-in Queue:** removed the duplicated older Add Walk-in Visit modal. It opens the current shared Patient → Service → Visit Details → Review flow and returns to the queue. Existing appointment check-in retains its saved service/price; a separate walk-in is an explicit choice. Branch ownership checks remain. Queue load/action failures are visible; duplicate actions and stale responses are guarded; the displayed queue day follows Philippine midnight.
3. **Intake print:** kept full name, required birthdate before today, sex, optional mobile, visit date, requested service, concern and privacy/parent-or-guardian signature. Removed the account checklist, queue/reference field, email, address, preferred doctor and duplicate technical/footer content. Visually inspected the generated form.
4. **Inventory activity/audits:** whole-unit formatting; sequential item totals before/after; movement audits in the same stock transaction; correct actor including clinical doctor/collecting staff. Transfers keep item totals unchanged. Historical unknown balances stay unknown. All 16 movement INSERT sites use the writer.
5. **Stock alerts:** prominent warning banner with review action in branch Admin/Staff dashboards, Super Admin dashboard and inventory views; stronger low/out-of-stock card treatment; links retain physical branch and stock-alert filters. Reserved stock affects availability alerts while valuation remains physical stock.
6. **Accepting Walk-ins:** the UI had a response-order/render race: changing inline parent callbacks reloaded/reset the switch, and a late GET could overwrite a saved PUT. Resource identity, generation guards and explicit boolean parsing now prevent those reversions; loading does not masquerade as Off. Staff doctor schedule requests also reject stale selections.

Full field/source/date mappings: [FIELDS.md](FIELDS.md).

## Final results

| Check | Actual result |
| --- | --- |
| Focused backend reports, stock movements, full inventory groups, Staff isolation, acceptance, branch-write security, migration runner and global inventory | 122/122 passed on the final focused run, including the comparison/trend route test |
| Frontend node contracts: display, report PDF, reporting actions, appointment page and queue labels | 22/22 passed |
| Frontend production build | Passed, including 25/25 prebuild contracts; existing large-bundle warning remains |
| Headless Microsoft Edge / Chromium browser suite | 33/33 passed against final production build, 25.5 seconds; synthetic/mocked APIs only |
| Backend syntax | 422 JavaScript modules passed; Staff route registration and charge reduction smoke checks passed |
| Route bindings | 253 static handler references passed |
| Source graph | 697 source files, 1622 relative imports resolved |
| Full frontend lint | 0 errors, 23 warnings, mostly existing hook/ref/dependency diagnostics |
| Branch report SQL | All 19 actual SELECTs passed read-only MySQL EXPLAIN |
| Super Admin report SQL | 44 actual SELECTs passed MySQL EXPLAIN across all five sections, both global and branch scope; reservation-aware mode enabled only inside the verifier process |
| Comparison/trend SQL | Four additional SELECTs passed MySQL EXPLAIN |
| Data arithmetic and joins | Real report handlers/loaders executed against isolated synthetic SQLite data, including reservations, archived items, shared doctors, old-payment voids and refund-only periods; not a substitute for TiDB staging validation |
| Migration safety | Guard tests cover missing/partial/existing columns, correct nullability/type, rerun and incompatible-type rejection; prior migration checksums retained; new SQL hash pinned |
| Conflict markers and whitespace | Source conflict-marker scan clear; `git diff --check` passed |
| Full backend Vitest suite | 256 passed, 7 failed across 263 tests; details below |
| Additional multibranch regression file | 4 passed, 1 failed; details below |

Browser coverage includes all five Super Admin report sections and PDF filter propagation; branch reports as Admin, Staff and Super Admin; canonical Staff walk-in creation with service selection; existing vs separate check-in; intake popup; queue retry/call/return and Philippine midnight; delayed GET arriving after toggle save and navigation; before/after stock activity and both audit views; dashboard alert destinations; inventory desktop/mobile layouts and global stock-alert filter. The prior queue/service/charge-summary/QR restriction browser tests are included in the 33.

Stock tests exercise multi-batch sequential deductions, returns, unchanged totals on room transfer, missing-bounds rejection, rollback after audit failure, and deferred clinical deductions posted after payment with the collecting Staff actor. Existing migration and inventory regression assertions remain in place; mocks were extended for the shared helper and current canonical UI rather than bypassing the behavior.

Synthetic branch 1 reconciliation: appointments 4, unique patients 3, new 2, returning 1, completed 1, no-show 1, no-show rate 50%; billed gross 1300 minus discounts 100 = net 1200; received 1000 minus voids 700 minus refunds 200 = collections 100; current outstanding 200; service lines 1280 exclude supply 20; inventory products 3, physical quantity 14, selling value 700, low 1, out 1, expired batch 1, expiring batch 1, net usage 4. A refund-only day returns -200.

## Remaining regression failures

The seven Vitest failures are older source-text contracts. Their failing expected literals are already absent from baseline HEAD; the relevant behavior/source fragments were not introduced by this task. They were left visible rather than weakening unrelated assertions:

| Test | Failure |
| --- | --- |
| `security/batch2InventorySemantics.test.js:51` | Expects literal `whole units` in service form |
| `security/batch2InventorySemantics.test.js:99` | Expects `rx.quantity ?? rx.dosage` in patient history |
| `security/batch5InventoryWorkflow.test.js:57` | Expects older `Actual service supplies and any Extra...` consultation copy |
| `security/batch6CDoctorAccounts.test.js:27` | Expects old doctor request destructuring with `req.body || {}` |
| `security/billingCheckoutFollowup20260930.test.js:17` | Expects older `Open Bill` text |
| `security/consultationWorkflowUx20260930.test.js:23` | Expects older `Supplies Actually Used` text |
| `security/recoveryAutosave20260928.test.js:55` | Expects older consultation supply copy |

The separate `branchIntegration/multibranchAdditions.node.cjs` test **deactivated branch is denied** fails because its doctor-session fixture mocks the former direct account/branch query but not the newer doctor-assignment dependency. The current doctor path delegates to `doctorBranches`; the test's `next` callback fails with “should not call next.” The middleware and this test were not changed here. This is an unresolved regression-test failure, not evidence from a live authorization attempt.

## Migration and deployment readiness

**Not deployed; migration required before these stock writers are released.** The configured database's read-only schema guard reported `Inventory movement migration required: quantity_before`. The check stopped at the first missing column; it did not prove whether `quantity_after` exists. No ALTER was executed.

New migration: `server/db/migrations/2026-11-13-inventory-movement-balances.sql`, adding nullable `quantity_before` and `quantity_after` as DECIMAL(12,2). The registered runner checks metadata, skips correct existing columns, resumes a partial application, and rejects wrong types/nullability. It does not delete migration history, reapply existing reversal columns or alter existing financial rows. Historical balances remain NULL.

On the intended deployment database, use the existing guarded runner from `server`: `npm.cmd run migrate`, then `npm.cmd run verify:deploy`. Stage and smoke-test the queue/toggle and a stock movement/audit pair before releasing the matching backend and frontend. These commands are deployment steps, not actions performed in this review. MySQL EXPLAIN passed locally; live TiDB migration verification and hosted smoke tests remain outstanding, along with the regression failures above.

## Reproducing the checks

- `node --test server/tests/reports/reportData20261113.node.cjs` — actual SQL arithmetic/comparison/trend contracts.
- `node --test server/tests/inventory/movementBalances20261113.node.cjs server/tests/deployment/migrationRunner.node.cjs` — movement/audit/schema guards.
- `npm.cmd test` in `server` — full Vitest suite, including the remaining failures.
- `npm.cmd run check:syntax`, `check:routes`, `verify:source`, `verify:reports-sql` in `server`.
- `node QA_REPORT/reports-walkin-inventory-2026-11-13/verify-sql.cjs` — EXPLAIN/metadata only; no migrations or report-data SELECT execution.
- `npm.cmd run build` and `npm.cmd run lint` in `client`.
- `node QA_REPORT/reports-walkin-inventory-2026-11-13/run-browser.cjs` from the repository after building — regenerates synthetic SQL fixtures, starts local preview and runs the 33 browser tests.

Local logs, generated JSON and browser screenshots are ignored by this QA folder's `.gitignore`. Visually inspected inventory alerts, global availability/physical quantity separation and the simplified intake form.

## Changed files

The generated list below covers source, tests and review tooling. No historical migration SQL was edited.

- `QA_REPORT/reports-walkin-inventory-2026-11-13/.gitignore`
- `QA_REPORT/reports-walkin-inventory-2026-11-13/FIELDS.md`
- `QA_REPORT/reports-walkin-inventory-2026-11-13/RESULTS.md`
- `QA_REPORT/reports-walkin-inventory-2026-11-13/playwright.config.mjs`
- `QA_REPORT/reports-walkin-inventory-2026-11-13/prepare-fixtures.cjs`
- `QA_REPORT/reports-walkin-inventory-2026-11-13/run-browser.cjs`
- `QA_REPORT/reports-walkin-inventory-2026-11-13/verify-sql.cjs`
- `client/src/components/InventoryQuantityChange.jsx`
- `client/src/components/StockAlertBanner.jsx`
- `client/src/components/charts/AnalyticsCharts.jsx`
- `client/src/components/schedule/WalkInAcceptanceToggle.jsx`
- `client/src/pages/adminPage/Admin_AuditLogs.jsx`
- `client/src/pages/adminPage/Admin_Dashboard.jsx`
- `client/src/pages/adminPage/Admin_Inventory.jsx`
- `client/src/pages/adminPage/Admin_Reports.jsx`
- `client/src/pages/shared/AppointmentCreatePage.jsx`
- `client/src/pages/shared/Inventory.jsx`
- `client/src/pages/staffPage/Staff_Dashboard.jsx`
- `client/src/pages/staffPage/Staff_DoctorSchedules.jsx`
- `client/src/pages/staffPage/Staff_WalkInQueue.jsx`
- `client/src/pages/superAdminPage/AllInventory.jsx`
- `client/src/pages/superAdminPage/InventoryPulse.jsx`
- `client/src/pages/superAdminPage/redesign/Audits.jsx`
- `client/src/pages/superAdminPage/redesign/ReportsPage.jsx`
- `client/src/pages/superAdminPage/redesign/reportPresentation.mjs`
- `client/src/utils/auditLogPresentation.mjs`
- `client/src/utils/chartScale.mjs`
- `client/src/utils/inventoryQuantity.mjs`
- `client/src/utils/printWalkInIntakeForm.js`
- `client/src/utils/superAdminReportPdf.mjs`
- `client/tests/browser/reportsWalkinInventory20261113.spec.mjs`
- `client/tests/reviewDisplays20261113.node.test.mjs`
- `client/tests/superAdminReportPdf20261112.node.test.mjs`
- `server/controllers/admin.controller.js`
- `server/controllers/billingCorrections.controller.js`
- `server/controllers/doctor.controller.js`
- `server/controllers/staff.controller.js`
- `server/db/migrations/2026-11-13-inventory-movement-balances.sql`
- `server/routers/branchAllInventory.js`
- `server/routers/branchInventoryItems.js`
- `server/routers/branchOperationalReads.js`
- `server/routers/branchQueueInventoryWrites.js`
- `server/routers/branchReports.js`
- `server/routers/branches.router.js`
- `server/routers/queue.router.js`
- `server/scripts/branchMigrations.js`
- `server/scripts/verifyBranchReportsSql.js`
- `server/scripts/verifyDeployment.js`
- `server/tests/branchIntegration/walkInAcceptanceLive.node.cjs`
- `server/tests/deployment/migrationRunner.node.cjs`
- `server/tests/helpers/inventoryActivityHarness.cjs`
- `server/tests/helpers/reportRouteHarness.cjs`
- `server/tests/helpers/reportSqlFixture.py`
- `server/tests/inventory/bulkExcelWorkflow.node.test.cjs`
- `server/tests/inventory/clinicExpiry.node.cjs`
- `server/tests/inventory/compactBarcodes.node.test.cjs`
- `server/tests/inventory/excelOpeningAndCategory.node.test.cjs`
- `server/tests/inventory/fix11BatchAndDoctorIdentity.node.test.cjs`
- `server/tests/inventory/movementBalances20261113.node.cjs`
- `server/tests/reports/reportData20261113.node.cjs`
- `server/tests/security/batch6GVisitReasonFallback.test.js`
- `server/tests/security/branchGatewayWrites20261015.node.cjs`
- `server/tests/security/queueDisplayAuth.test.js`
- `server/tests/security/superAdminInventoryExport.node.cjs`
- `server/tests/security/superAdminInventoryOverview.node.cjs`
- `server/tests/security/superAdminInventoryPricing.node.cjs`
- `server/utils/allInventoryOverview.js`
- `server/utils/branchDashboard.js`
- `server/utils/clinicalInventoryReservations.js`
- `server/utils/inventoryActivity.js`
- `server/utils/inventoryBatches.js`
- `server/utils/inventoryReportStock.js`
- `server/utils/manualInventoryMovement.js`
- `server/utils/reportMetrics.js`
- `server/utils/schema.js`
- `server/utils/superAdminReports.js`
- `server/utils/supplyTransfers.js`
- `server/utils/walkIn.js`
