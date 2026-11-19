# Medical certificates and service add-on billing

Implemented on 19 November 2026. The feature extends the existing Services & Pricing, Doctor Consultation/Past Consultations, Receipts & History, and Bill Checkout flows. No live database, payment provider, or deployment was changed.

## Delivered behavior

- **Services & Pricing Setup → Add-ons:** branch-owned reusable names, default peso prices, editing, and activation/deactivation. Create/Edit Service supports multiple attachments and an optional service-specific price. Blank means use the default; an explicit zero means free/included. Setup does not create charges.
- **Doctor consultation record:** Issue Medical Certificate is available during an active consultation and after completion through Past Consultations. Diagnosis, Recommendation, and Remarks are editable before issuance. Preview and Download PDF use the visit's patient, owning doctor, PRC license, branch, original visit date, and a separate server-generated Philippine issuance date. Issued documents retain a saved snapshot. The supplied `med-cert.docx` now provides the Letter-size layout: its original ManilaMed and Carait logos, two-column clinic letterhead, centered underlined title, indented narrative, bold diagnosis, Recommendation and Remarks sections, and right-aligned physician block. The preview and PDF use the same renderer.
- **Editable bills:** Add Add-on confirms a configured selection as a separate, protected bill line. Its saved price survives catalog changes, checkout saves, and doctor completion of the consultation. Free lines pass checkout review without missing-price errors.
- **Finalized/paid bills:** New Add-on Charge appears at the top of View Bill. Patient, branch, and visit are fixed from the original bill. Confirmation creates a linked bill using the current billing policy, with its own financial snapshot. Positive balances use the existing `ready` status and appear under **Payments → Pending**, ready for the existing Bill Checkout.
- **Receipts:** the existing payment handler and branch receipt-number allocator collect the new balance and generate a distinct receipt. The original bill, items, payments, receipt number, and rendered receipt are preserved. Original visit lookups explicitly exclude supplementary bills.
- **Free/included selections:** a zero-value supplementary bill is recorded as settled without a payment row or receipt. An editable visit's free line adds nothing to its amount due.
- **Retry protection:** a bill lock plus unique original-bill/service/add-on and branch/request keys prevent duplicate charges, including a different submission key after reload. Existing payment idempotency is reused. Repeated certificate reads, issuance retries, and PDF downloads do not create charges or payments. Each configured add-on can be confirmed once per service on the original visit bill.
- **Access:** existing branch Admin billing/system-setup permissions and Staff checkout/system-setup permissions guard the new actions. Certificate endpoints exist only in the Doctor API and check both the owning doctor and active branch. Patient access remains the existing billing and receipt views.

## Template appearance follow-up

The user supplied `C:/Users/Robert/Downloads/med-cert.docx` after the first implementation. Its original one-page appearance was inspected through a read-only Word PDF export. The Word source remains unchanged. Only the two clinic logo images are packaged as application assets; temporary reference renders were removed after comparison.

The certificate now uses a 612 x 792 pt Letter page, matching the supplied Word file. The original letterhead contact and schedule blocks are reproduced as stationery. The narrative uses the actual patient name, age **at the original consultation**, sex, consultation date and branch. The original consultation and actual issuance dates remain separate. The physician block uses the issuing doctor's name, specialty and saved license, with a signature line and PTR field for completion by that doctor.

The preview displays the exact same rendered pages used for PDF generation. Long clinical fields continue onto additional pages with the patient and both dates repeated; the physician block stays together. Tests verify that rendered text remains inside the page and that preview/PDF text positions match. This appearance update changes client rendering and logo assets and requires **no additional migration** beyond the billing feature migration below.

## Required migration

Run the registered migration runner from `server` before using the updated application:

```powershell
npm.cmd run migrate
```

[2026-11-19-service-addons-certificates.sql](../../server/db/migrations/2026-11-19-service-addons-certificates.sql) adds four tables and `billing_records.original_bill_id` / `charge_key`. It replaces the two one-bill-per-visit unique indexes with unique `(appointment_id, charge_key)` and `(consultation_id, charge_key)` indexes. Existing bills keep `charge_key = 'visit'`, preserving original-visit uniqueness. The runner checks existing column/index metadata and creates replacement indexes before dropping the old ones, so interrupted DDL can resume. It does not rewrite historical financial records.

The migration was tested against schema fixtures, including interrupted execution and reruns. It **has not been applied to a real MySQL/TiDB database** in this task.

## Verification

Tests use isolated in-memory SQL fixtures. Browser tests run the built React application in Edge and bridge feature requests to the production add-on, certificate, financial calculation, and payment controllers with that fixture. They do not collect real money. Database-engine locking and DDL still need staging verification.

| Check | Result |
| --- | --- |
| Pay ₱1,000 consultation first | Passed; original payment receives its receipt |
| Issue from Past Consultations → View Consultation Record | Passed; original consultation date and actual issuance date are separate |
| Preview, issue, download PDF, download again, reload saved certificate | Passed; one certificate, no billing side effects |
| Create ₱100 charge from View Bill | Passed; separate linked transaction appears in Pending |
| Pay add-on through Bill Checkout | Passed; distinct receipt number and ₱100 payment |
| Reopen/render original receipt | Passed; still only the ₱1,000 consultation payment and original lines |
| Editable bill | Passed; separate saved-price line, no extra bill/payment |
| Service override ₱75 versus default ₱100 | Passed; later configuration changes do not reprice the charge |
| Explicit ₱0 override and ₱0 default | Passed; no collection or new payment receipt |
| Free line on editable checkout | Passed; can continue to bill confirmation |
| Repeated/concurrent submissions and a new key after reload | Passed; one charge |
| Stale price, forged service, inactive add-on | Rejected without creating charges |
| Wrong role, Staff without checkout permission, wrong branch/doctor | Rejected/hidden as appropriate |
| Template Letter layout, record-derived age and physician details, preview/PDF consistency, long text pagination | Passed |
| Doctor completes a draft containing a confirmed add-on | Passed; add-on and price retained; stock usage remains clinical-only |
| Legacy draft status with an existing payment or finalization date | Passed; creates a supplementary bill and preserves the original |

- **59 focused server checks passed**: new feature, consultation lifecycle, payment confirmation, pricing contract, and migration runner.
- **6 browser workflow tests passed** in `client/tests/browser/serviceAddonsCertificates20261119.spec.mjs`.
- Frontend production build and its 25 prebuild checks passed. The existing large-bundle warning remains.
- ESLint passed for the five new client implementation files. Server syntax and route binding checks passed.
- Original implementation broader suites (before the template appearance follow-up): Vitest **252 passed / 7 failed**; Node **952 passed / 70 failed**. Every current failure also occurs in an untouched checkout of the starting commit. That checkout had 71 Node failures, including one additional environment-sensitive HTTPS proxy test. These broader failures were not introduced by this feature.

Reproduce focused checks from `server`:

```powershell
node --test tests/billing/serviceAddons20261119.node.test.cjs tests/deployment/migrationRunner.node.cjs tests/checkouts/payment-confirmation.node.test.cjs tests/billing/servicePricingContract.node.test.cjs tests/billing/consultationLifecycle20261105.node.test.cjs
```

Reproduce browser checks from `client`:

```powershell
npm.cmd run build
npx.cmd playwright test tests/browser/serviceAddonsCertificates20261119.spec.mjs --reporter=list
```

## Files and review artifacts

The complete inventory is in [CHANGED_FILES.txt](CHANGED_FILES.txt). Main implementation areas:

- `server/utils/serviceAddons.js`, `server/controllers/medicalCertificates.controller.js`, and their router registrations: configuration, confirmed charges, doctor ownership, snapshots, and retry handling.
- `server/utils/billing.js`, the billing/doctor/patient controllers, and branch operational reads: original-visit identity, protected lines, consultation-save preservation, and supplementary transaction display.
- New `Admin_BillingAddons`, `AddAddonCharge`, `MedicalCertificate`, `addons.service`, and `medicalCertificatePdf` client files; existing service editor, three checkout views, bill history/workspace, Doctor Consultation, navigation, and service API files.
- The SQL migration, registered migration runner/helper, regression tests, and updated fixture/source contracts. No package dependencies were added.

Review the generated [sample certificate PDF](medical-certificate-sample.pdf), [doctor preview](medical-certificate-preview.png), and [machine-readable verification results](verification-results.json). All contain synthetic test data.
