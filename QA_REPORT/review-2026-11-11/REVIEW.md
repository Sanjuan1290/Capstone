# Carait Clinic — review of latest changes

Date: **11 November 2026 (Asia/Manila)**. Reviewed **7723e97..b93ff31**, covering the three new commits 130358d, 0a5d33d and b93ff31 and 86 changed client/server source/test files. The working tree was clean when review began. Application files remain unchanged; only this review evidence directory was added.

**Found three functional defects and one migration-test defect.** Builds succeeding does not establish that these workflows are correct. Review focused on billing/promotion calculations, checkout/refund state, stock-reservation interactions, registration quotas, doctor notifications and their route/permission/dependency chains. This is not a claim of complete manual line-by-line review or full-system UAT.

## 1. [P1] Keep the booked discount after its live promotion is deleted

Location: [server/utils/billingServicePromotions.js:40](../../server/utils/billingServicePromotions.js#L40).

The saved booking snapshot is used only when promotion_id is truthy. Deleting an offer is supported, and the existing FK sets appointment.promotion_id to NULL while leaving the saved selected service and discount snapshots. On later consultation finalization or draft save, this helper removes the booked discount and raises the patient total.

**Evidence:** Synthetic post-delete state: service 400, saved discount 100; before live ID is cleared the discount is 100, afterwards it is 0 and the bill becomes 400 instead of 300. No live row was deleted.

**Correction:** Treat a valid saved booking snapshot as authoritative independently of the optional live promotion FK. Apply current offer eligibility only to added-service selections. Add a booked-offer-deletion regression.

Validation: Reproduced with actual helper and in-memory query executor.

## 2. [P2] Interpret SMS quota timestamps in the database timezone

Location: [server/utils/registrationSmsLimits.js:31](../../server/utils/registrationSmsLimits.js#L31).

The connection returns DATETIME strings (dateStrings:true) and defaults to +08:00, but new Date(row.window_start/last_sent_at) parses a timezone-free string in the Node host timezone. On a UTC host, the stored timestamps appear eight hours in the future: cooldown is skipped and the hourly window becomes nine hours.

**Evidence:** In a UTC process with MySQL-style +08:00 strings, attempts at 0, 1 and 2 seconds were all allowed. Attempt 4 at 3 seconds returned retryAfterSeconds=32397 instead of enforcing the first 60-second pause. The current unit mock stores Date objects and misses this boundary.

**Correction:** Use a single explicit timezone/UTC representation or database-native time comparisons for the entire quota window. Test mysql2 dateStrings values on a UTC host.

Validation: Reproduced with actual quota code and synthetic dateStrings executor.

## 3. [P2] Give each confirmation event its own email idempotency key

Location: [server/utils/doctorConfirmationNotifications.js:61](../../server/utils/doctorConfirmationNotifications.js#L61).

Every confirmation for an appointment uses doctor-confirm-<id>. A patient can reschedule an already confirmed appointment back to pending; when the clinic confirms again, the changed date/time produces a new email payload with the old key.

**Evidence:** Captured two actual helper payloads for appointment 9 on different dates/times: both keys were doctor-confirm-9 and the HTML differed. No email was sent. Provider rejection is an inference from the documented API contract.

**Correction:** Key by a persisted confirmation-event/revision identifier, retaining the same key only for retries of that exact event.

Resend retains keys for 24 hours and rejects a different payload using the same key with HTTP 409. [Official Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys). No provider request was made in this review.

Validation: Key/payload collision reproduced locally; delivery behavior verified from official documentation.

## 4. [P2] Update migration-order expectations for the three appended migrations

Location: [server/tests/deployment/migrationRunner.node.cjs:141](../../server/tests/deployment/migrationRunner.node.cjs#L141).

The runner appends registration-sms-limits, billing-stock-reservations and doctor-confirmation-notifications, but the pinned-check test still asserts the old last five files. This makes the existing backend regression suite fail deterministically.

**Evidence:** The current checked-in migration SQL matches pinned SHA-256 checksums test now fails. The displayed diff is the expected migration tail, not a changed historical SQL hash.

**Correction:** Assert the updated complete registration order/tail while retaining historical hash and replay/type/history checks. Do not change old migration SQL or delete failing tests.

Validation: Observed in the fresh full backend Node run.

## Validation actually performed

| Check | Previous evidence | Current result |
| --- | --- | --- |
| Client build | PASS | PASS; required 25 prebuild assertions and Vite production bundle |
| Backend syntax/route checks | PASS | PASS; 375 modules and 239 handler references |
| Backend source graph | PASS | PASS; 632 files, 1464 imports resolved |
| Frontend lint | 0 errors; 23 warnings | 0 errors; 24 warnings |
| Backend Node | 675/702 pass; 27 fail | 697/730 pass; 33 fail |
| Frontend Node | 352/373 pass; 21 fail | 364/387 pass; 23 fail |
| Backend Vitest | 259/263 pass; 4 fail | 257/263 pass; 6 fail |
| Focused payment browser interactions | 12 selected cases | 12 pass; 0 fail; 0 skipped |
| Targeted boundary reproductions | Not previously covered | 3 defects reproduced using synthetic values and captured payloads |
| Conflict scan / whitespace | Previously clear | No conflict markers; git diff --check passes |

The backend defines no npm build script. Its deployment checks were run instead. Baseline figures are the saved conflict-repair evidence, not a fresh run of the old commit. No old tests were deleted or modified. The 12 browser cases cover Admin/Staff responsive cash/partial payments, QR locking/cancellation and stable retry keys; they do not establish live refund/email/provider delivery.

### Newly failing assertions

| Suite | Assertion |
| --- | --- |
| Backend Node | complete consultation with none reduction decision preserves promotion and actual consumption |
| Backend Node | complete consultation with approved reduction decision preserves promotion and actual consumption |
| Backend Node | complete consultation with rejected reduction decision preserves promotion and actual consumption |
| Backend Node | walk-in endpoints and service selection are connected across roles |
| Backend Node | current checked-in migration SQL matches pinned SHA-256 checksums |
| Backend Node | billing and all reschedule paths preserve selected promotional discount boundaries |
| Frontend Node | dark-mode components explicitly handle translucent and weekday surfaces |
| Frontend Node | backend snapshots discounts at booking and charges them once in consultation and staff checkout |
| Vitest | September 28 Batch 2 — inventory semantics, services setup, and prescription quantity tracks service consumables as generic whole units and adds their Selling Price to the Service Price |
| Vitest | September 30 consultation workflow UX allows patient-specific substitutions while keeping the booked service, branch inventory and completion lock |

There are six newly failing backend Node assertions, two frontend Node assertions and two Vitest assertions, in addition to the prior failures. The three consultation lifecycle failures observe a dropped saved promotion with no live promotion ID; their fixture state also models the supported post-delete state in finding 1. Several other new failures are source-string contracts affected by intentional changes: the light-only theme, wording changes, and extraction of promotion logic into a shared helper. The new Vitest failures expect the old text whole units and Supplies Actually Used. Refresh those contracts only after confirming the intended behavior, preserving meaningful financial and authorization assertions. The migration-tail mismatch is described in finding 4.

Full current and new-failure name inventories are in [review-results.json](review-results.json); the individual .log and JSON files contain actual command output. [Reproductions](reproductions.json) record observed/expected financial and quota values and the captured email key collision.

## Limits and deployment assessment

Do not treat this version as ready for production until the booked-discount, SMS-time and confirmation-key defects are corrected and retested. The three newly registered schema migrations remain a deployment prerequisite; none was applied by this review. Existing reversal SQL/history were not changed.

No production database query/write, live patient access, refund, SMS/email dispatch, migration or demo reset was performed. The reset script was inspected only. Test processes used synthetic settings and blocked external network access. Public Resend documentation was read to validate its idempotency contract.

This review did not repeat the full 39-case browser suite or the real-database native workflow. Unified stock-out with its feature flag enabled, live provider delivery and actual new-table deployment were not end-to-end verified. Those limits should remain visible even though the included unit tests pass.

## Changed-file inventory

| File changed by your commits | Added lines | Removed lines |
| --- | --- | --- |
| client/src/App.jsx | 2 | 3 |
| client/src/components/NotificationBell.jsx | 4 | 5 |
| client/src/components/accounts/StaffPermissionPicker.jsx | 19 | 7 |
| client/src/components/billing/BillCheckout.jsx | 64 | 45 |
| client/src/components/billing/BillHistoryDetail.jsx | 3 | 2 |
| client/src/components/billing/BillingPaymentRefundControl.jsx | 67 | 0 |
| client/src/components/billing/CheckoutServiceEditor.jsx | 32 | 0 |
| client/src/components/billing/CheckoutSupplyEditor.jsx | 5 | 5 |
| client/src/components/billing/DoctorChargeReductionPanel.jsx | 20 | 4 |
| client/src/components/billing/PaymentPreview.jsx | 6 | 6 |
| client/src/components/billing/SelectedPromotionNotice.jsx | 19 | 22 |
| client/src/components/layouts/AdminLayout.jsx | 19 | 10 |
| client/src/components/layouts/DoctorLayout.jsx | 2 | 9 |
| client/src/components/layouts/PatientLayout.jsx | 2 | 9 |
| client/src/components/layouts/StaffLayout.jsx | 23 | 12 |
| client/src/components/promotions/PromotionCards.jsx | 5 | 7 |
| client/src/components/schedule/ScheduleDayCard.jsx | 15 | 17 |
| client/src/components/services/PatientServices.jsx | 8 | 10 |
| client/src/components/system/InventoryExcelTools.jsx | 34 | 6 |
| client/src/config/staffPermissions.js | 2 | 3 |
| client/src/context/ThemeContext.jsx | 9 | 18 |
| client/src/hooks/usePolling.js | 27 | 45 |
| client/src/index.css | 1 | 38 |
| client/src/pages/adminPage/Admin_BillingServiceForm.jsx | 8 | 9 |
| client/src/pages/adminPage/Admin_CheckoutDetail.jsx | 109 | 53 |
| client/src/pages/displayPage/QueueDisplay.jsx | 4 | 3 |
| client/src/pages/doctorPage/Doctor_Appointments.jsx | 2 | 1 |
| client/src/pages/doctorPage/Doctor_Consultation.jsx | 109 | 28 |
| client/src/pages/doctorPage/Doctor_Dashboard.jsx | 3 | 3 |
| client/src/pages/patientPage/History.jsx | 3 | 17 |
| client/src/pages/patientPage/PatientDashboard.jsx | 13 | 13 |
| client/src/pages/shared/Inventory.jsx | 4 | 7 |
| client/src/pages/shared/PrivacyPolicys.jsx | 1 | 2 |
| client/src/pages/shared/SettingsPage.jsx | 2 | 3 |
| client/src/pages/staffPage/Staff_CheckoutDetail.jsx | 95 | 53 |
| client/src/pages/staffPage/Staff_WalkInQueue.jsx | 5 | 4 |
| client/src/pages/superAdminPage/BranchPortals.jsx | 1 | 5 |
| client/src/pages/superAdminPage/redesign/SystemSetup.jsx | 102 | 0 |
| client/src/services/admin.service.js | 2 | 7 |
| client/src/services/doctor.service.js | 1 | 5 |
| client/src/services/staff.service.js | 1 | 3 |
| client/src/utils/clinicLiveEvents.mjs | 1 | 0 |
| client/src/utils/consultationSupplyReason.mjs | 2 | 0 |
| client/src/utils/queueLabel.mjs | 9 | 0 |
| client/tailwind.config.js | 0 | 1 |
| client/tests/billingReplacement20261105.node.test.mjs | 2 | 2 |
| client/tests/doctorNotificationsLightMode20261111.node.test.mjs | 41 | 0 |
| client/tests/fix4Workflow20261111.node.test.mjs | 90 | 0 |
| client/tests/queueLabels20261111.node.test.mjs | 13 | 0 |
| server/controllers/admin.controller.js | 22 | 6 |
| server/controllers/billingCorrections.controller.js | 1 | 1 |
| server/controllers/doctor.controller.js | 34 | 13 |
| server/controllers/patient.controller.js | 6 | 14 |
| server/controllers/staff.controller.js | 44 | 21 |
| server/db/migrations/2026-11-11-billing-stock-reservations.sql | 24 | 0 |
| server/db/migrations/2026-11-11-doctor-confirmation-notifications.sql | 10 | 0 |
| server/db/migrations/2026-11-11-registration-sms-limits.sql | 9 | 0 |
| server/routers/admin.router.js | 6 | 4 |
| server/routers/branchClinicalStock.js | 40 | 0 |
| server/routers/branches.router.js | 1 | 5 |
| server/routers/doctor.router.js | 1 | 3 |
| server/routers/doctorNotificationSettings.js | 19 | 0 |
| server/routers/queue.router.js | 2 | 0 |
| server/routers/semaphoreBalance.js | 13 | 0 |
| server/routers/staff.router.js | 1 | 3 |
| server/scripts/branchMigrations.js | 3 | 7 |
| server/scripts/resetDemoData.js | 125 | 0 |
| server/tests/batch4/selectedPromotion.node.cjs | 5 | 3 |
| server/tests/billing/consultationBillingUx20261111.node.test.cjs | 51 | 0 |
| server/tests/billing/servicePromotions20261111.node.test.cjs | 54 | 0 |
| server/tests/clinicalReservations20261111.node.cjs | 36 | 0 |
| server/tests/demoReset20261111.node.cjs | 20 | 0 |
| server/tests/doctorConfirmNotifications20261111.node.cjs | 94 | 0 |
| server/tests/registrationSmsLimits20261111.node.cjs | 51 | 0 |
| server/tests/semaphoreBalance20261111.node.cjs | 36 | 0 |
| server/utils/appointmentPolicies.js | 1 | 1 |
| server/utils/billing.js | 13 | 10 |
| server/utils/billingPromotionEndpoints.js | 21 | 0 |
| server/utils/billingServicePromotions.js | 62 | 0 |
| server/utils/clinicalInventoryReservations.js | 127 | 0 |
| server/utils/doctorConfirmationNotifications.js | 89 | 0 |
| server/utils/emailService.js | 1 | 1 |
| server/utils/inventoryBatches.js | 70 | 1 |
| server/utils/registrationSmsLimits.js | 54 | 0 |
| server/utils/semaphoreBalance.js | 69 | 0 |
| server/utils/smsService.js | 5 | 2 |

Review artifacts contain synthetic test data/schema/code references only; original application files and earlier QA reports were retained.
