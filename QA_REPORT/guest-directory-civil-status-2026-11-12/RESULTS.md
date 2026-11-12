# Guest booking, civil status removal and Patient Directory

Date: 2026-11-12 (Asia/Manila). Reviewed from commit `42496da`, with this report describing the working-tree corrections.

## Corrected behavior

- `/guest/book` imports `getClinicToday` again. Branch auto-selection and doctor availability load without the reported ReferenceError. The existing minimum age of 18 remains enforced.
- Civil status is removed from branch Patient Records → Personal Information, the profile completion form, the printed walk-in intake form and the privacy page's list of collected identifiers. The branch record query no longer selects this column. No column was dropped and no cleanup query was run.
- Super Admin Patient Directory includes registered accounts and online guest patients, including older guests identified by their appointment source. It supports Guest / Registered / Active / Banned filters, search, matching pagination totals, a guest count and guest appointment history.
- Guests have an explicit Guest label rather than an Active portal-account label. Ban controls remain available to registered accounts, including older activated walk-in records with credentials. Guest ban requests are rejected by the backend. Walk-in-only records remain in branch Patient Records.
- Directory endpoints remain Super Admin only. Patient, guest and branch Admin sessions cannot read the central directory. Passwords are never returned in directory responses.

## Actual validation results

| Check | Result |
| --- | --- |
| Frontend production build (`npm.cmd run build`) | PASS, including 25/25 prebuild contract checks. Non-blocking bundle-size/timing warnings remain. |
| Targeted ESLint on the six changed frontend source files | PASS, no warnings or errors. |
| Backend syntax and startup route checks (`npm.cmd run check:syntax`) | PASS: 404 JavaScript modules; Staff route registration and charge-reduction route smoke checks pass. This backend has no separate build script. |
| Backend source graph (`npm.cmd run verify:source`) | PASS: 672 source files, 1,548 relative imports resolved. |
| Directory authorization, filtering, history and branch patient-record tests | 24/24 PASS. |
| Guest booking and SMS-authorized appointment lookup regressions | 23/23 PASS. |
| Frontend guest validation, adult birthdate validation and printed intake tests | 11/11 PASS. |
| Browser tests against the production frontend build | 21/21 PASS in headless Edge, desktop and mobile layouts. |
| Additional existing regression tests | Six failures remain; see below. |

Browser coverage includes the exact missing-date-helper crash, completed guest booking, wrong OTP, changing mobile numbers, the three-per-day limit, idempotent retry after a lost response, booking recovery, quota exhaustion in another tab, appointment lookup/status refresh, OTP expiry, guest directory filters/search/history, registered account ban/unban and Personal Information without civil status.

The directory browser tests run the real Express router and authentication middleware through an isolated database fixture. Other browser APIs use synthetic responses. These checks do not establish production database connectivity, real SMS delivery or production SQL execution.

The existing guest-booking database fixture was updated to handle the contact-persistence read and returning-guest update already present in the repository. Browser fixtures were updated for the existing adult-birthdate field and current Additional Notes placeholder. Initial fixture failures were corrected before the final passing runs.

## Remaining existing regression failures

These files and their related product implementation were not changed by this task:

1. `server/tests/guestPromotions20261112.node.cjs`: **three failures**.
   - Anonymous/guest homepage promotion requests currently return offers; the test expects an empty list.
   - Public news list/detail SQL currently lacks the guest promotion exclusion expected by the fixture. Both the anonymous-news and registered-news tests fail when the fixture rejects that SQL. The resulting HTTP 500s are fixture assertion failures, not proof of production HTTP 500s.
   - These promotion-visibility checks remain unresolved; the separate browser test only verifies how the page handles a mocked access-denied response.
2. `server/tests/patients/batch6Birthdates.node.cjs`: **two failures**. Existing tests still expect infants/newborns to pass birthdate validation. The current implementation requires age 18 or older. The adult-only behavior was preserved; current frontend adult-boundary tests pass.
3. `client/tests/patientBookingFourStep.node.test.mjs`: **one failure**. Its source assertion expects unverified email to block booking. Current registered-patient booking makes email verification advisory instead.

After correcting the guest fixture, the expanded backend selection totals 55 passed / 5 failed, and frontend Node checks including prebuild total 40 passed / 1 failed. Browser checks add 21 passed / 0 failed. No full repository-wide test-suite pass is claimed.

## Changed files

Application source:

- `client/src/pages/patientPage/GuestBookAppointment.jsx`
- `client/src/components/ProfileCompletionPrompt.jsx`
- `client/src/components/patients/PatientRecordsPage.jsx`
- `client/src/pages/shared/PrivacyPolicys.jsx`
- `client/src/utils/printWalkInIntakeForm.js`
- `client/src/pages/superAdminPage/redesign/Patients.jsx`
- `server/utils/patientRecordView.js`
- `server/utils/superadminPatientDirectory.js`
- `server/routers/superadminPatients.router.js`

Tests and test support:

- `client/tests/browser/guestBooking20261112.spec.mjs`
- `client/tests/browser/patientDirectoryGuests20261112.spec.mjs` (new)
- `client/tests/patientCivilStatusRemoval20261112.node.test.mjs` (new)
- `server/tests/superadminPatientDirectory.node.test.cjs`
- `server/tests/guestPatientDirectory20261112.node.cjs` (new)
- `server/tests/helpers/patientDirectoryHarness.cjs` (new)
- `server/tests/helpers/guestBookingHarness.cjs`
- This QA folder: runner, Playwright configuration, report and synthetic screenshots. Generated logs/JSON/browser failure artifacts are ignored.

## Reproduction

From `client`:

```powershell
npm.cmd run build
node node_modules/eslint/bin/eslint.js src/pages/patientPage/GuestBookAppointment.jsx src/components/ProfileCompletionPrompt.jsx src/components/patients/PatientRecordsPage.jsx src/pages/shared/PrivacyPolicys.jsx src/pages/superAdminPage/redesign/Patients.jsx src/utils/printWalkInIntakeForm.js
```

From `server`:

```powershell
npm.cmd run check:syntax
npm.cmd run verify:source
```

From the repository root:

```powershell
node --test server/tests/guestPatientDirectory20261112.node.cjs server/tests/superadminPatientDirectory.node.test.cjs server/tests/patientRecords.node.test.cjs
node --test server/tests/guestBooking20261112.node.cjs server/tests/guestAppointmentLookup20261112.node.cjs
node --test client/tests/guestBooking20261112.node.test.mjs client/tests/batch6PatientBirthdate.node.test.mjs client/tests/patientCivilStatusRemoval20261112.node.test.mjs
node QA_REPORT/guest-directory-civil-status-2026-11-12/run-browser.cjs
```

For the additional failing regression checks:

```powershell
node --test server/tests/guestPromotions20261112.node.cjs server/tests/patients/batch6Birthdates.node.cjs
node --test client/tests/patientBookingFourStep.node.test.mjs
```

## Screenshots

- [Guest details, desktop](guest-directory-desktop.png)
- [Guest details, mobile](guest-directory-mobile.png)
- [Personal Information](personal-information.png)
- [Guest booking review, desktop](review-1440.png)
- [Guest booking review, mobile](review-390.png)
- [Appointment lookup, desktop](lookup-1440.png)
- [Appointment lookup, mobile](lookup-390.png)

## Deployment status

The three requested corrections pass their focused checks and are ready for review. Cloudflare needs the rebuilt frontend; Render needs the updated backend for the guest-directory API. No database migration is required for these corrections. Production data, existing financial records and migration history were not modified. No commit, push or deployment was performed. The six additional regression failures above prevent a claim that the entire repository is deployment-ready.
