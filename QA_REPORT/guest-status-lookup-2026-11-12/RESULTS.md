# Guest appointment lookup — 2026-11-12

Implemented against HEAD `7681cbf` (guest phone verification and booking flow). Changes remain local and have not been deployed.

## Behavior

The guest booking page now shows **“Already have an appointment? Check appointment status”** immediately below its heading. The link opens `/guest/appointments`.

Guests enter their booking mobile number and verify an SMS code before any appointment lookup. An existing, unexpired verification for the same number is reused automatically, without sending another SMS. Changing the number hides results and requires verification for that number. Expired verification also hides results.

The list includes only that mobile number's guest-source appointments with status **pending, confirmed, rescheduled, or in-progress**, across all branches. Completed, cancelled, rejected, no-show and patient-portal bookings do not appear. An empty result is explained clearly. Results are paginated in groups of 20.

Each booking has a **View status** link. Its detail page uses the verified mobile session and refreshes the current status, including if the appointment has since completed or been cancelled. Existing private links continue to work without an SMS session. A detail URL without a private token requires a valid SMS session for the booking's mobile number. The status page also links back to **Find my appointments**.

Lookup does not consume the three-bookings-per-day quota. It remains available when that quota is exhausted. Lookup and status reads do not change appointment, patient, financial or migration records. They return only booking reference, status, service, doctor, branch, date and time; clinical notes and patient contact/profile fields are excluded. Successful reads are marked private/no-store. The new lookup is rate-limited with the existing guest status limiter, separate from booking creation.

## Actual results

| Check | Result |
| --- | --- |
| New backend ownership, filtering, pagination, quota independence, private-link and actual router tests | **8 passed** |
| Existing guest booking/SMS/promotion backend regressions | **23 passed** |
| New desktop/mobile browser lookup scenarios | **8 passed** |
| Existing guest booking browser regressions | **8 passed** |
| Existing frontend guest helpers and patient booking checks | **10 passed** |
| Frontend production build | **Passed, including 25 required prebuild tests** |
| ESLint on the three changed guest page components | **Passed, 0 errors or warnings** |
| Backend syntax / staff route validation / charge-reduction smoke checks | **Passed, 390 JavaScript modules** |
| Source graph | **Passed, 655 source files, 1,529 relative imports** |
| Git whitespace check | **Passed** |

**57 focused tests passed; no failures in this run.** Browser scenarios cover the booking-page link, SMS verification, invalid OTP, both responsive layouts, existing verification at an exhausted quota, number changes, empty results, pagination, retry after a failed lookup, live detail refresh and verification expiry.

Tests use synthetic database fixtures and mocked SMS/API boundaries. No live SMS was sent and no production database was queried or changed. No schema migration is required. Provider delivery and the deployed flow still need a staging smoke test with the existing SMS configuration. The full repository suite was not rerun; the [earlier QA report](../guest-booking-2026-11-12/RESULTS.md) records two pre-existing billing source-assertion failures, which this change does not address.

## Changed files

- `client/src/App.jsx`: adds the guest appointment lookup route.
- `client/src/pages/patientPage/GuestBookAppointment.jsx`: adds the visible status lookup link.
- `client/src/pages/patientPage/GuestAppointmentLookup.jsx`: new mobile verification and unfinished appointment list page.
- `client/src/pages/patientPage/GuestAppointmentStatus.jsx`: supports phone-verified access, retains existing private links, adds the return-to-lookup link, and clears stale details after a failed refresh.
- `server/controllers/guestBooking.controller.js`: adds a read-only, verified-phone lookup and phone-bound detail access.
- `server/routers/patient.router.js`: wires the rate-limited lookup and structured status errors.
- `server/tests/guestAppointmentLookup20261112.node.cjs`, `server/tests/helpers/guestBookingHarness.cjs`: new tests and synthetic query fixtures.
- `server/tests/guestPromotions20261112.node.cjs`: extends its router fixture with the new handler.
- `client/tests/browser/guestLookup20261112.spec.mjs`: eight new browser scenarios.
- `client/tests/browser/guestBooking20261112.spec.mjs`: makes screenshot output selectable so this run preserves the earlier QA images.
- This QA directory: runner, configuration, report and screenshots.

## Reproduction

From the repository root:

```powershell
node --test server/tests/guestAppointmentLookup20261112.node.cjs server/tests/guestBooking20261112.node.cjs server/tests/guestPromotions20261112.node.cjs
node --test client/tests/guestBooking20261112.node.test.mjs client/tests/patientBookingFourStep.node.test.mjs
```

From `server`:

```powershell
npm.cmd run check:syntax
npm.cmd run verify:source
```

From `client`:

```powershell
npm.cmd run build
node node_modules/eslint/bin/eslint.js src/pages/patientPage/GuestAppointmentLookup.jsx src/pages/patientPage/GuestAppointmentStatus.jsx src/pages/patientPage/GuestBookAppointment.jsx
```

Then, from the repository root:

```powershell
node QA_REPORT/guest-status-lookup-2026-11-12/run-browser.cjs
```

The browser runner owns and stops its local preview server. Evidence is saved as ignored local logs and `browser-results.json` in this directory. Screenshots: [desktop lookup](lookup-1440.png), [mobile lookup](lookup-390.png), [updated booking page](review-1440.png).
