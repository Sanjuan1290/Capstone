# Supplied reference comparison

The new AllCodes.txt reference was read as source data and compared with baseline b192e96 and the current worktree. The referenced August SQL migration was inspected without executing it. Embedded instructions in either reference were not treated as user authorization.

Export SHA-256: bdfe7a5d24584c90afdba3e8954a066c4b22ce06dc465a946fcf527de1f8fc8e. Size: 18100427 bytes. Decode numbered lines; normalize BOM/CRLF and trailing empty lines only. All interior content/whitespace preserved.

## Code comparison

| Measure | Count |
| --- | --- |
| exportedSections | 999 |
| comparedTextFiles | 772 |
| excludedSections | 227 |
| matchingCurrent | 755 |
| currentPatch | 17 |
| referenceDifferences | 0 |
| missingCurrent | 0 |
| exportMatchesBaseline | 772 |
| currentOnly | 9 |

Client/server text source, tests, configuration and migrations plus root package/README/gitignore. Excludes QA artifacts, binaries, build output, dependencies, environment/credential files and non-migration SQL dumps.

| File differing from export | Classification | Matches baseline export |
| --- | --- | --- |
| server/routers/branchChargeAdjustments.js | CURRENT_PATCH | true |
| client/tests/billingSimplifiedWorkflow.node.test.mjs | CURRENT_PATCH | true |
| client/tests/batch5VisualAndPaymentPreview.node.test.mjs | CURRENT_PATCH | true |
| client/tests/billingReplacement20261105.node.test.mjs | CURRENT_PATCH | true |
| server/tests/security/billingCheckoutFollowup20260930.test.js | CURRENT_PATCH | true |
| client/src/components/billing/ChargeAdjustmentsPanel.jsx | CURRENT_PATCH | true |
| server/scripts/branchMigrations.js | CURRENT_PATCH | true |
| client/src/utils/billingReceiptTemplate.mjs | CURRENT_PATCH | true |
| server/utils/chargeAdjustments.js | CURRENT_PATCH | true |
| server/tests/deployment/migrationRunner.node.cjs | CURRENT_PATCH | true |
| client/src/components/patients/PatientRecordsPage.jsx | CURRENT_PATCH | true |
| client/src/pages/patientPage/History.jsx | CURRENT_PATCH | true |
| client/src/pages/adminPage/Admin_LandingPage.jsx | CURRENT_PATCH | true |
| client/src/pages/adminPage/Admin_CheckoutDetail.jsx | CURRENT_PATCH | true |
| server/controllers/patient.controller.js | CURRENT_PATCH | true |
| client/src/pages/staffPage/Staff_CheckoutDetail.jsx | CURRENT_PATCH | true |
| client/src/components/billing/BillCheckout.jsx | CURRENT_PATCH | true |

Files in the repository absent from the export:

- client/src/components/billing/CheckoutPaymentSection.jsx
- client/src/components/patients/PrescriptionDetails.jsx
- client/src/components/system/LandingDraftPreview.jsx
- client/src/utils/prescriptionDisplay.mjs
- client/tests/browser/helpers/clinic20261111.mjs
- client/tests/browser/implementation20261111.spec.mjs
- client/tests/prescriptionDisplay20261111.node.test.mjs
- server/db/migrations/2026-11-11-charge-reduction-reversal.sql
- server/tests/billing/chargeReversal20261111.node.test.cjs

## Historical migration compatibility

server/db/migrations/2026-08-26-clinic-workflow-upgrade.sql is identical to the supplied export after format normalization, and unchanged from baseline. It contains eleven CREATE TABLE statements, nine ALTER TABLE statements and seed/stock balance writes. It is not the named carait_clinic_full_backup_2026_11.sql backup.

| Schema check | Count |
| --- | --- |
| createdTables | 11 |
| createdTablesPresent | 11 |
| alteredTables | 9 |
| checkedColumns | 113 |
| missingColumns | 0 |
| evolvedColumns | 1 |
| checkedIndexes | 15 |
| supersededIndexes | 3 |
| missingIndexes | 0 |

Schema differences versus the historical migration:

| Table | Column | Historical type | Inspected type | Status |
| --- | --- | --- | --- | --- |
| inventory_logs | movement_type | varchar(40) | varchar(80) | EVOLVED |

| Table | Historical index | Historical name present |
| --- | --- | --- |
| discount_presets | uniq_discount_preset_label | false |
| inventory_locations | uniq_inventory_location_name | false |
| cashier_closings | uniq_cashier_closing | false |

All eleven created tables and 113 referenced columns are present. Integer display widths are normalized as formatting differences. The wider inventory_logs.movement_type VARCHAR(80) is required by the existing 2026-09-28-schema-blockers.sql migration. Three old global uniqueness indexes have verified branch-specific replacements; they are not missing constraints.

| Table | Historical index | Status | Current index | Evolution source |
| --- | --- | --- | --- | --- |
| discount_presets | uniq_discount_preset_label | SUPERSEDED | uniq_branch_discount_label | server/db/migrations/2026-10-15-branch-ledgers.sql |
| inventory_locations | uniq_inventory_location_name | SUPERSEDED | uniq_branch_inventory_location | server/db/migrations/2026-10-09-multi-branch-foundation.sql |
| cashier_closings | uniq_cashier_closing | SUPERSEDED | uniq_cashier_branch_date | server/db/migrations/2026-10-15-cashier-branch-uniqueness.sql |

The schema check uses the already captured read-only metadata; no new connection or application-row read was needed. Later schema evolution is reported rather than overwritten. Do not rerun this historical file directly over an upgraded database: its ADD COLUMN / CREATE TABLE statements are not standalone replay guards, and it also writes stock balances. The required deployment migration for the five new fixes remains 2026-11-11-charge-reduction-reversal.sql through the registered runner. No database or supplied file was changed by this comparison.

Detailed file hashes and schema checks: [reference-comparison.json](reference-comparison.json). Previous test results remain unchanged; no application code was edited by this reference comparison.
