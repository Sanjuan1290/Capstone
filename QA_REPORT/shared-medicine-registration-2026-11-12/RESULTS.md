# Shared service inventory and walk-in registration — 2026-11-12

Implemented on HEAD `7681cbf`, preserving the pending guest-status lookup changes already in the working tree. Nothing has been deployed. No production database was read or written, no live SMS was sent, and no migration is required.

## Fixed behavior

### Inventory items for services

General Medicine and Dermatology services can select inventory items from either medicine category in the same branch. The service editor searches across these items and labels each option with its category and selling price. Changing a service's clinic retains its selected inventory items while clearing the service category, which must still match the newly chosen clinic.

Both the branch catalog writer and legacy Admin consumable-price validator accept mixed categories. Branch saves still reject another branch's inventory and archived items. Positive selling prices, whole-number quantities, server-calculated prices, Admin pricing permissions and audit transactions remain enforced. Saving service configuration does not adjust stock. The consultation's additional/replacement item picker also includes both categories.

### Walk-in record becoming a patient account

A walk-in patient record is not automatically a portal account. Registration no longer rejects its email merely because that record exists. When the supplied mobile matches the walk-in record and the recorded identity details agree, the existing SMS registration flow can activate **that same patient ID**.

Before SMS verification, no password or account flag is changed. After a valid code, activation sets the hashed password and `is_walk_in=0`, records phone verification and consent, updates the consent method, increments the session version and writes an activation audit. These writes and OTP consumption commit together. Existing appointments, bills and patient IDs are retained. Existing civil status and an unchanged verified email are preserved; changing the email does not mark the new address verified.

Existing portal passwords remain protected even if an old account incorrectly still has `is_walk_in=1`. Banned records, conflicting contacts, ambiguous patient records and mismatched recorded identities are not silently overwritten. If an email belongs to a walk-in record with a different or missing mobile, registration explains that the clinic must update/link that contact first. Matching an email alone cannot claim medical history.

For the reported email, retry registration after deployment using the same mobile and details recorded during the walk-in. This work did not inspect or manually alter the user's production patient record.

## Actual verification

| Check | Result |
| --- | --- |
| New registration tests: activation, same ID/history, hashed credentials, real-account protection, mismatched contacts/identity, wrong/expired OTP, rollback, concurrency and contact races | **14 passed** |
| New shared service inventory tests: both clinic types, create/edit pricing, branch isolation, archived items, quantity/price guards and legacy validation | **7 passed** |
| New clinical mixed-category validation scenario | **1 passed** |
| New browser scenarios: Admin/Super Admin mixed-category saves, clinic switching, desktop/mobile registration using actual controllers, existing-account rejection | **6 passed** |
| Combined backend Node feature/regression run | **67 passed** |
| Clinical/stock-room Node regressions, including the new mixed-category case | **14 passed, 1 failed** |
| Registration, OTP-purpose, stock-request and inventory-semantics Vitest regressions | **13 passed, 1 failed** |
| Shared prescription renderer and consultation supply-reason frontend regressions | **10 passed** |
| Combined Playwright run, including previous guest booking/lookup scenarios | **22 passed** |
| Frontend production build | **Passed; 25 required prebuild tests passed** |
| ESLint on changed service editor and consultation components | **Passed, no errors or warnings** |
| Backend syntax / staff route validation / charge-reduction smoke checks | **Passed; 394 modules** |
| Source graph | **Passed; 659 source files, 1,538 relative imports** |
| Application conflict-marker scan and git whitespace check | **Passed** |

All **28 new feature checks passed**. The focused test runs contain **126 passes and 2 pre-existing failures**, excluding the build's additional prebuild tests. Database boundaries and SMS delivery use synthetic fixtures. The registration browser tests execute the real controller logic against those fixtures rather than returning a fabricated success response.

## Remaining failures

1. `server/tests/security/batch2InventorySemantics.test.js`, “uses prescription quantity while keeping legacy dosage readable”: expects literal `rx.quantity ?? rx.dosage` in `History.jsx`. That file is unchanged from HEAD and uses `PrescriptionDetails`/`parsePrescription`. The shared renderer's existing tests pass. `prescription-baseline.json` records the HEAD comparison.
2. `server/tests/stockRoomPdfFix.node.test.cjs`, “branch and Staff System Setup use the same physical stock allocation summary”: expects `getBranchStockRooms(db, req.branchId)` in `staff.router.js`. The same failure reproduces against HEAD using the read-only baseline loader. These stock-room routes were not modified by this task.

The service-specific assertions in the old inventory test were updated to the newly requested cross-category behavior and current labels. The unrelated prescription assertion was left intact and reported. The full repository suite was not rerun, and this report does not declare all regressions green.

## Changed application files for this request

- `client/src/pages/adminPage/Admin_BillingServiceForm.jsx`: shared item selection, category labels, accessible inventory controls, retained items on clinic changes and consistent pricing validation.
- `client/src/pages/doctorPage/Doctor_Consultation.jsx`: additional/replacement item choices are no longer filtered by the appointment's medicine category.
- `server/routers/branchCatalogWrites.js`: remove the medicine-category mismatch check while retaining branch, archive, price and quantity checks.
- `server/controllers/admin.controller.js`: align the legacy consumable-price validator.
- `server/controllers/patient.controller.js`: distinguish walk-ins from portal accounts, bind the pending registration to its patient, and activate transactionally after SMS verification.
- `server/utils/patientRegistrationIdentity.js`: resolve matching contacts, protect existing accounts and validate the walk-in identity again at activation.

Tests added: `server/tests/walkInRegistration20261112.node.cjs`, `server/tests/helpers/patientRegistrationHarness.cjs`, `server/tests/sharedServiceInventory20261112.node.cjs`, `client/tests/browser/sharedMedicineRegistration20261112.spec.mjs`. Existing inventory-semantics and clinical supply tests were updated for shared categories. The guest lookup browser screenshot directory is now configurable to preserve prior QA artifacts.

## Reproduction

From the repository root:

```powershell
node --test server/tests/walkInRegistration20261112.node.cjs server/tests/sharedServiceInventory20261112.node.cjs server/tests/serviceCatalog20261102.node.test.cjs server/tests/billing/servicePricingContract.node.test.cjs server/tests/registrationSmsLimits20261111.node.cjs server/tests/guestAppointmentLookup20261112.node.cjs server/tests/guestBooking20261112.node.cjs server/tests/guestPromotions20261112.node.cjs
node --test server/tests/stockRoomPdfFix.node.test.cjs server/tests/consultationSupplyReasonPolicy.node.test.cjs
node --require ./QA_REPORT/guest-booking-2026-11-12/baseline-source.cjs --test server/tests/stockRoomPdfFix.node.test.cjs
node --test client/tests/prescriptionDisplay20261111.node.test.mjs client/tests/consultationSupplyReason.node.test.mjs
```

From `server`:

```powershell
npm.cmd run check:syntax
npm.cmd run verify:source
node node_modules/vitest/vitest.mjs run tests/security/batch2InventorySemantics.test.js tests/security/batch6ARegistrationCleanup.test.js tests/security/accountSecurityPurpose.test.js tests/supplyRequests/multiItemStockTransfers.test.js
```

From `client`, run `npm.cmd run build`, then from the repository root:

```powershell
node QA_REPORT/shared-medicine-registration-2026-11-12/run-browser.cjs
```

The browser runner owns and stops its preview process. Local logs/JSON are git-ignored. Screenshots: [medical service with shared items](service-medical.png), [dermatology service with shared items](service-derma.png).

## Deployment readiness

The two features are ready for staging validation. Deploy backend and frontend together, then test real SMS delivery and activation against a staging walk-in record. Existing SMS configuration is reused; no new environment settings, schema changes or manual production cleanup are needed for matching walk-in contacts. Production data and migration history were not changed.
