# Carait Clinic: nine-batch implementation and QA

Date: 14 November 2026, Asia/Manila. Starting repository: `6f937c6`.

**Tax Settings update:** the later user-requested two-field configuration supersedes Batch 4's expanded settings screen/storage. See [the updated report](../tax-settings-simplified-2026-11-14/RESULTS.md).

All nine batches are implemented in the working tree. No deployment, production SQL, real payment, SMS/email delivery or live Cloudinary upload was performed. Automated tests use synthetic records and mocked providers. Full regression runs use `network-guard.cjs`, a dummy loopback database and provider configuration. An untouched export of the starting commit was tested with the same guard for comparison.

## Batch 1 — Recommended Follow-Up During Consultation

- Added an optional recommendation editor containing only a calendar date and doctor's note. Add/remove, draft autosave and finalized-consultation updates are supported.
- Real dates, past new dates, note length/type and HTML/control characters are validated. Existing historical dates may retain note corrections.
- Parent consultation locks enforce doctor ownership and branch access. Version checks prevent stale finalized edits. Every change/removal preserves a revision and a redacted audit event.
- Recommendations create no appointment, queue, charge or notification. Existing consultation autosave/finalization behavior remains in place.
- Frontend: `RecommendedFollowupEditor.jsx`, `Doctor_Consultation.jsx`, `Doctor_ConsultationHistory.jsx`, `doctor.service.js`.
- Backend: `consultationFollowups.js`, `doctor.controller.js`, `doctor.router.js`.
- Migration: `2026-11-14-consultation-followups.sql`.
- Tests: 14 follow-up unit/permission tests, draft/finalized editor browser tests, history browser test. All pass in the final runs. An async navigation guard prevents a late recommendation response from replacing another consultation's state.
- Limitation: live MySQL/TiDB application and staging clinician acceptance testing remain outstanding.

## Batch 2 — Patient History and Optional Booking

- Patient History displays saved active recommendations, doctor's note and original appointment. Dashboard cards exclude past/booked recommendations and respect the selected branch.
- Book Appointment opens the existing booking flow. It may prefill a valid date; service, doctor, available slot, visit reason and booking-policy consent still require patient action.
- Cross-branch recommendation links select the requested active branch, including navigation within an already-open portal.
- Booking locks the patient's recommendation and records its link atomically with the new appointment. Another patient's recommendation and duplicate active links are rejected. Existing booking availability/profile rules remain authoritative.
- Frontend: `PatientFollowupRecommendations.jsx`, `PatientDashboard.jsx`, `History.jsx`, `BookAppointment.jsx`, `PatientBranchContext.jsx`, `patient.service.js`.
- Backend: `consultationFollowups.js`, `patient.controller.js`, `patient.router.js`; uses the Batch 1 migration's `appointment_followup_links` table.
- Tests: recommendation identifier/ownership/duplicate tests; dashboard/history filtering, cross-branch navigation and patient-initiated booking browser tests. Final results below.
- No new recommendation reminder, SMS or email workflow was added.

## Batch 3 — Service Doctor's Fee

- Service create/edit supports 0–100%, up to two decimal places, default 0%. The preview includes listed inventory prices.
- Admin/Super Admin may change the percentage. Staff operational edits preserve the existing percentage and cannot change it through the API.
- Each billed service records its original price, quantity and percentage. Confirmed calculations retain the computed allocation. A 20% fee on PHP 3,099 is PHP 619.80; the patient subtotal remains PHP 3,099.
- Clinic base share appears only in restricted financial reporting. No payroll/payout workflow was added.
- Frontend: `Admin_BillingServiceForm.jsx`, shared financial breakdown/report components.
- Backend: `billingMoney.js`, `doctorFeeAllocation.js`, `billing.js`, `branchCatalogWrites.js`, legacy `admin.controller.js` service handlers.
- Migration: `2026-11-14-billing-financial-snapshots.sql` adds `billing_service_catalog.doctor_fee_percentage DECIMAL(5,2) NOT NULL DEFAULT 0` and the snapshot table.
- Tests: five allocation/rounding tests; Admin/Super Admin create/edit and Staff preserve/deny tests; three-role form/preview browser tests; snapshot history preservation tests. Pass.

## Batch 4 — Tax and Discount Configuration

- Added branch System Setup → Tax & Discounts. Tax starts disabled with rate 0, including branches without a settings row.
- Authorized Admin/Super Admin can configure name/rate, inclusive/exclusive mode, service-fee/item/custom-charge classification, VAT exemption and statutory eligibility. Configuration is versioned, branch-validated, transactional and audited.
- Unclassified charges block billing when tax is enabled. No blanket 12% rate or blanket medical/medicine exemption is assumed.
- Existing discount presets/approval workflows remain. Categories distinguish Senior Citizen, PWD and other authorized presets. Statutory presets must be 20%, require eligibility verification and cannot stack with promotions. Verification is in person; an optional reference can be recorded. No new identity-image upload requirement was introduced.
- Each saved deduction records type/name, percentage or fixed amount, eligible amount, actual deduction and applicable approval/verification metadata.
- Frontend: `BillingTaxSettings.jsx`, `SystemSetupTabs.jsx`, `Admin_SystemSetup.jsx`, checkout eligibility controls, `admin.service.js`.
- Backend: `billingTaxPolicy.js`, `branchBillingSettings.js`, `branches.router.js`, `branchCatalogWrites.js`, central snapshot/calculation helpers.
- Migration: `2026-11-14-branch-tax-policy.sql`.
- Tests: five policy tests, six configuration/authorization tests, inclusive/exclusive/exempt/mixed-eligibility/statutory calculation tests and three-role configuration browser tests. Pass. Malformed rule objects and canonically duplicate IDs are rejected as validation errors.
- Deployment requirement: configure the branch's actual registration and accountant-approved classifications before enabling tax. Classification is explicit; the software does not determine legal eligibility from an item's name.

Philippine primary references consulted for these distinctions: [RA 10963](https://lawphil.net/statutes/repacts/ra2017/ra_10963_2017.html), [BIR RMC 6-2003](https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/10/40179), [BIR RR 7-2010](https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/10/55830), [PWD RR 5-2017](https://ncda.gov.ph/disability-laws/implementing-rules-and-regulations-irr/revenue-regulations-no-5-2017-rules-and-regulations-implementing-republic-act-no-10754/), and [BIR RR 4-2021](https://bir-cdn.bir.gov.ph/local/pdf/RR%20No.%204-2021_copy.pdf). These support separate treatment for medical/professional services, qualifying statutory purchases and specifically listed exempt medicines.

## Batch 5 — Central Billing Calculation

- Added one authoritative backend calculation with integer-based decimal rounding, service/included-item components, additional charges, included doctor allocations, separately allocated discounts, VAT relief and inclusive/exclusive tax.
- Included item amounts are split out of the service subtotal rather than added again. Multiple services and independent fee rates reconcile to the final patient total. Duplicate saved charge rows/included entries and deductions are rejected.
- New bills freeze their tax policy at creation. Saving a draft calculates and persists the breakdown in the same transaction as its charges. Confirmation verifies the saved calculation and locks it.
- Authorized unpaid reopen/correction retains the bill's policy while allowing a new reviewed calculation. Existing paid/confirmed history is not repriced. Legacy bills retain disabled-tax treatment; existing charge reversals do not silently create/reprice legacy snapshots.
- Frontend consumes saved values; a dirty review preview asks the operator to save before relying on final tax/discount totals.
- Backend: `billingCalculation.js`, `billingFinancialSnapshot.js`, `billingMoney.js`, `billing.js`, `billingServicePromotions.js`, `staff.controller.js`, `chargeAdjustments.js`, `billingCorrections.controller.js`.
- Migration: shared Batch 3 snapshot migration. No historical billing backfill or financial-data migration.
- Tests: 13 calculator tests, five snapshot tests, existing pricing/charge-reversal regressions and browser cross-view comparisons. Pass in focused runs.
- Existing confirmed bills without snapshots retain their legacy display; missing historical fee/tax details are not invented.

## Batch 6 — Complete Bill and Payment Summary

- Shared saved breakdown shows branch/bill/doctor/date/status, each service fee and included/additional item, quantity/unit price, original allocation, separate discounts, tax treatment and final patient bill.
- Admin/Super Admin and Staff checkout use the saved calculation. Staff's independent payment handler was updated so partial selection actually submits the selected amount, including its idempotency signature and confirmation dialog.
- Full balance remains the default. Optional partial payments retain method/reference/tender/change/history. Disabled methods remain unavailable; an existing active QR still blocks conflicting collection until resolved.
- Frontend: `FinancialBillBreakdown.jsx`, `CheckoutPaymentSection.jsx`, both `Admin_CheckoutDetail.jsx` and `Staff_CheckoutDetail.jsx`, `paymentPreview.mjs`.
- Backend: existing authorized payment handlers plus decimal-precision validation in `billingSecurity.js`.
- New migration: none beyond the snapshot migration.
- Tests: partial-payment unit tests, three-role partial cash submission/confirmation, disabled QR controls and existing QR lifecycle browser tests. Pass.

## Batch 7 — Receipts, Billing History and Financial Reports

- Receipt, Admin/Staff history, patient bill details, correction/refund tools and checkout render saved financial calculations.
- Multiple-payment receipts identify the current transaction, earlier payments and balance at that transaction. Cash shows received/change; electronic payments show amount/reference without cash change. Settled receipt/history views continue to omit an unnecessary zero balance; partial receipts show the remaining amount.
- Added restricted confirmed-bill allocation reporting for Admin/Super Admin with dates/branch selection and Print/Save PDF. It uses saved snapshots, excludes voided bills and explicitly counts legacy bills without allocations. It is an original-subtotal allocation report, not net payout/payroll reporting.
- Frontend: `BillHistoryDetail.jsx`, `BillHistory.jsx`, `BillFinancialTools.jsx`, patient `History.jsx`, `FinancialAllocationReport.jsx`, `Admin_Reports.jsx`, Super Admin `ReportsPage.jsx`, `billingReceiptTemplate.mjs`, `receiptPaymentTimeline.mjs`.
- Backend: `patientBillingHistory.js`, `financialAllocationReport.js`, branch/global report endpoints; existing patient ownership and refund/void permissions retained.
- New migration: none beyond the snapshot migration.
- Tests: report date/branch/legacy filtering, receipt/timeline tests, three-role two-payment history/receipts, patient financial sanitization, report role/PDF browser tests and legacy A5 receipt regressions. Actual counts below.
- Limitation: legacy allocations cannot be reconstructed reliably and are intentionally excluded. Live refund/payment-provider settlement was not exercised.

## Batch 8 — Perception Point Removal

- Removed active integration calls, moderation parameters, status/polling endpoints, waiting/approval states and scanner bypass workflows. Deleted `cloudinaryScan.js` and retired scanner rate limiting/exports.
- Cloudinary remains. Uploads use a single validated request and server-signed authorization scoped to role, user, branch, record/context, asset and URL. New protected image URLs cannot be attached by merely supplying an approved flag.
- Preserved PNG/JPG signature checks, provider/response validation, 30-second provider timeout, 10 MB clinical limit and 5 MB other-image limit. Clinical ownership is checked before upload. Existing URLs and historical scan fields/audit records remain intact.
- Existing in-person discount verification remains; dormant proof helpers are validated, but previously disabled proof-upload routes were not enabled.
- Frontend: `imageUpload.js`, portal/Admin/proof upload services, doctor clinical images, announcements/promotions, `DiscountProofField.jsx`.
- Backend: `cloudinarySecurity.js`, upload controllers, `consultationImages.js`, branch announcement/promotion/payment writers, upload routes and rate limiter.
- Database migration: none. Historical scanner columns/immutable SQL history are retained safely; no image or record deletion.
- Tests: 12 focused Cloudinary/token/security tests, three client upload tests, browser success/failure/token attachment without polling, historical-image authorization tests. Inventory barcode code/dependencies are untouched and existing inventory/scan regressions were run.
- Limitation: provider calls were mocked; staging upload acceptance with the configured Cloudinary account is still required. Retired `PERCEPTION_POINT_*` deployment variables may be removed; retain Cloudinary and JWT server credentials.

## Batch 9 — Full System Testing

Final command results and all remaining regression failures are recorded in `TEST_RESULTS.md`, `REGRESSION_FAILURES.md`, the logs and JSON evidence in this directory. Intermediate failing browser attempts were corrected; only final runs should be used as the acceptance result.

Source checks, frontend production build/prebuild tests, ESLint, isolated backend/frontend unit/integration tests, guarded migration simulations and headless Edge browser checks were performed. Browser tests mock `/api/**`; backend tests stub database/provider boundaries. These are not live TiDB, physical scanner, mobile-device or production payment tests.

Full existing suites are not entirely green. Their failures were reproduced against the starting commit with the same isolated harness; new failures introduced by this implementation were fixed. The failure report distinguishes these results rather than claiming that all existing tests pass.

## Database migration and deployment instructions

1. Review the three new SQL files and the guarded migration runner. Back up the target database and validate on a staging copy first. Do not edit/delete existing migration ledger rows or rerun manual ALTER statements blindly.
2. Point the server's normal environment at staging. From `server`, run `npm.cmd run migrate`, then `npm.cmd run verify:deploy`. The normal migrator also checks the existing application schema; it is a mutation command and was deliberately not run against the user's configured database during this task.
3. The runner registers the three files after existing history, verifies the fee column's exact decimal/null/default metadata, skips a compatible existing column, rejects an incompatible one and safely resumes after interrupted DDL. No confirmed-bill totals are updated by the new migrations.
4. Run these read-only checks in the selected staging database:

```sql
SELECT DATABASE() AS selected_database;
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND ((TABLE_NAME = 'billing_service_catalog' AND COLUMN_NAME = 'doctor_fee_percentage')
       OR TABLE_NAME IN ('consultation_followups','consultation_followup_revisions',
                         'appointment_followup_links','billing_financial_snapshots',
                         'branch_billing_settings'))
ORDER BY TABLE_NAME, ORDINAL_POSITION;

SELECT filename, content_sha256, applied_at
FROM schema_migrations
WHERE filename LIKE '2026-11-14-%'
ORDER BY applied_at, filename;

SELECT branch_id, JSON_EXTRACT(policy_json, '$.enabled') AS tax_enabled, version
FROM branch_billing_settings;
```

5. Expect all five new tables, the compatible fee column and three migration ledger entries. No settings row is required initially: absence means disabled tax. Enable tax only after explicit classifications and statutory eligibility are reviewed for that branch.
6. Complete staging smoke tests for a new consultation/follow-up booking, service fee edits, a mixed tax/discount bill, two partial payments, cash/electronic receipts, authorized refund/reopen, and real Cloudinary uploads. Compare an existing confirmed bill before/after release; it must remain unchanged.
7. Build/deploy matching server and client versions only after migrations and staging acceptance. This task did not deploy or approve a production migration. Existing full-suite failures and unperformed live checks remain release considerations.

## Changed-file inventory

`CHANGED_FILES.md` lists every implementation, migration and test file added/modified/removed by this task, excluding generated baseline copies and previous QA artifacts. New source modules are included even though they are untracked until committed.
