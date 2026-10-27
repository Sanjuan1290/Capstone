# CARAIT Clinic — Batch 1 and Batch 2 Code Patch

**Prepared:** October 22, 2026 (Asia/Manila)  
**Exact source baseline:** `AllCodes(20261022-082938).txt`, a flattened October 22 source export.  
**Status:** Local implementation. **Not pushed, deployed or live-database-tested.**

## Scope

### Batch 1 — portal authentication and service navigation

- Added `portalBaseForPath` and `canManageServicePricingAtPath` in the existing branch navigation helper. `/superadmin/branches/:branchId/...` stays in that exact branch when opening or leaving Services & Pricing, service categories, and Billing Setup tabs. `/admin` and authorized `/staff` views keep their existing routes.
- Updated Service editor, Service catalog, System Setup, System Setup tabs, and Billing Setup tabs to use the same resolver. Admin API paths are already scoped by the existing service layer; this patch does **not** weaken backend authorization.
- Added a guest-only route guard for `/login`, `/patient/login`, `/patient/register`, `/staff/login`, `/doctor/login`, `/admin/login`, and `/superadmin/login`. Redirects authenticated users to their respective portal only after the existing `AuthContext` has checked cookies. Staff, Doctor and Branch Admin first-login password-change requirements remain respected.
- Updated the outdated source-level System Setup test to expect the fixed branch-aware resolver.

### Batch 2 — booking readiness and patient-safe error handling

- Replaced correlated SQL aggregates referencing a `UNION ALL` derived-clinic table with four grouped, parameterized SQL queries. Those queries count active doctors, doctors with active schedules, active services, and active custom visit reasons separately and scope by the authorized branch ID. `all`-clinic services/reasons count toward both clinic types.
- Added explicit `CLINIC_TYPE_DISABLED` diagnostics when a branch does not offer Medical or Dermatology bookings, and corrected `all_bookable` so it reflects the final enabled/disabled statuses.
- Booking readiness failures now preserve patient selections and display a useful retry message rather than resetting the form. Stale asynchronous results are ignored after changing branches; the next/confirm actions are disabled until readiness succeeds.
- Added a synchronous guard against duplicate submission from rapid clicks while `bookAppointment` is pending.

## Changed files

- `client/src/App.jsx`
- `client/src/components/GuestOnlyRoute.jsx` (new)
- `client/src/utils/guestNavigation.mjs` (new)
- `client/src/utils/branchPortalPath.mjs`
- `client/src/pages/adminPage/Admin_BillingServiceForm.jsx`
- `client/src/pages/adminPage/Admin_BillingCatalog.jsx`
- `client/src/pages/adminPage/Admin_SystemSetup.jsx`
- `client/src/components/system/SystemSetupTabs.jsx`
- `client/src/components/billing/BillingSetupNav.jsx`
- `client/src/pages/patientPage/BookAppointment.jsx`
- `server/controllers/patient.controller.js`
- `server/utils/bookingReadiness.js`
- `server/tests/security/uiRuntimeRegressions.test.js`
- `client/tests/batch12PortalBooking.node.test.mjs` (new)
- `server/tests/booking/batch12Readiness.node.cjs` (new)

## Testing performed

| Check | Actual result |
| --- | --- |
| Frontend Node tests + new Booking Readiness Node tests | **57 passed, 0 failed** |
| Server `npm run verify:source` | **PASS — 418 source files and 1,023 relative imports resolved** |
| TypeScript JSX parser on 8 touched JSX files | **PASS — 0 syntax errors** |
| Patch apply to clean uploaded source baseline | **PASS** |
| Full backend `npm run test:node` | **228 PASS / 12 FAIL** — dependencies missing (`mysql2/promise`, `express`), a historical migration checksum mismatch in the export, and a pre-existing Dashboard text-assertion mismatch |
| Client production build | **Not run successfully** — `vite` unavailable (no installed client dependencies) |
| Real browser/mobile UI, login MFA session, TiDB SQL | **Not tested** |
| Live PayMongo / billing / patient data | **Not touched or tested** |

**Important:** These tests validate code-level behavior and mocked contracts; they do not prove the production `booking-readiness` 500 root cause has been resolved. SQL portability is improved but must be validated against a disposable TiDB Cloud database and matching production schema. The underlying error may also involve missing/incorrect live migrations or a separate service failure.

## Apply to your original repository (NOT to a ZIP of only the text export)

1. Create a Git branch from the exact deployed/target revision and take a source backup. The user's flattened export is **not** a full Git checkout or a source of actual image assets.
2. Inspect the patch and run `git apply --check CARAIT_BATCH_1_2_20261022.patch` against the appropriate source revision. If the application has changed since the export, reconcile conflicts manually, rather than forcing the patch.
3. Apply using `git apply CARAIT_BATCH_1_2_20261022.patch`, or copy only the changed files from `CARAIT_BATCH_1_2_20261022.zip`. **Do not replace the full repository or its binary assets.**
4. On a QA checkout with dependencies installed: `cd server && npm ci && npm run verify:source && npm run test:node && npm test`; `cd client && npm ci && npm run lint && npm run build && node --test tests/*.node.test.mjs`.
5. In a *disposable staging database* matching TiDB and production schema, exercise authenticated `/api/patient/booking-readiness?branch_id=<id>` with active/inactive doctors, schedules, services, clinic types, and at least two branches. Inspect Render-style logs if a 500 remains.
6. Browser-test service create/edit/delete in `/superadmin/branches/1` and `/superadmin/branches/2`, and in `/admin`. Verify no redirect to `/admin/login`, no accidental editing outside the current branch, and no access by unauthorized Staff.
7. Browser-test each role's login redirect, forced password change, MFA, expired cookies, logout and account recovery. Then book, cancel and reschedule a synthetic patient appointment, test fully booked slots and simultaneous bookings, and verify doctor/staff/admin views.
8. Only when all required checks pass, deploy backend and frontend versions together; inspect Cloudflare and Render deploy commits, and re-test via the real domain.

## Non-goals and safety

- No database migration or reset is included in this patch.
- No inventory, checkout, receipt, PayMongo or production patient data was changed.
- Doctor Availability UI redesign, mobile scanner, item modal, promotions, branch-copy setup and general SSE live-update rollout belong to later batches and were **not** included here.
- If the booking-readiness request still returns 500 after deploying the tested changes, obtain the sanitized Render log, request ID and SQL exception before making further changes.


