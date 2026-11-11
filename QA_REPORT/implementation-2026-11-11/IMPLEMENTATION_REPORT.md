# Carait Clinic — implementation and verification report

Date: **11 November 2026 (Asia/Manila)**. Baseline: clean commit **b192e96** exported to an isolated temporary source tree before comparison. Changes remain uncommitted. No deployment or production application-data mutation occurred.

## 1. Implementation summary

All five PDF changes were implemented in the active repository. The pasted user request is the implementation authority; the five PDF pages supplied visual evidence. PDF captions asking for a plan were not treated as a limit on implementation.

1. **Approved charge reductions can be reversed.** Admin/Super Admin only, within the authorized physical branch, while the bill is draft/pending and has no payment history. A required-reason confirmation shows original charge, approved reduction, current and resulting bill totals. Bill/adjustment locks and a conditional status update prevent double reversal. The original approval, requester and reason stay intact; reversal actor/time/reason are additional fields. Pending charge/legacy request versions are rebased. An audited financial explanation and old/new monetary values are recorded. Clinical data, inventory, promotions, unrelated discounts and completed payments are untouched.
2. **Payment details and summary share one component.** Admin, Staff and the shared checkout use the same layout/centavo-safe estimate. Desktop separates entry and summary; smaller screens stack details before summary. Existing methods, QR lifecycle, references, confirmation, receipts, permission checks and API handlers are preserved. The active Admin/Staff pages also now reuse a payment intent after a lost response and prevent immediate duplicate submissions; previously they generated a new key per retry.
3. **Prescriptions use one reader in both views.** Only supplied medicine/dosage/quantity/frequency/duration/notes are displayed. Legacy text retains line breaks. Malformed or unrecognized JSON produces a readable fallback instead of raw JSON or an object error. No medical content was rewritten or migrated. Patient ownership/record authorization is unchanged.
4. **Normal receipts fit one A5 page.** Print-only margins/spacing and metadata labels were compacted without removing receipt data or clipping overflow. Excess items naturally continue on later pages. The ordinary screen design and saved-ledger calculation source are retained.
5. **The landing editor has room to work.** Contact Information, Google Maps and CTA are vertical groups. Navigation wraps, the editor is wider, and preview is a separate panel on large screens with a separate mobile control. Mobile/desktop previews use an independent viewport, reflect draft changes and can expand. Existing save/publish/history/restore, uploads, ordering, visibility and unsaved-change handlers are preserved; mutation guards and field labels were added.

## 2. Files changed

| Change | File | Purpose |
| --- | --- | --- |
| Modified | [client/src/components/billing/BillCheckout.jsx](../../client/src/components/billing/BillCheckout.jsx) | Use shared payment presentation while retaining the existing service adapter and handlers. |
| Modified | [client/src/components/billing/ChargeAdjustmentsPanel.jsx](../../client/src/components/billing/ChargeAdjustmentsPanel.jsx) | Authorized reversal action, required-reason confirmation, totals preview, duplicate-submit guard and reversal history. |
| Modified | [client/src/components/patients/PatientRecordsPage.jsx](../../client/src/components/patients/PatientRecordsPage.jsx) | Display prescription through the shared reader; keep existing record permissions. |
| Modified | [client/src/pages/adminPage/Admin_CheckoutDetail.jsx](../../client/src/pages/adminPage/Admin_CheckoutDetail.jsx) | Adopt shared payment layout and stable retry key / immediate in-flight guard. |
| Modified | [client/src/pages/adminPage/Admin_LandingPage.jsx](../../client/src/pages/adminPage/Admin_LandingPage.jsx) | Wide editor, vertical Contact/Map/CTA groups, responsive preview controls, labels, Escape/focus behavior and mutation guards. |
| Modified | [client/src/pages/patientPage/History.jsx](../../client/src/pages/patientPage/History.jsx) | Reuse the same prescription formatter, including explicit missing/none statuses. |
| Modified | [client/src/pages/staffPage/Staff_CheckoutDetail.jsx](../../client/src/pages/staffPage/Staff_CheckoutDetail.jsx) | Same presentation and retry protection with Staff services and permissions. |
| Modified | [client/src/utils/billingReceiptTemplate.mjs](../../client/src/utils/billingReceiptTemplate.mjs) | Print-only compact A5 spacing and metadata layout; preserve content and natural multi-page overflow. |
| Modified | [client/tests/batch5VisualAndPaymentPreview.node.test.mjs](../../client/tests/batch5VisualAndPaymentPreview.node.test.mjs) | Follow payment preview into shared component and check actual Admin/Staff surfaces; retain math and isolation assertions. |
| Modified | [client/tests/billingReplacement20261105.node.test.mjs](../../client/tests/billingReplacement20261105.node.test.mjs) | Follow fourth checkout section into shared UI while preserving approval and workflow assertions. |
| Modified | [client/tests/billingSimplifiedWorkflow.node.test.mjs](../../client/tests/billingSimplifiedWorkflow.node.test.mjs) | Follow clear/QR tender controls into shared UI; retain parent QR callback and explicit payment-submission checks. |
| Modified | [server/controllers/patient.controller.js](../../server/controllers/patient.controller.js) | Expose existing prescription_status in the patient-owned history query. |
| Modified | [server/routers/branchChargeAdjustments.js](../../server/routers/branchChargeAdjustments.js) | Transaction-wrapped, permission/branch-scoped reversal POST routes. |
| Modified | [server/scripts/branchMigrations.js](../../server/scripts/branchMigrations.js) | Register additive reversal fields and guard compatible existing columns on replay. |
| Modified | [server/tests/deployment/migrationRunner.node.cjs](../../server/tests/deployment/migrationRunner.node.cjs) | Add new migration to expected tail; retain historical checksums, replay and failure assertions. |
| Modified | [server/tests/security/billingCheckoutFollowup20260930.test.js](../../server/tests/security/billingCheckoutFollowup20260930.test.js) | Check actual portal wrappers and shared reference input; retain image-proof and upload-route assertions. |
| Modified | [server/utils/chargeAdjustments.js](../../server/utils/chargeAdjustments.js) | Lock bill then adjustment, reject invalid/paid/confirmed/repeated reversals, preserve other discounts/history, rebase pending versions and audit. |
| Added | [client/src/components/billing/CheckoutPaymentSection.jsx](../../client/src/components/billing/CheckoutPaymentSection.jsx) | One responsive payment details/summary layout; reuse centavo-safe preview, configured methods and existing QR slot. |
| Added | [client/src/components/patients/PrescriptionDetails.jsx](../../client/src/components/patients/PrescriptionDetails.jsx) | Render only supplied medicine fields, readable legacy text and safe empty/error states. |
| Added | [client/src/components/system/LandingDraftPreview.jsx](../../client/src/components/system/LandingDraftPreview.jsx) | Render draft in a separate responsive viewport with existing public page components. |
| Added | [client/src/utils/prescriptionDisplay.mjs](../../client/src/utils/prescriptionDisplay.mjs) | Safe parsing of JSON arrays, objects/wrappers, incomplete fields and legacy free text without guessing medical details. |
| Added | [client/tests/browser/helpers/clinic20261111.mjs](../../client/tests/browser/helpers/clinic20261111.mjs) | Reusable synthetic browser fixture extracted from the existing fixture, with no real patients/providers. |
| Added | [client/tests/browser/implementation20261111.spec.mjs](../../client/tests/browser/implementation20261111.spec.mjs) | 12 payment layout, precision, QR-lock/cancel, retry and receipt interaction regressions. |
| Added | [client/tests/prescriptionDisplay20261111.node.test.mjs](../../client/tests/prescriptionDisplay20261111.node.test.mjs) | Structured, multiple, incomplete, legacy and malformed prescription tests. |
| Added | [server/db/migrations/2026-11-11-charge-reduction-reversal.sql](../../server/db/migrations/2026-11-11-charge-reduction-reversal.sql) | Three nullable reversal metadata columns; no destructive or clinical/inventory DML. |
| Added | [server/tests/billing/chargeReversal20261111.node.test.cjs](../../server/tests/billing/chargeReversal20261111.node.test.cjs) | 15 targeted financial/authorization/validation/preservation tests. |

No source files were deleted. No package/lockfile or application dependency was changed. QA tools, command logs, JSON results and the isolated-schema metadata are under this directory. PyMuPDF was installed only into ignored .tools for PDF inspection, outside project dependencies. Generated screenshots/PDFs and the temporary baseline tree are ignored.

Every added QA script, report, log and result file is listed with its purpose in [EVIDENCE_MANIFEST.md](EVIDENCE_MANIFEST.md).

Source/reference comparison: fix (3).pdf was read and all five pages inspected. The subsequently supplied AllCodes.txt has now been compared with baseline b192e96 and the worktree: all 772 scoped application text files match baseline, with 17 existing files changed by this implementation and 9 additions. There are no unexplained reference differences or missing current files. The supplied 2026-08-26-clinic-workflow-upgrade.sql matches both export and baseline and was inspected against the existing metadata snapshot. It is a historical migration, not the named carait_clinic_full_backup_2026_11.sql backup; no comparison with that unavailable full backup is claimed. See [REFERENCE_COMPARISON.md](REFERENCE_COMPARISON.md) and [reference-comparison.json](reference-comparison.json) for scope, normalized file hashes and schema details. Neither reference was executed or imported.

## 3. Database changes

Migration: [2026-11-11-charge-reduction-reversal.sql](../../server/db/migrations/2026-11-11-charge-reduction-reversal.sql).

| Table | Column | Definition |
| --- | --- | --- |
| billing_charge_adjustments | reversal_reason | varchar(255) NULL |
| billing_charge_adjustments | reversed_at | datetime NULL |
| billing_charge_adjustments | reversed_by_admin_id | int NULL |

The existing VARCHAR status supports reversed. No table, index or foreign key was removed/rekeyed. The existing bill foreign key is retained. Each new column is checked before DDL so an interrupted deployment can resume; incompatible existing definitions fail. No stored prescription, consultation, inventory, payment, promotion or existing approval was migrated/deleted.

Production/source access: **85 metadata reads, 0 writes, 0 application rows copied**. A separate loopback MySQL instance and schema carait_qa_20261111 were created. Synthetic identities, schedules, stock, appointments and payments were used for all mutations. External providers were blocked in the native runner. The new migration was applied, repeated, and re-entered with columns already present. Monetary totals and required reversal history fields passed integrity checks.

The disposable MySQL 8.0.41 instance was shut down after checking the final migration ledger; port 33409 is closed. Its synthetic datadir is retained for local review. Generated copies of all five supplied PDF pages were removed. Original user files were not changed. See [cleanup-results.json](cleanup-results.json).

The newly supplied August migration's eleven created tables and 113 referenced columns already exist in the captured schema. The movement_type field was widened by a later registered migration; three original global uniqueness indexes have verified branch-specific replacements. No historical schema was overwritten and no new database connection was made for this reference comparison.

Routes added (POST):

- /api/branches/my/legacy/billing/:id/charge-adjustments/:requestId/reverse
- /api/branches/workspace/:branchId/legacy/billing/:id/charge-adjustments/:requestId/reverse

These retain existing Admin portal authentication, billing permission, branch context and transaction handling. No Staff/Doctor reversal route was added.

## 4. Tests performed

| Check | Baseline | Current | Result |
| --- | --- | --- | --- |
| Client production build | PASS | PASS | 25 prebuild assertions and Vite bundle pass |
| Client ESLint | PASS | PASS | 0 errors; 23 existing warnings |
| Server postinstall / route registration | Not rerun in baseline copy | PASS | 357 modules; Staff/charge bindings and 231 handler references verified |
| Server Node | 657/684 pass; 27 fail | 672/699 pass; 27 fail | 15 new finance tests pass; same failing names |
| Client Node | 349/370 pass; 21 fail | 352/373 pass; 21 fail | 3 new parser tests pass; same failing names |
| Server Vitest | 259/263 pass; 4 fail | 259/263 pass; 4 fail | Same failing names |
| Playwright | 11/27 pass; 16 fail | 23/39 pass; 16 fail | 12 new cases pass; same 16 legacy failures; no skipped/flaky cases |
| Broader API / SQL smoke | Not rerun in baseline copy | PARTIAL | 41 API cases pass; 738 anonymous and 738 expired-token denials pass. SQL plans: 676 pass, 5 fail on absent inventory-mode tables; overall command exits 1. |
| Real API + built React + MySQL workflow | Not applicable | 21/21 PASS | No mocked API/DB for these cases; see clinical-workflow-results.json |
| Receipt PDF print engine | 28 normal-case PDFs used 2 pages | 32/32 PASS | Chrome and Edge; headers on/off; A5 dimensions and retained content verified |
| Native schema migration | Previous schema without reversal fields | PASS | Initial application, repeat and guarded re-entry with existing columns pass |
| Database integrity | Metadata copied only | PASS | Existing FK preserved; no negative/inconsistent totals; no incomplete reversal metadata |
| Supplied code export / August SQL reference | Baseline b192e96 | PASS | 772 exported application text files match baseline; current differences are the 17 modified files and 9 additions. Historical tables/columns and branch-specific replacement indexes verified against saved schema metadata. |

The broader [API smoke results](api-smoke-results.json) inventory 829 endpoints. All 41 workflow cases and both sets of 738 protected-route authentication probes pass. The separate SQL-plan sweep reports 676 passes and 5 failures because inventory_stock_mode, inventory_stock_eligibility and inventory_stock_movements are absent from the copied source schema. Those existing inventory-mode source files were not modified. This command therefore remains unsuccessful; it is not included as an overall passing suite. No baseline API-smoke run is claimed.

### Native workflow evidence

| Case | Result |
| --- | --- |
| admin password login with local-only MFA override | PASS |
| superadmin password login with local-only MFA override | PASS |
| staff password login with local-only MFA override | PASS |
| patient actual password login returns HttpOnly session cookie | PASS |
| doctor actual password login returns HttpOnly session cookie | PASS |
| Patient books a same-day synthetic appointment through actual slot validation | PASS |
| Staff confirms the booked appointment | PASS |
| Staff checks in the actual appointment; duplicate check-in cannot create a second queue row | PASS |
| Staff calls the patient and Doctor starts consultation | PASS |
| Doctor saves a versioned draft without inventory deduction | PASS |
| Insufficient stock rolls back finalization and clinical state | PASS |
| Doctor finalizes once, deducting exactly one unit and retaining prescription | PASS |
| Doctor request and Admin approval preserve the 100 peso booking promotion | PASS |
| Reversal rejects invalid reasons, unauthorized roles and another branch | PASS |
| Simultaneous Admin and Super Admin reversals restore once and create one audit event | PASS |
| Staff request approval then real Admin browser reversal immediately refreshes checkout totals | PASS |
| Both real medical-history screens display the saved prescription without JSON | PASS |
| Staff partial and final payments remain idempotent and block reversal after partial collection | PASS |
| Patient history contains the same paid bill; another patient cannot read it | PASS |
| Real Super Admin editor previews, saves, publishes and restores without changing the public draft prematurely | PASS |
| Patient logout invalidates the current session | PASS |

[Native request/case results](clinical-workflow-results.json) include actual booking with a saved promotion, draft/final consultation and prescription, one stock deduction, insufficiency rollback, Doctor/Staff approval/reversal, partial/final payment, idempotency, ownership and CMS publication/restore. Admin MFA and same-day notice were overridden only inside the synthetic local test process; provider delivery is not established by these tests.

### New payment interactions

| Case | Result |
| --- | --- |
| admin payment details and summary at 1440px retain partial payment and receipt | PASS |
| admin payment details and summary at 900px retain partial payment and receipt | PASS |
| admin payment details and summary at 390px retain partial payment and receipt | PASS |
| staff payment details and summary at 1440px retain partial payment and receipt | PASS |
| staff payment details and summary at 900px retain partial payment and receipt | PASS |
| staff payment details and summary at 390px retain partial payment and receipt | PASS |
| payment validation keeps invalid tender disabled and QR locking prevents manual collection | PASS |
| an active QR prevents manual tender or a second payment submission | PASS |
| admin clearing cash and switching from a cancelled QR never records payment | PASS |
| staff clearing cash and switching from a cancelled QR never records payment | PASS |
| admin lost payment response retries the same intent without collecting twice | PASS |
| staff lost payment response retries the same intent without collecting twice | PASS |

### Receipt printing

| Browser | Scenario | Header/footer | Pages | Result |
| --- | --- | --- | --- | --- |
| Edge | one-service | Off | 1 | PASS |
| Edge | one-service | On | 1 | PASS |
| Edge | multiple-services | Off | 1 | PASS |
| Edge | multiple-services | On | 1 | PASS |
| Edge | promotion | Off | 1 | PASS |
| Edge | promotion | On | 1 | PASS |
| Edge | partial | Off | 1 | PASS |
| Edge | partial | On | 1 | PASS |
| Edge | refunded | Off | 1 | PASS |
| Edge | refunded | On | 1 | PASS |
| Edge | voided | Off | 1 | PASS |
| Edge | voided | On | 1 | PASS |
| Edge | long-fields | Off | 1 | PASS |
| Edge | long-fields | On | 1 | PASS |
| Edge | many-items | Off | 3 | PASS |
| Edge | many-items | On | 3 | PASS |
| Chrome | one-service | Off | 1 | PASS |
| Chrome | one-service | On | 1 | PASS |
| Chrome | multiple-services | Off | 1 | PASS |
| Chrome | multiple-services | On | 1 | PASS |
| Chrome | promotion | Off | 1 | PASS |
| Chrome | promotion | On | 1 | PASS |
| Chrome | partial | Off | 1 | PASS |
| Chrome | partial | On | 1 | PASS |
| Chrome | refunded | Off | 1 | PASS |
| Chrome | refunded | On | 1 | PASS |
| Chrome | voided | Off | 1 | PASS |
| Chrome | voided | On | 1 | PASS |
| Chrome | long-fields | Off | 1 | PASS |
| Chrome | long-fields | On | 1 | PASS |
| Chrome | many-items | Off | 3 | PASS |
| Chrome | many-items | On | 3 | PASS |

Paper dimensions were checked against A5 portrait with browser rounding tolerance. Required receipt text and the final item in oversized receipts remain present. [Print results](print-results.json), [baseline print results](baseline-print-results.json). Example local artifacts: [one-service receipt](browser-artifacts/current-Edge-one-service-clean.pdf), [long-field receipt](browser-artifacts/current-Chrome-long-fields-headers.pdf), [multi-page receipt](browser-artifacts/current-Edge-many-items-clean.pdf).

### Baseline comparison and test maintenance

**No newly failing test names remain** in Node, Vitest or Playwright. No test was removed or skipped. Existing assertions that looked for inline payment markup were updated to follow the shared component while retaining financial, image-proof, explicit-submission and QR-lock checks. Actual Admin/Staff wrappers are checked instead of duplicated references to one unused shared file. Behavioral browser tests additionally prove QR blocking/cancellation, clearing Cash and lost-response retry. The migration-order test now includes the additive migration and retains historical checksum assertions.

Initial QA fixture failures (missing required promotion description, missing patient branch selection, label mismatches, and cleanup of a policy row after failed initialization) were corrected in the QA harness. They were not counted as product defects. A Windows sandbox account lock (1909) required approved local execution for final checks. Results were not inferred from those environment errors.

## 5. Remaining issues

- **Existing suites remain red:** 27 server Node, 21 client Node, 4 Vitest and 16 legacy browser failures. Their failing names match baseline. They include retired navigation/markup contracts, pricing/print contract conflicts, incomplete fixture dependencies and unrelated UI workflows. This report does not certify the whole application as failure-free.
- **Broader SQL-plan sweep:** five checks fail on the three absent inventory-mode tables listed above. The affected files and source schema are outside these five fixes; no unsupported inventory migration was applied to hide those failures.
- **External delivery is not verified:** real PayMongo test-provider/webhook exchange, GCash/Maya settlement and Cloudinary/email/SMS delivery. No live charge or production recipient was used. Current manual payment methods remain governed by existing configuration; unsupported ones were not enabled.
- **Interactive printer UI/physical paper** was not exercised. Actual Chrome/Edge print-to-PDF engines, A5 geometry, content retention and header/footer settings were tested.
- **Full backup comparison** remains unavailable: AllCodes.txt is now verified, while the supplied August SQL file is a migration rather than the named full backup. No historical application data restore/comparison is claimed. Hosted Render/Cloudflare Linux deployment was not performed.

### Unchanged Node failures

| Runner | Failing assertion |
| --- | --- |
| Server | approved image binds promotion, actor and current branch and saves only verified asset |
| Server | readiness obtains branch-scoped accurate counts with 4 parameterized grouped queries |
| Server | legacy organization-level readiness still works without a branch filter |
| Server | branch doctor schedule endpoint uses weekday order and retains doctor ownership |
| Server | deactivated branch is denied |
| Server | Super Admin consolidated inventory sums both branches |
| Server | billing settings are registered before dynamic bill id |
| Server | inactive branch operational actions are disabled while status switch remains accessible |
| Server | active/inactive status filter compares strings correctly |
| Server | public navigation is responsive and routes back to anchored home sections |
| Server | stock requests are confined to the requested branch |
| Server | Doctor and billing helpers enforce branch-owned catalog items and bill attribution |
| Server | cross-branch inventory expiry uses the Manila date at the UTC boundary |
| Server | draft announcement accepts plain-text content |
| Server | rejects unsafe external CTA URLs |
| Server | rejects protocol-relative redirects |
| Server | first-login schema, invitation, login, password reset and UI all use the same flag |
| Server | new additive migration stores draft and published policy separately |
| Server | public page is routed, linked from the footer, and opened from the booking flow |
| Server | appointment validates the doctor and service inside the requested branch transaction |
| Server | patient booking explicitly requires branch-owned doctor and service |
| Server | Patient promotion API rejects absent branch and cannot return other branch offers |
| Server | new compatibility endpoints have branch predicates, not JS-only list filtering |
| Server | patient doctor schedules require branch-scoped active doctor |
| Server | dashboard and reports separate billed from collected and have date selectors |
| Server | substitute Saline with alternative prices patient-specific ₱470, deducts only actual products |
| Server | branch and Staff System Setup use the same physical stock allocation summary |
| Client | AuthContext preserves a session on unavailable checks and revalidates on tab return |
| Client | patient guards show a retry state instead of redirecting on an unavailable auth check |
| Client | branch form includes blank, standard, copy, preview and creation guidance |
| Client | both checkout portals supply branch scoped cancellation to the shared QR panel |
| Client | doctor availability sorts weekdays while preserving booking routes |
| Client | featured offers preserve selected promotion while providing bounded scroll controls |
| Client | Staff and Admin wrappers bind one shared checkout to their own permitted APIs |
| Client | pending clinical adjustments are reviewed on bill, not by a Doctor |
| Client | shared Billing navigation and action links retain the selected physical branch |
| Client | charge adjustment UI preserves approval, reason and stock separation notices |
| Client | unapproved catalog prices and placeholders are not presented as public prices |
| Client | redesigned dashboard retains live services, offers, announcements, and booking paths |
| Client | prescription prints as two landscape pads without signature box |
| Client | existing fields print and duplicate across pads |
| Client | long prescription continues on extra sheet without dropping medicine entries |
| Client | staff with Checkout and Billing sees the same four billing tasks as Admin |
| Client | billing-only staff cannot reach payment or cashier tools via query parameter |
| Client | checkout-only staff can still read branch-owned bills but does not gain Admin approvals |
| Client | dashboard and reports never display zero-valued KPIs on request failure |
| Client | branch activation retains the confirmation flow and readiness details |
| Client | branch and super admin explicitly return permanent deletion on successful delete |

### Unchanged Vitest failures

- September 28 Batch 2 — inventory semantics, services setup, and prescription quantity uses prescription quantity while keeping legacy dosage readable
- Batch 5 deferred inventory deduction workflow does not cap actual consumable entry to pre-checked treatment-room stock
- billing checkout follow-up regressions uses clinic-facing billing statuses and provides a return path to payment
- Batch 1 recovery and consultation autosave regressions keeps draft saving independent from treatment-room stock and autosaves without a manual Save Draft button

### Unchanged browser failures

| Test | Observed failure |
| --- | --- |
| admin: two billing tabs and accurate payment filters | Error: expect(locator).toBeVisible() failed Locator: getByRole('navigation', { name: 'Billing', exact: true }).getByRole('link', { name: 'Payments', exact: true }) Expected: visible |
| superadmin: two billing tabs and accurate payment filters | Error: expect(locator).toBeVisible() failed Locator: getByRole('navigation', { name: 'Billing', exact: true }).getByRole('link', { name: 'Payments', exact: true }) Expected: visible |
| staff: two billing tabs and accurate payment filters | Error: expect(locator).toBeVisible() failed Locator: getByRole('navigation', { name: 'Billing', exact: true }).getByRole('link', { name: 'Payments', exact: true }) Expected: visible |
| Staff sees pending requests without approval controls | Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Charge Reductions' }) Expected: visible |
| dedicated history retains cancelled and expired attempts and receipt details | Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Activity Timeline' }) Expected: visible |
| admin: walk-in submission sends only visit data once | Error: locator.click: Test timeout of 20000ms exceeded. Call log:   - waiting for getByRole('button', { name: /Dr Test.*Available for walk-ins/ }) |
| superadmin: walk-in submission sends only visit data once | Error: locator.click: Test timeout of 20000ms exceeded. Call log:   - waiting for getByRole('button', { name: /Dr Test.*Available for walk-ins/ }) |
| staff: walk-in submission sends only visit data once | Error: locator.click: Test timeout of 20000ms exceeded. Call log:   - waiting for getByRole('button', { name: /Dr Test.*Available for walk-ins/ }) |
| lost partial payment response retries the same key and preserves the remaining balance | Error: locator.click: Test timeout of 20000ms exceeded. Call log:   - waiting for getByRole('button', { name: 'Confirm Payment ₱100.00', exact: true }) |
| a paid bill opens its saved receipt with the promotion total | Error: locator.click: Test timeout of 20000ms exceeded. Call log:   - waiting for getByRole('button', { name: 'View Receipt', exact: true }) |
| admin: scheduled manual booking never serializes its button event | Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Appointment request created', exact: true }) Expected: visible |
| superadmin: scheduled manual booking never serializes its button event | Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Appointment request created', exact: true }) Expected: visible |
| staff: scheduled manual booking never serializes its button event | Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Appointment request created', exact: true }) Expected: visible |
| billing-only Staff can view bills without checkout, cash tools, or Admin actions | Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Payments', exact: true }) Expected: visible |
| mobile billing tabs and checkout fit the available viewport | Error: expect(locator).toBeVisible() failed Locator: getByRole('button', { name: 'Pending Payments', exact: true }) Expected: visible |
| Staff retains permission to close only their own cash drawer inside collapsed tools | Error: locator.click: Test timeout of 20000ms exceeded. Call log:   - waiting for getByText('Admin Tools', { exact: true }) |

## 6. Verification checklist

| Task | Status | Verification |
| --- | --- | --- |
| 1. Reverse approved reductions | PASS | Real Admin and Super Admin race: one 200/one 409 and one audit. Real Admin reason dialog refreshes totals. Promotion/other discounts, other reductions and partial-payment restrictions verified. |
| 2. Shared payment section | PARTIAL | Implemented; Admin/Staff desktop/tablet/mobile, cash/partial receipts, QR lock/cancel and response-loss retry pass. External PayMongo/GCash/Maya delivery was not exercised; unsupported manual methods remain disabled by existing configuration. |
| 3. Readable prescriptions | PASS | Native Patient Records and Visit History display the same saved medicine. Parser tests cover multiple/incomplete/legacy/null/malformed inputs. Stored medical contents unchanged. |
| 4. One-page normal A5 receipts | PASS | 32 browser-generated PDFs pass. Normal cases use one A5 page, including long fields and refund/void states; 40-item receipts use 3 pages with last item retained. Manual interactive printer dialogs/physical printing not exercised. |
| 5. Landing-page editor | PASS | Real preview/save/publish/restore/public-page flow, responsive 1440/900/390 layouts, device toggles, Escape and stale-revision 409 verified. Existing upload delivery remains externally untested. |

Local implementation/verification is complete for the available environment; external provider delivery and hosted deployment remain outside the verified scope. See [test-summary.json](test-summary.json) for machine-readable totals and introduced-failure comparison.

## 7. Deployment notes

1. Review the source patch and take the normal database backup through the approved deployment process. Do not run QA seed/bootstrap scripts against production.
2. Apply the registered migration with server npm run migrate on approved staging, then the target database after approval. Verify reversed_at, reversed_by_admin_id and reversal_reason exist before enabling the new backend endpoint. The migration is additive; the existing runner handles replay. Remote TiDB DDL was not executed by this session.
3. Deploy the server and client together through the existing Render/Cloudflare process. Use existing server start/postinstall and client npm run build; no new environment variables or application dependencies are required. No deployment was triggered here.
4. Rehearse on staging: approve/directly apply a reduction, reverse it, confirm the bill, collect a partial/final payment and print the receipt. Confirm Staff/Doctor and wrong-branch denial, no reversal after confirmation/payment, and one audit event under duplicate requests.
5. Rehearse draft -> preview -> save -> publish -> public page -> restore -> republish, plus the configured image upload provider. Verify actual PayMongo TEST behavior with approved sandbox credentials before relying on it in a demonstration.
6. The supplied 2026-08-26-clinic-workflow-upgrade.sql is already represented in the inspected schema. Do not run it manually as a restore or replace newer branch constraints with its older definitions; use the registered migration runner for the new reversal fields.

No Purchase Cost per Unit fields were added to inventory forms, spreadsheets or workflows. No clinical, stock or paid-payment reversal was introduced.
