# CARAIT Clinic Responsive UI QA Report

**Audit date:** 2026-10-20  
**Repository:** current `CAPSTONE` checkout  
**Browser target:** local Vite app; no production browser session used

## Summary

The notification bell can overflow the left edge on phones because the bell sits before other right-aligned header actions. At 320px, the Patient/Doctor header layout places the bell's right edge at about 164px; the old 294px panel therefore started about 130px off-screen. The Staff layout has the same issue, with an approximately 86px overflow.

The panel now renders in a body portal and calculates its position from the bell and the visible viewport. It keeps 12px side margins, moves above the bell when that gives more room, responds to resize/scroll/keyboard viewport changes, and scrolls its notification list when space is short. It also closes on outside pointer input and Escape, restores focus on Escape, wraps long text, and exposes dialog semantics. Notification queries, unread counts, mutations, and link navigation remain in place.

The source-derived placement regression tests and the existing client Node tests pass. A production build passes, and lint reports no errors. **Rendered UI validation remains BLOCKED.** Chrome and Edge are installed, but the available headless Chrome DevTools target exited when a page was opened; the screenshot attempt produced no image. No screenshots or visual passes are claimed. Authenticated page access also lacks synthetic QA accounts and a disposable database, as recorded in the previous QA report.

No production data was read or modified for this audit. Nothing was pushed or deployed.

## A. Review of previous changes

- The working tree was clean at the start. The latest commit was `14862b2` (`fix: update Cloudflare proxy timeout to 90 seconds and improve error handling in dashboard sections`).
- Read `docs/CARAIT_FULL_SYSTEM_QA_20261020.md` and reviewed the current route tree, portal layouts, notification bell, shared modal, confirmation dialog, toast provider, and shared Super Admin modal styles.
- The earlier dashboard partial-load helpers, selected-branch transaction filters, doctor availability handling, proxy timeout, and Staff permission changes remain in the checkout. This audit changed only the notification component and added its position helper and regression tests.
- The existing Dashboard and analytics client regressions passed in the client test run below. The server transaction regression was not rerun because this audit changed no backend files. Neither Dashboard nor Transactions was rendered in a browser, so visual behavior is unverified.
- `NotificationBell` is rendered in Patient, Doctor, and Staff layouts. `AdminLayout` renders it only when no branch object is present; the registered Branch Admin and selected-branch routes supply a branch, so they do not show the bell. The Super Admin shell is separate and does not currently render `NotificationBell`.

## B. Confirmed responsive defect and correction

| Route / context | Viewport | Affected element | Finding and cause | Correction | Evidence |
|---|---:|---|---|---|---|
| `/patient` and PatientLayout routes; same shared bell in `/doctor` and `/staff` layouts | 320px | Notification panel | The Patient/Doctor header places the 40px bell before theme, settings, and logout actions. With 16px horizontal header padding, its right edge is about 164px. The former `right: 0; width: 20rem; max-width: 92vw` panel was about 294px wide and started at about -130px. Staff's shorter action group still produced about -86px overflow. | Portal to `document.body`; clamp to the visual viewport with 12px margins; use viewport width; reposition above/below based on available height; bound panel height and scroll the list. | Source-derived geometry tests reproduce the legacy negative positions and verify corrected bounds. Screenshot evidence is **BLOCKED** because the browser renderer would not stay open. |
| Patient/Doctor/Staff shared bell | 320–430px and short landscape | Long notification items and panel dismissal | The old panel had no viewport collision handling, no outside-click/Escape dismissal, and no explicit long-string wrapping. | Added visual viewport resize/scroll listeners, outside-pointer and Escape handling, focus return, accessible dialog labeling, long-string wrapping, and a contained scrolling list. | Source-contract and positioning tests pass. Rendered interaction and screenshot evidence are **BLOCKED**. |

No other visual defect is marked confirmed. Shared modals, confirmation dialogs, toasts, and portal navigation were reviewed at source level only; their rendered behavior remains unverified.

## C. Complete registered page coverage

Routes below were enumerated from `client/src/App.jsx`. Each row is **BLOCKED** for 320–430px, tablet, and desktop because no usable browser render was obtained. These statuses do not imply that the pages fail; they mean the requested visual and interaction checks did not run.

| Role | Page and registered routes | 320–430px | Tablet | Desktop | Issue / status |
|---|---|---|---|---|---|
| Public | Marketing shell: `/` (includes Home, Services, Doctors, About, Contact and booking navigation), `/privacy-policy`, `/terms` | BLOCKED | BLOCKED | BLOCKED | No rendered inspection. |
| Public | News and unsubscribe: `/news`, `/news/:branchId/:slug`, `/unsubscribe` | BLOCKED | BLOCKED | BLOCKED | No rendered inspection. |
| Patient | Login and account flows: `/login`, `/patient/login`, `/patient/register`, `/patient/forgot-password`, `/patient/reset-password` | BLOCKED | BLOCKED | BLOCKED | No rendered inspection or auth workflow. |
| Patient | Portal: `/patient`, `/patient/doctors`, `/patient/book`, `/patient/appointments`, `/patient/reschedule-appointment`, `/patient/history`, `/patient/settings`, `/patient/change-password` | BLOCKED | BLOCKED | BLOCKED | No authenticated render. Notification overflow fix applies to the shared PatientLayout, but no visual pass is claimed. |
| Staff | Login and password flows: `/staff/login`, `/staff/change-password-required`, `/staff/forgot-password`, `/staff/reset-password` | BLOCKED | BLOCKED | BLOCKED | No rendered inspection. |
| Staff | Home and operations: `/staff`, `/staff/appointments`, `/staff/walkin`, `/staff/patient-records`, `/staff/doctor-schedules`, `/staff/accounts` | BLOCKED | BLOCKED | BLOCKED | No authenticated render; bell geometry covered by unit tests only. |
| Staff | Billing: `/staff/checkout`, `/staff/checkout/:billingId`, `/staff/billing` | BLOCKED | BLOCKED | BLOCKED | No rendered inspection or workflow. |
| Staff | Inventory and supply: `/staff/inventory`, `/staff/supply-requests` | BLOCKED | BLOCKED | BLOCKED | No rendered inspection. |
| Staff | System setup and billing setup: `/staff/system-setup`, `/staff/system-setup/billing`, `/staff/system-setup/billing/services`, `/staff/system-setup/billing/services/new`, `/staff/system-setup/billing/services/:serviceId/edit`, `/staff/system-setup/billing/payment-methods`, `/staff/system-setup/billing/discounts`, `/staff/system-setup/billing/receipt` | BLOCKED | BLOCKED | BLOCKED | No rendered inspection. |
| Staff | Reports, audit, settings: `/staff/reports`, `/staff/audit-logs`, `/staff/audit-logs/archive`, `/staff/audit-logs/archive/:archiveId`, `/staff/settings`, `/staff/change-password` | BLOCKED | BLOCKED | BLOCKED | No rendered inspection. |
| Staff | Legacy permission-gated page: `/staff/landingpage` | BLOCKED | BLOCKED | BLOCKED | Route remains guarded; the Staff `landing_page` permission was removed in the earlier QA fix. Direct-route behavior was not rendered. |
| Doctor | Login and password flows: `/doctor/login`, `/doctor/change-password-required`, `/doctor/forgot-password`, `/doctor/reset-password` | BLOCKED | BLOCKED | BLOCKED | No rendered inspection. |
| Doctor | Portal: `/doctor`, `/doctor/appointments`, `/doctor/daily-appointments` (redirect), `/doctor/consultation`, `/doctor/consultation-history`, `/doctor/request`, `/doctor/request/stock-transfer`, `/doctor/schedule`, `/doctor/settings`, `/doctor/change-password` | BLOCKED | BLOCKED | BLOCKED | No authenticated render; bell geometry covered by unit tests only. |
| Branch Admin | Login and password flows: `/admin/login`, `/admin/forgot-password`, `/admin/reset-password` | BLOCKED | BLOCKED | BLOCKED | No rendered inspection. |
| Branch Admin | Dashboard, appointments, patients, schedules: `/admin`, `/admin/appointments`, `/admin/patient-records`, `/admin/doctor-schedules` | BLOCKED | BLOCKED | BLOCKED | No authenticated render. The selected-branch layout does not show the bell. |
| Branch Admin | Billing and checkout: `/admin/billing`, `/admin/billing/checkout/:billingId`, `/admin/billing/transactions`, `/admin/billing/transactions/:id`, `/admin/billing/approvals`, `/admin/billing/reconciliation` | BLOCKED | BLOCKED | BLOCKED | No rendered inspection or workflow. |
| Branch Admin | Accounts, inventory, transfers, announcements: `/admin/inventory`, `/admin/supply-requests`, `/admin/accounts`, `/admin/staff-accounts`, `/admin/doctor-accounts`, `/admin/announcements` | BLOCKED | BLOCKED | BLOCKED | No rendered inspection. |
| Branch Admin | Setup and payment configuration: `/admin/system-setup`, `/admin/system-setup/billing`, `/admin/system-setup/billing/services`, `/admin/system-setup/billing/services/new`, `/admin/system-setup/billing/services/:serviceId/edit`, `/admin/system-setup/billing/payment-methods`, `/admin/system-setup/billing/discounts`, `/admin/system-setup/billing/receipt` | BLOCKED | BLOCKED | BLOCKED | No rendered inspection. |
| Branch Admin | Reports, audit, settings: `/admin/reports`, `/admin/audit-logs`, `/admin/audit-logs/archive`, `/admin/audit-logs/archive/:archiveId`, `/admin/settings`, `/admin/change-password` | BLOCKED | BLOCKED | BLOCKED | No rendered inspection. |
| Super Admin | Login and recovery: `/superadmin/login`, `/superadmin/forgot-password` | BLOCKED | BLOCKED | BLOCKED | No rendered inspection. |
| Super Admin | Organization pages: `/superadmin`, `/superadmin/branches`, `/superadmin/inventory`, `/superadmin/accounts`, `/superadmin/reports`, `/superadmin/audit-logs`, `/superadmin/landingpage`, `/superadmin/settings`, `/superadmin/change-password` | BLOCKED | BLOCKED | BLOCKED | No authenticated render. Super Admin shell currently does not use `NotificationBell`. |
| Super Admin | Selected-branch workspace: `/superadmin/branches/:branchId`, `/superadmin/branches/:branchId/appointments`, `/superadmin/branches/:branchId/patient-records`, `/superadmin/branches/:branchId/doctor-schedules`, `/superadmin/branches/:branchId/billing`, `/superadmin/branches/:branchId/billing/checkout/:billingId`, `/superadmin/branches/:branchId/billing/transactions`, `/superadmin/branches/:branchId/billing/transactions/:id`, `/superadmin/branches/:branchId/billing/approvals`, `/superadmin/branches/:branchId/billing/reconciliation` | BLOCKED | BLOCKED | BLOCKED | No authenticated render. Dashboard and Transactions visual behavior is unverified. |
| Super Admin | Selected-branch workspace continued: `/superadmin/branches/:branchId/inventory`, `/superadmin/branches/:branchId/supply-requests`, `/superadmin/branches/:branchId/accounts`, `/superadmin/branches/:branchId/staff-accounts`, `/superadmin/branches/:branchId/doctor-accounts`, `/superadmin/branches/:branchId/system-setup`, `/superadmin/branches/:branchId/announcements`, `/superadmin/branches/:branchId/system-setup/billing`, `/superadmin/branches/:branchId/system-setup/billing/services`, `/superadmin/branches/:branchId/system-setup/billing/services/new`, `/superadmin/branches/:branchId/system-setup/billing/services/:serviceId/edit`, `/superadmin/branches/:branchId/system-setup/billing/payment-methods`, `/superadmin/branches/:branchId/system-setup/billing/discounts`, `/superadmin/branches/:branchId/system-setup/billing/receipt`, `/superadmin/branches/:branchId/reports`, `/superadmin/branches/:branchId/audit-logs`, `/superadmin/branches/:branchId/audit-logs/archive`, `/superadmin/branches/:branchId/audit-logs/archive/:archiveId`, `/superadmin/branches/:branchId/settings`, `/superadmin/branches/:branchId/change-password` | BLOCKED | BLOCKED | BLOCKED | No authenticated render. |
| Display | Queue display: `/display/queue`; unknown paths redirect to `/` | BLOCKED | BLOCKED | BLOCKED | No rendered inspection. |

## D. Changed files

| File | Reason |
|---|---|
| `client/src/components/NotificationBell.jsx` | Portal placement, viewport/keyboard-aware positioning, outside and Escape dismissal, focus handling, accessible dialog semantics, wrapping, and bounded scrolling. Existing query and mutation behavior stays in place. |
| `client/src/components/notificationPopoverPosition.mjs` | Pure viewport collision and placement calculation shared by the component and geometry tests. |
| `client/tests/notificationPopoverPosition.node.test.mjs` | Regression cases for all required widths, phone header action groups, visual viewport offsets, short landscape, and above/below placement. |
| `client/tests/notificationBellResponsive.node.test.mjs` | Source-contract checks for portal rendering, viewport listeners, dismissal, accessible state, text wrapping, and scrolling. |
| `docs/CARAIT_RESPONSIVE_UI_QA_20261020.md` | This audit report. |

## E. Test evidence

| Check | Result |
|---|---|
| Notification position and source-contract tests | PASS — 10 focused tests across phone/tablet/desktop widths and short landscape geometry. |
| `node --test` in `client` | PASS — 39 tests. Includes the existing Dashboard and Super Admin analytics regressions. |
| `npm.cmd run lint` in `client` | PASS — 0 errors; 14 existing warnings in unchanged files. |
| `npm.cmd run build` in `client` | PASS — 458 modules. Existing large-bundle warning remains (about 2.09 MB minified JS). |
| `git diff --check` | PASS — no whitespace errors; Git reported its normal LF/CRLF conversion notice. |
| Browser sizes in the request (320, 360, 375, 390, 414, 430, 768, 1024, 1280, 1440, 1920px; short landscape) | BLOCKED — no usable browser target. The position helper's geometry tests cover the listed widths, but these are not rendered-page checks. |
| Browser keyboard, pointer, rotation, mobile keyboard, dark mode, 200% zoom, console, and screenshots | BLOCKED — no stable browser session. No screenshots were captured. |
| Authenticated roles and workflows | BLOCKED — no synthetic role accounts or disposable database; no protected production workflow was attempted. |

Chrome 155.0.8059.80 and Edge 155.0.4283.62 were present. Chrome's DevTools version endpoint responded, but the page target exited during local page navigation/inspection. A headless screenshot attempt exited without writing an image. `client` has no Playwright or Puppeteer dependency. No screenshot artifact was captured.

## F. Remaining blockers

- All route-family visual results remain **BLOCKED** until a stable browser automation session and authenticated synthetic accounts are available. The layout source and mathematical placement tests are not a substitute for browser rendering.
- No confirmed screenshot of the legacy or corrected panel exists because the browser could not render a page. The mobile overflow is reproduced by the old header/panel geometry in regression tests, and the corrected placement passes those tests.
- The mobile keyboard, touch behavior, browser zoom, dark mode, modals/toasts over real portal pages, responsive tables/charts, and full Dashboard/Transactions workflows still need rendered verification.
- No production records, authentication settings, backend code, payments, or database schema were changed.
