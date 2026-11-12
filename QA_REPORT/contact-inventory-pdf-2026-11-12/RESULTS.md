# Appointment contacts, All Inventory Excel and Super Admin PDF reports

Date: 2026-11-12, Asia/Manila. Baseline: `866d0b2`.

## Completed corrections

1. **Appointment Phone / Email:** The branch appointment query joined `patients` but did not select the fields consumed by the review modal. It now returns `patient_phone` and `patient_email` from the saved patient record. The existing branch and date predicates remain. Both Branch Admin and Super Admin branch-workspace browser checks display the contact values. Optional email remains blank when the patient has no saved email; no contact information is invented or backfilled.
2. **All Inventory Excel:** Corrected OOXML ordering in both worksheets and the stylesheet. Auto-filters precede merged cells and conditional formatting; named cell styles precede differential styles. Added an explicit workbook view and removed characters forbidden in XML from exported text. The two styled sheets, literal barcodes, numeric prices, dates, filters and export of all matching records are preserved.
3. **Reports & Analytics:** Removed the central report page's CSV and Excel actions. Its single **Print / Save PDF** action loads all five report sections for the selected branch and dates, builds a dedicated A4 document, and opens its print dialog. Choose **Save as PDF** there, as in branch reports. It includes branch comparison, appointment summaries, financial adjustments, payment methods, doctors, services, promotions, inventory category values, usage, movements, stockrooms and report notes. Errors block incomplete exports and allow retry.

No database migration or data cleanup is needed. The All Inventory page retains its Excel export.

## Verified results

| Check | Actual result |
| --- | --- |
| Targeted backend tests: appointment contacts, report scope/metrics, Super Admin inventory export/overview and Staff route isolation | **22 passed, 0 failed** |
| Targeted frontend Node tests: workbook packaging/content, report export contract and PDF rendering/escaping | **11 passed, 0 failed** |
| Browser tests on the production frontend build | **6 passed, 0 failed**, headless Edge |
| Frontend production build | PASS, including **25/25** existing prebuild checks. Existing bundle-size warning remains. |
| Targeted ESLint | PASS, zero errors and warnings |
| Backend syntax and route smoke checks | PASS: **406** JavaScript modules; Staff route registration and charge-reduction route smoke test pass |
| Source graph | PASS: **675** source files, **1,550** relative imports resolved |
| Baseline All Inventory workbook, Microsoft Open XML SDK validator | **3 validation errors**: auto-filter position in both sheets and cell-style position |
| Corrected generated workbook, same validator | **0 validation errors** |
| Actual browser-downloaded workbook, same validator | **0 validation errors** |
| Browser workbook ZIP CRC integrity | PASS, all **7** package parts readable |

The workbook ordering matches the [Microsoft Open XML SDK schema](https://github.com/dotnet/Open-XML-SDK/blob/main/data/schemas/schemas_openxmlformats_org_spreadsheetml_2006_main.json). Validation used Microsoft's `DocumentFormat.OpenXml` 2.20.0, loaded only by the QA script; no application dependency was added.

Browser coverage:

- Guest appointment Phone / Email in both Admin and Super Admin branch review modals, using the corrected backend read handler with synthetic records.
- All Inventory downloads `.xlsx` with records beyond the visible page; its export request omits pagination parameters.
- Reports show a PDF-only export action on desktop and mobile.
- A selected branch and custom date range are retained across every report-section request and in the printable document. All Branches export is also covered.
- A failed financial section produces an error, prints no partial document and succeeds on retry.
- Real PDF artifacts are generated from the printable HTML using the browser's PDF engine.

Native Excel's interactive UI was not automated: COM activation is unavailable in this execution session. The corrected packages were validated with Microsoft's SDK and ZIP integrity checks. Hosted TiDB/Render/Cloudflare services and real patient data were not used for testing. A full repository-wide regression run was not performed; this report does not supersede the broader failures listed in the [previous QA report](../guest-directory-civil-status-2026-11-12/RESULTS.md).

## Changed application files

- `server/routers/branches.router.js`: return saved appointment contact fields.
- `client/src/utils/superAdminInventoryReport.mjs`: repair the workbook XML package.
- `client/src/pages/superAdminPage/redesign/ReportsPage.jsx`: PDF-only export, loading/error/retry flow and printable document.
- `client/src/pages/superAdminPage/redesign/reportPresentation.mjs`: share aggregate report-table data while preserving existing helper exports.
- `client/src/utils/superAdminReportPdf.mjs` (new): escaped printable HTML, PHP formatting, percentage formatting, repeated table headings, branch/date context and iframe printing.

Tests and support:

- `server/tests/appointmentContacts20261112.node.cjs` (new)
- `server/tests/helpers/appointmentContactsHarness.cjs` (new)
- `client/tests/superAdminAllInventoryExcel.node.test.mjs`
- `client/tests/superAdminReports20261105.node.test.mjs`
- `client/tests/superAdminReportPdf20261112.node.test.mjs` (new)
- `client/tests/fixtures/superAdminReports20261112.mjs` (new)
- `client/tests/browser/contactInventoryPdf20261112.spec.mjs` (new)
- This QA folder's report, runners, validator, sample generator and synthetic artifacts.

## Reviewable artifacts

- [Actual browser Excel download](all-inventory-browser.xlsx)
- [Generated Excel sample](inventory-corrected.xlsx)
- [Selected-branch PDF](super-admin-report-desktop.pdf)
- [All Branches PDF](super-admin-report-mobile.pdf)
- [PDF layout preview](pdf-preview-desktop.png)
- [Admin appointment contacts](appointment-contacts-admin.png)
- [Super Admin appointment contacts](appointment-contacts-superadmin.png)
- [Desktop report controls](report-actions-desktop.png)
- [Mobile report controls](report-actions-mobile.png)

These artifacts contain synthetic test data only.

## Reproduction

From the repository root:

```powershell
node --test server/tests/appointmentContacts20261112.node.cjs server/tests/branching/superAdminReports20261105.node.cjs server/tests/security/superAdminInventoryExport.node.cjs server/tests/security/superAdminInventoryOverview.node.cjs server/tests/branchIntegration/staffRouteIsolation.node.cjs
node --test client/tests/superAdminAllInventoryExcel.node.test.mjs client/tests/superAdminReports20261105.node.test.mjs client/tests/superAdminReportPdf20261112.node.test.mjs
node QA_REPORT/contact-inventory-pdf-2026-11-12/workbook-sample.mjs
node QA_REPORT/contact-inventory-pdf-2026-11-12/run-browser.cjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File QA_REPORT/contact-inventory-pdf-2026-11-12/validate-workbook.ps1 -Workbook all-inventory-browser.xlsx
```

The browser runner requires a current `client` production build (`npm.cmd run build`) and an installed supported browser. Run `npm.cmd run check:syntax` and `npm.cmd run verify:source` from `server`. The SDK validator expects the downloaded `documentformat.openxml.2.20.0.nupkg` in this folder's ignored `validation-deps/openxml.nupkg`; it extracts the `net46` assembly locally. Generated logs, SDK files and baseline-failure artifacts are ignored.

## Deployment

The requested changes pass their focused checks. **No commit, push or deployment was performed.** Render needs the updated backend to return appointment contacts; Cloudflare needs the rebuilt frontend for the corrected workbook and PDF reports. No production data, financial records, migration history or secrets were changed.
