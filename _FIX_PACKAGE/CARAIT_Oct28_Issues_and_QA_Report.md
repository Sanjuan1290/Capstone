# CARAIT Clinic — October 28 issue review and safe fixes

**Sources reviewed:** `errors.pdf` (4 pages), `AllCodes(20261028-101939).txt`, and `carait_clinic_full_backup_2026_28.sql`.

**Scope:** local offline review. No live database connection, migrations, PayMongo calls, authenticated browser sessions, or deployment.

## 1. Confirmed: Admin/Superadmin branch inventory endpoint omits batches (HIGH)

`client/src/pages/shared/Inventory.jsx` expects `item.batches[].locations` for Stock Out and Move Stock and `item.batches` for Manage Batches. However, `server/routers/branches.router.js` `originalInventory` returned only `SELECT * FROM inventory`, without enriching batch data. Both `/api/branches/my/legacy/inventory` and `/api/branches/workspace/:branchId/legacy/inventory` use this endpoint; these are the routes selected by the Admin service in branch portals. The standalone Staff controller already enriches batches.

The backup contains inventory batch and location-allocation rows. The example with 19 units is backed by two non-archived batches (9 and 10 units), with separate allocations; its displayed empty batch picker can therefore be explained by the Admin branch endpoint's response shape, not absence of underlying batches.

**Local change:** `originalInventory` now retains `branch_id=?`, excludes archived items, and calls existing `attachBatchesToInventory(rows, db)` before responding. It makes no inventory writes or allocation repairs. Added branch-focused regression tests.

**Caveat:** The fix needs authenticated browser/API verification in the affected branch account; staff and Superadmin inventory operations must be checked independently.

## 2. Confirmed: Staff promotions intentionally hidden (MEDIUM; NOT MODIFIED)

`SystemSetupTabs.jsx` filters out Promotions on `/staff`, and `Admin_SystemSetup.jsx` also excludes this tab. `server/routers/staff.router.js` does not expose matching `/admin-access/promotions` routes, while Admin promotion management has different access controls. Simply unhiding the tab would introduce 404/403 errors and could elevate permissions. Clarify whether `system_setup` should grant viewing or managing promotions; then implement corresponding branch-scoped backend permissions and UI tests.

## 3. High risk: QR-to-cash switching must first clear provider payment lock (HIGH)

`QrPhPaymentPanel.jsx` already supports verified PayMongo cancellation; LIVE cancellation is disabled by default using `PAYMONGO_QR_CANCEL_ENABLED` and `PAYMONGO_QR_CANCEL_LIVE_ENABLED`. A still-payable or indeterminate QR cannot safely be overridden by a manual Cash payment.

**Local change:** The panel now uses the server's `can_collect_alternate` signal as well as local pending status to keep cash collection disabled while an active bill lock remains. The cancellation action is labelled 'Cancel QR to switch to cash' when provider cancellation is available, and the panel explains administrator reconciliation when it is not. No lock-release API or feature flags were changed; no automatic cancellation was introduced.

**Not yet implemented:** A fully seamless 'Switch to Cash' action for LIVE mode. That needs a verified provider cancellation/reconciliation procedure and a PayMongo TEST + isolated TiDB acceptance test before enabling in live mode.

## 4. Finalized clinical record fails to load (HIGH; DIAGNOSIS INCOMPLETE)

PDF page 2 shows the read-only viewer's generic error from `Doctor_Appointments.jsx`. It requests `GET /api/doctor/consultations/:appointmentId`. Backend `doctor.controller.js:getConsultation` enforces doctor and branch ownership, then loads images, amendments, and billing. Any 404, authentication issue, broken dependent query, or transient DB error is obscured by the generic message. Inspect the failing request's HTTP status, `request_id`, server SQL error code, and the appointment's doctor/branch/consultation relationship before making a clinical-data fix. Do not bypass ownership guards or fabricate consultations.

## 5. Patient branch selection across portal (FEATURE REQUEST; NOT MODIFIED)

`DoctorAvailability.jsx` and `BookAppointment.jsx` already have separate local branch selectors and branch-filtered calls, but the selection is not a single persistent patient-portal context after login. Implement a shared validated branch selection (prefer a branch context/store, not sensitive local credentials), reload branch-scoped doctors/schedules/services/promotions and invalidate stale requests on change, and do not alter existing appointment histories across branches.

## 6. Header alignment (UI ISSUE; NOT MODIFIED)

The PDF page 1 screenshot shows misaligned notification/theme/settings controls. The screenshot is not enough to establish a single CSS root cause. Test responsive breakpoints and fixed-width vs flex-wrap alignment in the actual browser before modifying layout components.

## 7. Consultation schema warning (SCREENSHOT; ACTIVE ERROR UNVERIFIED)

The latest exported backup contains the Batch 4 promotion fields, index, and foreign key. A screenshot warning about an outdated schema could reflect an earlier deployment, another missing field, or a different connected database. `schema_migrations` in the export still lists only five earlier migrations (the manually applied promotion changes are not recorded). Do not rerun the ALTER TABLEs; verify active environment and migration history first.

## Validation actually run

- Client Node regression: **103/103 passed**.
- New inventory test: **2/2 passed**.
- New QR safety test: **2/2 passed**.
- Server Node suite: **312/317 passed**; 5 fail in isolated reconstructed export: 4 dependency-related failures (`mysql2/promise` twice, `express`, `jsonwebtoken`), 1 historical SQL checksum mismatch due to exported source-format line endings. These should be retested against the original Git repository with `npm ci`; do not rewrite historical migration files to accommodate this reconstruction.
- Source graph: **453 source files / 1,103 imports resolved**, before test-only files were added.
- Git patch `git apply --check`: **passed** against reconstructed, untouched October 28 source files.

## Recommended release sequence

1. Apply the small patch to the exact matching Oct 28 source checkout; no database migration is needed for these two source changes.
2. On staging, open branch Admin/Superadmin inventory and verify both batches, location breakdown, stock out, move stock, and Manage Batches. Use disposable test inventory; avoid production stock movement.
3. Test QR-to-cash only with PayMongo TEST, including pending, failed, expired-but-locked, cancelled, paid-before-cancel, and timeout states; verify no duplicate payment.
4. Obtain exact server request errors for finalized-record load and autosave, then fix the confirmed failure without bypassing clinical access controls.
5. Decide Staff promotion permissions and patient branch-selection UX; implement separately with tests.

**Production: NOT VERIFIED / NO-GO for changes without staging.**
