# Changed files

Paths are relative to the repository root. Removed files are marked explicitly. Generated QA evidence is listed separately.

## Frontend source

- `client/src/components/billing/BillFinancialTools.jsx`
- `client/src/components/billing/BillHistory.jsx`
- `client/src/components/billing/BillHistoryDetail.jsx`
- `client/src/components/billing/CheckoutPaymentSection.jsx`
- `client/src/components/billing/DiscountProofField.jsx`
- `client/src/components/billing/FinancialAllocationReport.jsx`
- `client/src/components/billing/FinancialBillBreakdown.jsx`
- `client/src/components/consultation/PatientFollowupRecommendations.jsx`
- `client/src/components/consultation/RecommendedFollowupEditor.jsx`
- `client/src/components/system/BillingTaxSettings.jsx`
- `client/src/components/system/SystemSetupTabs.jsx`
- `client/src/context/PatientBranchContext.jsx`
- `client/src/pages/adminPage/Admin_Announcements.jsx`
- `client/src/pages/adminPage/Admin_BillingServiceForm.jsx`
- `client/src/pages/adminPage/Admin_CheckoutDetail.jsx`
- `client/src/pages/adminPage/Admin_Promotions.jsx`
- `client/src/pages/adminPage/Admin_Reports.jsx`
- `client/src/pages/adminPage/Admin_SystemSetup.jsx`
- `client/src/pages/doctorPage/Doctor_Consultation.jsx`
- `client/src/pages/doctorPage/Doctor_ConsultationHistory.jsx`
- `client/src/pages/patientPage/BookAppointment.jsx`
- `client/src/pages/patientPage/History.jsx`
- `client/src/pages/patientPage/PatientDashboard.jsx`
- `client/src/pages/staffPage/Staff_CheckoutDetail.jsx`
- `client/src/pages/superAdminPage/redesign/ReportsPage.jsx`
- `client/src/services/admin.service.js`
- `client/src/services/cloudinaryScan.js` (removed)
- `client/src/services/discountProofUpload.js`
- `client/src/services/doctor.service.js`
- `client/src/services/imageUpload.js`
- `client/src/services/patient.service.js`
- `client/src/services/portal.service.js`
- `client/src/services/staff.service.js`
- `client/src/utils/billingReceiptTemplate.mjs`
- `client/src/utils/paymentPreview.mjs`
- `client/src/utils/receiptPaymentTimeline.mjs`

## Backend source

- `server/controllers/admin.controller.js`
- `server/controllers/billingCorrections.controller.js`
- `server/controllers/doctor.controller.js`
- `server/controllers/patient.controller.js`
- `server/controllers/staff.controller.js`
- `server/middlewares/rateLimit.middleware.js`
- `server/routers/admin.router.js`
- `server/routers/branchAnnouncements.js`
- `server/routers/branchBillingSettings.js`
- `server/routers/branchCatalogWrites.js`
- `server/routers/branchPaymentSettingsWrites.js`
- `server/routers/branchPromotions.js`
- `server/routers/branches.router.js`
- `server/routers/doctor.router.js`
- `server/routers/patient.router.js`
- `server/routers/staff.router.js`
- `server/scripts/branchMigrations.js`
- `server/scripts/verifyDeployment.js`
- `server/utils/billing.js`
- `server/utils/billingCalculation.js`
- `server/utils/billingFinancialSnapshot.js`
- `server/utils/billingMoney.js`
- `server/utils/billingSecurity.js`
- `server/utils/billingServicePromotions.js`
- `server/utils/billingTaxPolicy.js`
- `server/utils/chargeAdjustments.js`
- `server/utils/cloudinarySecurity.js`
- `server/utils/consultationFollowups.js`
- `server/utils/consultationImages.js`
- `server/utils/doctorFeeAllocation.js`
- `server/utils/financialAllocationReport.js`
- `server/utils/patientBillingHistory.js`

## Database migrations

- `server/db/migrations/2026-11-14-billing-financial-snapshots.sql`
- `server/db/migrations/2026-11-14-branch-tax-policy.sql`
- `server/db/migrations/2026-11-14-consultation-followups.sql`

## Tests

- `client/tests/announcementPreviewImage.node.test.mjs`
- `client/tests/apiErrorReferences20261109.node.test.mjs`
- `client/tests/batch79LivePromotions.node.test.mjs`
- `client/tests/billingReceiptA5_20261105.node.test.mjs`
- `client/tests/bookingPolicyServiceContract20261102.node.test.mjs`
- `client/tests/bookingPolicyServiceExports.node.test.mjs`
- `client/tests/browser/inventory20261111.spec.mjs`
- `client/tests/browser/nineBatches20261114.spec.mjs`
- `client/tests/financialReceipt20261114.node.test.mjs`
- `client/tests/imageUploads20261114.node.test.mjs`
- `client/tests/inventoryBulkEndpointWiring.node.test.mjs`
- `client/tests/notificationDestinationService.node.test.mjs`
- `client/tests/partialPayment20261114.node.test.mjs`
- `server/tests/batch79/promotionImage.node.cjs`
- `server/tests/billing/branchBillingSettings20261114.node.cjs`
- `server/tests/billing/centralCalculation20261114.node.cjs`
- `server/tests/billing/doctorFee20261114.node.cjs`
- `server/tests/billing/financialReport20261114.node.cjs`
- `server/tests/billing/financialSnapshots20261114.node.cjs`
- `server/tests/billing/serviceConsumableCrossClinic.node.test.cjs`
- `server/tests/billing/taxPolicy20261114.node.cjs`
- `server/tests/checkouts/reopen-editing.node.cjs`
- `server/tests/consultations/clinicalSafety.node.cjs`
- `server/tests/consultations/recommendedFollowup20261114.node.cjs`
- `server/tests/deployment/migrationRunner.node.cjs`
- `server/tests/fix18BillingNormalizeIntegration.node.cjs`
- `server/tests/guestAppointmentLookup20261112.node.cjs`
- `server/tests/guestPromotions20261112.node.cjs`
- `server/tests/helpers/billingFixture.cjs`
- `server/tests/security/clinicalUploadStatus.test.js`
- `server/tests/security/cloudinarySignature.test.js`
- `server/tests/security/consultationWorkflowUx20260930.test.js`
- `server/tests/security/discountProofSecurity20260930.test.js`
- `server/tests/security/uploadSecurityIntegrity.test.js`
- `server/tests/serviceCatalog20261102.node.test.cjs`
- `server/tests/serviceCustomization.node.test.cjs`
- `server/tests/sharedServiceInventory20261112.node.cjs`

## QA evidence

- `QA_REPORT/nine-batches-2026-11-14/RESULTS.md`: per-batch implementation and migration instructions.
- `TEST_RESULTS.md`: final check totals and reproduction commands.
- `REGRESSION_FAILURES.md` / `regression-comparison.json`: complete baseline comparison and remaining failures.
- `browser-results.json`, `upload-security.json`, `partial-payment-receipt.pdf`, `patient-followup-booking.png`: synthetic browser/security evidence.
- Guarded suite/browser runners and raw test logs (logs are ignored by Git). Temporary baseline checkout, archive and dependency junctions were removed.
