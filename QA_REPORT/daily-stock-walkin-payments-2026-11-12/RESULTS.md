# Daily stock reminders, required walk-in birthdate and balance collection

Date: 2026-11-12, Asia/Manila. Baseline commit: `4f5b782`.

## Implemented behavior

### Payment collection

- Removed the editable **Payment Amount** field from the shared checkout payment section.
- Admin, Staff and Super Admin checkout collect the saved **Amount Due / remaining balance**. Preview, confirmation, idempotency signature and submitted amount use that same balance.
- **Cash Received** remains separate and calculates change. Insufficient or malformed cash amounts block collection. Non-cash reference checks, QR locks, payment confirmation, receipt access and lost-response retry protection remain.
- Previous payments remain part of the saved bill. For example, a bill of PHP 405 with PHP 100 previously paid collects PHP 305; receiving PHP 500 gives PHP 195 change.

### Walk-in birthdate

- Removed the age fallback field and its form state. **Birthdate** is required in the staff-assisted New Appointment intake and Staff walk-in queue intake.
- Yesterday is the latest selectable date, using the **Philippine calendar**. Today and future dates are rejected by both client and server. Invalid calendar dates and age-only requests are rejected.
- The user explicitly confirmed that walk-ins can be any age. The walk-in-specific validator accepts children, a patient born yesterday and older adults, without the portal's age limits. Its earliest date is `1000-01-01`, within the database DATE range.
- Patient/guest portal birthdate validation retains its existing adult policy. Existing patient birthdates and historical reported-age values were not rewritten; newly created walk-in records save the birthdate with a NULL reported age.

### Daily stock reminders

- A background worker scans **active branches** on startup and every **five minutes**.
- When a branch has low stock, out-of-stock items, items expiring within 30 days or expired stocked items, it creates one daily in-app summary per eligible account and branch.
- Low/out counts use available whole-unit quantities. Expiry checks examine every available stocked batch; archived, depleted, unavailable and invalid-dated batches do not inflate the counts. An older expired batch cannot hide another expiring batch.
- Eligible recipients are active Super Admins, that branch's Admins with inventory permission, and active Staff with inventory permission. Patients and Doctors are not recipients.
- The day resets at **midnight in the Philippines**. A transactional delivery ledger with a composite primary key prevents duplicates on repeated scans, parallel workers and server restarts. Failed notification creation rolls back its reservation for retry.
- Healthy branches create no notice. A branch becoming low/out of stock later that day can still receive its first notice.
- Clicking a notice checks ownership, branch and current inventory permission before opening the appropriate branch Inventory page.
- Personal Super Admin SSE delivery is supported. The notification bell also refreshes every minute while the page is active, so notices appear without navigating away.
- This worker sends in-app notices only. It reads inventory and writes only notifications and its own delivery ledger.

## Deployment step required

Apply [2026-11-12-daily-stock-alerts.sql](../../server/db/migrations/2026-11-12-daily-stock-alerts.sql) to the **same TiDB schema configured by Render**, then redeploy the backend and frontend.

The migration creates only `inventory_daily_alert_deliveries` with `CREATE TABLE IF NOT EXISTS`. It is registered with the existing migration runner and startup schema initializer, and included in deployment verification. No existing ALTER statements were added or repeated, and no migration-history entries were removed. The worker checks for its ledger at startup and logs that the migration is required if it is absent.

**No live migration, commit, push or deployment was performed.** Production inventory, payments and existing financial records were not modified by this work.

## Actual verification

| Check | Result |
| --- | --- |
| New stock, walk-in controller, notification ownership and session/SSE tests | **20 passed, 0 failed** |
| Existing migration, guest booking, checkout reopening, walk-in branch safety and Staff isolation regressions | **50 passed, 0 failed** |
| Frontend date, payment preview and staff-assisted appointment tests | **22 passed, 3 existing source-contract failures** |
| Production-build browser checks | **19 passed, 0 failed** |
| Frontend build | PASS, including **25/25** prebuild checks; existing bundle-size warning remains |
| Targeted ESLint | Zero errors; three existing Hook dependency/ref warnings in `AppointmentCreatePage.jsx` |
| Backend syntax | PASS: **411** JavaScript modules, Staff route binding checks and charge-reduction route smoke check |
| Backend source graph | PASS: **680** source files and **1,566** relative imports |
| Conflict-marker scan and `git diff --check` | PASS |

The migration tests verify additive creation, recovery after a failed CREATE, unchanged historical checksums, clean reruns and no duplicate reversal-column ALTERs. Their fixture was corrected to distinguish existing promotion-eligibility metadata from older Batch 4 metadata; historical SQL files were not edited.

The browser tests cover:

- Required past birthdate and no Age field for Admin, Staff and Super Admin; yesterday accepted, today/future blocked.
- Amount Due collection, cash change, prior paid amounts and receipt access at desktop, tablet and mobile widths.
- QR payment locking and switching back to Cash without recording a payment automatically.
- Reusing the same payment intent after a lost response, without collecting twice.
- A daily stock summary appearing through notification polling and opening the correct branch inventory.

Browser/API tests use isolated synthetic fixtures, including the real stock worker, destination resolver and walk-in controller validation where applicable. No live TiDB queries, SMS or email deliveries were used.

## Remaining existing failures

Three assertions in `client/tests/batch5VisualAndPaymentPreview.node.test.mjs` still fail:

1. Dark-mode source checks expect `bg-sky-50/60 dark:bg-sky-950/50` in the notification bell.
2. Doctor Availability source checks expect a literal Monday-to-Sunday `WEEKDAY_ORDER` declaration.
3. Featured offer source checks expect the earlier `promotion_id` URL interpolation in `PromotionCards.jsx`.

These concern existing source contracts outside the requested payment, birthdate and stock-reminder behavior. They were not removed or weakened. A full repository-wide test-suite pass is not claimed.

## Changed application files

Payment:

- `client/src/components/billing/CheckoutPaymentSection.jsx`
- `client/src/components/billing/BillCheckout.jsx`
- `client/src/pages/adminPage/Admin_CheckoutDetail.jsx`
- `client/src/pages/staffPage/Staff_CheckoutDetail.jsx`
- `client/src/utils/paymentPreview.mjs`

Walk-in intake:

- `client/src/pages/shared/AppointmentCreatePage.jsx`
- `client/src/pages/staffPage/Staff_WalkInQueue.jsx`
- `client/src/utils/patientBirthdate.mjs`
- `server/controllers/admin.controller.js`
- `server/controllers/staff.controller.js`
- `server/utils/patientProfile.js`

Notifications and migration:

- `client/src/components/NotificationBell.jsx`
- `server/utils/dailyStockAlerts.js` (new)
- `server/utils/notificationDestination.js`
- `server/utils/sse.js`
- `server/server.js`
- `server/utils/schema.js`
- `server/scripts/branchMigrations.js`
- `server/scripts/verifyDeployment.js`
- `server/db/migrations/2026-11-12-daily-stock-alerts.sql` (new)

Tests and QA support:

- New `server/tests/dailyStockAlerts20261112.node.cjs`, `server/tests/walkInBirthdate20261112.node.cjs` and their two harnesses in `server/tests/helpers/`.
- Updated `server/tests/deployment/migrationRunner.node.cjs`.
- New `client/tests/walkInAndBalancePayment20261112.node.test.mjs` and `client/tests/browser/dailyStockWalkInPayments20261112.spec.mjs`.
- Updated `client/tests/appointmentDedicatedPage.node.test.mjs`, `client/tests/batch5VisualAndPaymentPreview.node.test.mjs`, `client/tests/batch6PatientBirthdate.node.test.mjs`, `client/tests/browser/implementation20261111.spec.mjs` and the affected lost-response case in `client/tests/browser/billing.spec.mjs`.
- This QA folder's runner, browser configuration, report and synthetic screenshots. Logs and browser artifacts are ignored.

## Screenshots

- [Required birthdate, Super Admin](walk-in-superadmin.png)
- [Required birthdate, Admin](walk-in-admin.png)
- [Required birthdate, Staff/mobile](walk-in-staff.png)
- [Collection, desktop](payment-1440.png)
- [Collection, mobile](payment-390.png)
- [Daily stock notification](daily-stock-notification.png)

## Reproduction

From the repository root:

```powershell
node --test server/tests/dailyStockAlerts20261112.node.cjs server/tests/walkInBirthdate20261112.node.cjs server/tests/branching/sessionsAndNotifications.node.cjs
node --test server/tests/guestBooking20261112.node.cjs server/tests/deployment/migrationRunner.node.cjs server/tests/checkouts/reopen-editing.node.cjs server/tests/branchIntegration/walkInBranchSafety.node.cjs server/tests/branchIntegration/staffRouteIsolation.node.cjs
node --test client/tests/walkInAndBalancePayment20261112.node.test.mjs client/tests/batch5VisualAndPaymentPreview.node.test.mjs client/tests/batch6PatientBirthdate.node.test.mjs client/tests/appointmentDedicatedPage.node.test.mjs
node QA_REPORT/daily-stock-walkin-payments-2026-11-12/run-browser.cjs
```

Build the frontend first with `npm.cmd run build` in `client`. Run `npm.cmd run check:syntax` and `npm.cmd run verify:source` in `server`. Browser tests require an installed supported browser; this run used headless Edge.
