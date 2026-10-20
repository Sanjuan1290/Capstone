# CARAIT Clinic System — Full-System QA Report

**Audit date:** 2026-10-20
**Repository:** current `CAPSTONE` checkout
**Production targets:** `caraitclinic.com`, `capstone-rx93.onrender.com`

## Executive summary

The deployed public shell and safe public API endpoints responded. Authenticated production pages could not be exercised because no QA accounts or browser automation session were available. The production GET checks used no cookies and caused no writes.

Four UI/API contract defects and one conditional proxy timeout defect were confirmed in source and corrected locally:

1. Organization-wide Super Admin analytics used one `Promise.all`, so any analytics endpoint failure hid all dashboard and report sections. The three sections now load and report errors independently; dependent totals and CSV export remain unavailable when their source data failed.
2. Selected-branch billing ignored `payment_method` and `date_basis`, and returned branch-wide summaries unrelated to the selected filters. These filters now affect the row list, count, pagination, and summary.
3. The branch dashboard expected doctor records shaped as `name`/`on-duty`, but the branch API returns `full_name`/`available` or `inactive`. The dashboard now uses that contract and labels active doctors as available.
4. The organization and branch dashboard `Promise.all` calls hid successful sections when a sibling request failed. Both dashboards now isolate request failures and show unavailable values/errors instead of false zeroes.
5. The Cloudflare proxy had a 30-second upstream abort. Render documents that a free web service may sleep after 15 idle minutes and take about one minute to restart. The proxy now has a bounded 90-second timeout. The live Render plan and a cold-start request were not observable, so this finding is conditional on the service using the Free plan. ([Render Free plan behavior](https://render.com/docs/free); [Cloudflare Worker request limits](https://developers.cloudflare.com/workers/platform/limits/))

An additional permission mismatch was corrected: Staff could be granted a Landing Page permission even though the staff API rejected that operation and global website content is managed through Super Admin. The Staff option/navigation/fallback and unsupported stub route were removed; the direct page remains behind the permission gate.

**Readiness:** code-level regressions and builds pass. Full production readiness remains **BLOCKED** because authenticated role workflows, actual rendered UI, and a disposable database were unavailable. Changes are local only; nothing was pushed or deployed, so production continues to run its currently deployed code.

## Production-safe smoke checks

All requests below were `GET` requests without cookies or credentials.

| Request | Result | What this proves |
|---|---:|---|
| `https://caraitclinic.com/` | 200, HTML | Static app shell is served; React rendering was not verified. |
| `https://caraitclinic.com/superadmin` | 200, HTML | Nested SPA fallback works; authenticated dashboard was not verified. |
| `https://caraitclinic.com/superadmin/branches/1/billing/transactions` | 200, HTML | Nested transaction URL fallback works; authenticated page/API was not verified. |
| `https://caraitclinic.com/api/auth/landing-page` | 200, JSON | Cloudflare API proxy and public landing-content read responded. |
| `GET /api/branches/analytics/all?...` without auth | 401, JSON | Protected analytics rejects anonymous requests as expected. |
| `GET /api/branches/workspace/1/legacy/dashboard` without auth | 401, JSON | Protected workspace rejects anonymous requests before returning branch data. |
| `https://capstone-rx93.onrender.com/api/health` | 200, JSON | Render process health responded. |
| `https://capstone-rx93.onrender.com/api/ready` | 200, JSON | Readiness and its read-only `SELECT 1` check responded. |

No production response other than the expected anonymous 401s was observed during these checks. They do not establish authenticated page correctness or rule out errors on protected API requests.

## Confirmed findings and fixes

| Severity | Reproduction / root cause | Fix | Regression evidence |
|---|---|---|---|
| P2 | Reject any one of `/analytics/all`, `/analytics/trends`, or `/analytics/readiness` in the organization dashboard. `useOverviewData` previously rejected the entire `Promise.all` and rendered no dashboard/report data. | Added `loadOverviewSections` with independent result validation/errors. Dashboard and reports render successful sections and suppress KPIs/export when source rows are unavailable. | `client/tests/overviewData.node.test.mjs` (4 tests), updated Super Admin design test; build passes. |
| P2 | Send `payment_method`, `date_basis=payment`, or `date_basis=finalized` to selected-branch `/billing`. `readBills` only filtered visit dates; summary ignored all request filters. | Added completed-payment `EXISTS` filters, visit/payment/finalized date predicates, and reuse of the complete filter for summary/count/rows. Payment method and payment dates match the same completed payment. Pagination stays independent of summary. The Transactions screen has no export action; the separate Reports CSV uses filtered report rows. | `server/tests/branching/branchReadContracts.node.cjs` covers payment method/date coupling, visit/finalized dates, counts, and summary args. |
| P2 | Load the branch dashboard with doctor API results `{full_name,status:'available'}` / `{full_name,status:'inactive'}`. UI counted only `on-duty`, displayed `doc.name`, and showed unavailable done/patient fields. | Added doctor status/name helpers; shows active count and `Available`/`Inactive` state based on the API response. | `client/tests/dashboardDoctors.node.test.mjs` (2 tests); client suite/build pass. |
| P2 | Reject either branch dashboard request (`/dashboard` or today’s `/appointments`). A single `Promise.all` error discarded both responses; initial empty arrays also made failures look like zero records. | Added independent loader and section errors. Successful stats/appointments stay visible; failed sections show retry and unavailable values. | `client/tests/dashboardData.node.test.mjs` (3 tests); updated branch dashboard contract test. |
| P2, conditional | If Render is Free and has slept, wait for a cold request. The proxy aborted after 30 seconds, shorter than Render’s documented approximate one-minute wake time. Live plan/cold start were unavailable. | Raised the finite proxy timeout to 90 seconds. Client disconnect cancellation and the JSON 504 response remain. No automatic write retries were added. | `client/tests/cloudflareProxy.node.test.mjs` includes bounded-timeout coverage (5 tests total). |
| P2 | Grant Staff `landing_page` and visit `/staff/landingpage`. The navigation/permission picker exposed it, while the endpoint used `safeSettingsWriteUnavailable` and returned 403; this is global Super Admin content. | Removed the Staff permission from client/server catalogs, navigation, and landing fallback, and removed the unsupported API stub. The permission gate continues to restrict the direct URL. | `server/tests/security/staffPermissions.test.js`; full server suites pass. |

### Other identified behavior

- **OTP cooldown and TiDB timezone:** the current `createSecurityCode` checks elapsed time using database-side `TIMESTAMPDIFF(SECOND, COALESCE(last_sent_at, created_at), NOW())`; both timestamps and `NOW()` are evaluated by TiDB. Administrator MFA and the existing rate limiters remain enabled. The targeted `accountSecurityPurpose.test.js` passes (3 tests); OTP recovery is also covered by the Node regression suite.
- **Unsupported branch legacy routes:** `branches.router.js` retains explicit JSON 501 fallbacks for unregistered `/my/legacy/*` and `/workspace/:branchId/legacy/*` operations. They remain fail-closed; no fake success was added. The reviewed active dashboard and billing paths have explicit handlers. No authenticated request reached the fallback, so this is not a production 501 verification.
- **Branch Admin landing page:** there is no `/admin/landingpage` route in the current route tree. Global website editing is Super Admin-only. This was not added as a branch feature because it would expose a global operation through a branch role.
- **Retries/loading:** the proxy returns a bounded 504 on upstream timeout and forwards client disconnect cancellation. Existing UI modules expose loading/error/retry states. React Query is configured for one query retry and zero mutation retries; no generic automatic retries were added to write requests.
- **Email/payments/security:** source and existing tests enforce Resend HTTPS as the outbound email provider and PayMongo TEST mode only. No email or payment was attempted. Branch scoping and role/session protections were exercised by the existing test suites, not by authenticated production sessions.

## Complete module coverage

For every protected page below, **Initial Load, API, UI, Workflow, and Result are BLOCKED** for authenticated execution: no synthetic QA accounts, browser automation runtime, or disposable connected database were available. Source-level review and mocked tests are reported separately and do not count as UI passes. The public endpoint and HTTP shell results above are not treated as rendered-page passes.

| Role | Module/Page | Initial Load | API | UI | Workflow | Result |
|---|---|---|---|---|---|---|
| Super Admin | Organization dashboard, date filters, readiness, branch performance | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Super Admin | Reports, branch filter, trends, CSV export | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Super Admin | Branch list, create/edit, activation/deactivation, readiness details | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Super Admin | Consolidated inventory | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Super Admin | Admin/team accounts, permissions, reassignment | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Super Admin | Global audit logs | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Super Admin | Global landing page, settings, password/security | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Super Admin | Selected-branch dashboard and appointment queue | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Super Admin | Selected-branch appointments, patient records, doctor accounts/schedules, staff accounts | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Super Admin | Selected-branch billing, checkout, transactions/search/filters/detail, payment actions/receipts | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Super Admin | Selected-branch billing approvals, payment methods, discounts, reconciliation | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Super Admin | Selected-branch inventory, batches, transfers, reports | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Super Admin | Selected-branch announcements, system setup, clinic settings, audit/archive, account settings | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Branch Admin | Dashboard and doctor availability | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Branch Admin | Appointments, patient records, queue/check-in | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Branch Admin | Doctor/staff accounts and doctor schedules | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Branch Admin | Billing, checkout, transaction filters/detail, refunds/voids, receipts | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Branch Admin | Payment methods, discounts, approvals, reconciliation | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Branch Admin | Inventory, stock batches, supply transfers | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Branch Admin | Announcements/promotions, system setup, clinic settings/booking policy | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Branch Admin | Reports/exports, audit logs/archives, user settings | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Branch Admin | Landing-page management | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Staff | Dashboard | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Staff | Appointments, walk-in queue, patient records | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Staff | Doctor schedules and patient access | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Staff | Billing records, checkout, payment collection | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Staff | Inventory, supply requests/transfers | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Staff | Accounts directory and system setup permissions | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Staff | Reports and audit logs | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Staff | Landing-page management (global capability removed) | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Doctor | Dashboard and appointments | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Doctor | Consultation records, autosave, finalization, history | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Doctor | Schedule, inventory requests, clinical image upload, patient access | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Patient | Registration, login, email verification, password recovery | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Patient | Dashboard, doctor availability, booking | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Patient | Appointment history, reschedule, cancellation | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Patient | Profile, notifications, password/security | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Public | Homepage, About, Services, Doctors, Contact, CTAs/navigation | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Public | News/offers list and detail | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Public | Responsive layout, SEO metadata, structured data, sitemap | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Public | Landing-content API GET | BLOCKED | PASS (HTTP 200 JSON) | BLOCKED | NOT TESTED | BLOCKED |

## API, database, and security audit

- Safe production response codes observed: 200 for public shell/content and backend health/readiness; 401 for protected analytics/workspace reads without credentials, as expected.
- No production 400/403/404/429/500/501/502/503/504 was observed. Protected authenticated error cases, SQL behavior against production data, and all role response shapes remain unverified.
- The selected-branch transaction regression uses a fake DB executor and validates parameterized SQL, matching filters and branch scope. It is not a TiDB integration test. `/api/ready` ran only its read-only `SELECT 1` check.
- No database migration, reset, production write, real patient record, email, or payment was used.
- PayMongo source rejects live mode/keys; email transport tests assert Resend HTTPS use. MFA, secure sessions, branch scoping, audit code, and role guards were not disabled.

## Test results

| Command | Result |
|---|---|
| `npm.cmd run verify:source` (server) | PASS — 406 source files; 1,001 relative imports resolved. |
| `npm.cmd run test:node` (server) | PASS — 206 tests. |
| `npm test -- --reporter=dot` (server; includes `pretest` source verification) | PASS — 77 files; 262 tests. |
| `npm.cmd test -- tests/security/accountSecurityPurpose.test.js --reporter=dot` | PASS — 1 file; 3 OTP cooldown/security tests. |
| `npm run test:hosting` (client) | PASS — 5 tests, including proxy timeout. |
| `npm run test:design` (client) | PASS — 8 tests. |
| `npm run test:autosave` (client) | PASS — 7 tests. |
| `node --test tests/overviewData.node.test.mjs tests/dashboardData.node.test.mjs tests/dashboardDoctors.node.test.mjs` (client) | PASS — 9 focused regressions. |
| `npm run lint` (client) | PASS — zero errors, 15 existing warnings outside the changed files. |
| `npm run build` (client) | PASS — Vite production build. Existing large-chunk warning (>500 kB) remains. |
| `git diff --check` | PASS — no whitespace errors. Git reported normal LF/CRLF conversion notices. |
| `npm ci` | NOT RUN — dependencies were already installed and no lockfiles changed; reinstalling would remove the working dependency tree and rely on registry access that is restricted here. |
| Browser E2E | BLOCKED — browser automation and synthetic authenticated accounts were unavailable. No E2E pass is claimed. |

### Git review

- `git status --short`: 14 modified tracked files and 7 untracked files (including this report).
- `git diff --stat`: 14 tracked files, 183 insertions, 62 deletions; Git does not include untracked files in this stat.
- `git diff --check`: passed. Git emitted only LF/CRLF conversion notices for modified source files.

## Changed files

**Modified:**

- `client/functions/api/[[path]].js`
- `client/src/components/layouts/StaffLayout.jsx`
- `client/src/config/staffPermissions.js`
- `client/src/pages/adminPage/Admin_Dashboard.jsx`
- `client/src/pages/staffPage/Staff_Home.jsx`
- `client/src/pages/superAdminPage/redesign/Overview.jsx`
- `client/tests/cloudflareProxy.node.test.mjs`
- `client/tests/superAdminDesign.node.test.mjs`
- `server/routers/branchOperationalReads.js`
- `server/routers/staff.router.js`
- `server/tests/branching/branchReadContracts.node.cjs`
- `server/tests/security/originalAdminPortalBranch20261009.node.cjs`
- `server/tests/security/staffPermissions.test.js`
- `server/utils/staffPermissions.js`

**Added:**

- `client/src/pages/adminPage/dashboardData.mjs`
- `client/src/pages/adminPage/dashboardDoctors.mjs`
- `client/src/pages/superAdminPage/redesign/overviewData.mjs`
- `client/tests/dashboardData.node.test.mjs`
- `client/tests/dashboardDoctors.node.test.mjs`
- `client/tests/overviewData.node.test.mjs`
- `docs/CARAIT_FULL_SYSTEM_QA_20261020.md`

## Remaining blockers

- Authenticated production UI and role workflows have not been exercised. A shell response or mocked test is not evidence that the rendered page works against live data.
- The backend’s Render compute plan and an actual cold wake were not observable; timeout correction addresses the documented Free-plan wake time but cannot prove that deployed plan’s behavior.
- The exact TiDB transactions SQL was not executed against a disposable QA database. No test credentials or isolated database were supplied.
- The branch 501 fallback still covers unregistered legacy operations by design. Any future operation needs a branch-safe handler before it is available to Branch Admin or Super Admin workspace users.
- All code changes remain local and require a separate review/deployment step before production behavior changes.
