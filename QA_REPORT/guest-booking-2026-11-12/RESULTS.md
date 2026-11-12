# Guest booking and registered-patient promotions — 2026-11-12

Implemented against repository HEAD `8f6f2d2`, with the latest guest-booking changes in this working tree. Changes are local; nothing has been deployed.

## Resulting behavior

- Guests must verify their Philippine mobile number by SMS before booking. A different number needs its own SMS verification. Codes expire in 10 minutes, allow five incorrect attempts, are stored as hashes, and are consumed on successful verification. The browser receives a separate HttpOnly guest proof valid for 30 minutes; it does not receive a patient portal session.
- Each verified mobile number may create **three successful guest appointment requests per Philippine calendar day**, across all branches and doctors. The quota resets at midnight in Asia/Manila, survives application restarts, and includes subsequently cancelled requests. Failed validation does not consume it. Existing IP abuse controls still apply.
- A database phone lock serializes concurrent submissions. Repeat requests reuse the verified guest patient record; registered patient records cannot be reused through guest booking. Submitted notes are saved.
- A submission key makes retries return the existing booking and private status link without another appointment, quota charge, or notification. The browser retains the pending key for response-loss recovery after a reload, including after the third successful request.
- Guest booking reuses the actual patient portal service cards, doctor cards, calendar, slots, visit-details component, progress indicator and appointment summary. Guest flow adds an SMS verification step before the portal-style service/doctor/schedule/review steps. Desktop and 390px mobile layouts were inspected.
- Guest service responses omit offers and use catalog prices. Crafted promotion submissions are rejected. Guest-source bills also reject promotion selections during consultation or checkout. Registered-patient booking previews and service-promotion calculations remain available.
- Homepage offers require a valid patient session. Public news excludes promotional posts for guests; direct promotional-list requests require sign-in, and direct promotional articles are unavailable without a patient session. Ordinary news remains public. These responses use private/no-store caching. A guest phone proof cannot unlock any of these patient benefits.

## Actual verification

| Check | Result |
| --- | --- |
| New backend guest/SMS/quota/retry/promotion tests | **23 passed** |
| New frontend phone/validation/price isolation/cookie/error tests | **5 passed** |
| New Playwright browser scenarios | **8 passed** |
| Existing SMS quota, announcement validation, service-promotion calculation tests | **19 passed** |
| Existing OTP purpose, appointment security, booking/promotion workflow Vitest suites | **13 passed** |
| Existing frontend booking/promotion checks | **16 passed, 1 failed** |
| Existing backend promotion-pricing checks | **3 passed, 1 failed** |
| Frontend production build, including required prebuild tests | **Passed; 25 prebuild tests passed** |
| Backend syntax / route registration / charge-reduction smoke checks | **Passed; 389 JavaScript modules** |
| Backend source graph | **Passed; 653 source files, 1,523 relative imports** |
| ESLint on changed frontend JS/JSX | **0 errors; 5 existing hook-dependency warnings in BookAppointment.jsx** |
| Conflict-marker scan of application source / git whitespace check | **Passed** |
| Read-only database metadata verification | **Passed; 0 database writes** |

All **36 new feature checks** pass. The Node backend JavaScript has no separate compilation/build command; syntax, source graph and route checks validate that side.

Browser scenarios cover desktop/mobile end-to-end submission, incorrect SMS codes, editing one phone digit, a full daily quota, quota exhaustion from another tab, stable retry keys after response loss, reload recovery, and the sign-in prompt for public offers. Backend scenarios also cover expired/forged/wrong-audience proof, exhausted OTP attempts, provider failure, simultaneous requests at the cap, Philippine midnight, rollback on slot failure, registered-account isolation and regular-price enforcement through billing.

## Remaining regression failures

Both failures reproduce against HEAD source using the read-only baseline loader, before these changes:

1. `client/tests/bookingOfferContinuity20261105.node.test.mjs`: “backend snapshots discounts at booking and charges them once in consultation and staff checkout”.
2. `server/tests/promotions/promotionPricing20261105.node.cjs`: “billing and all reschedule paths preserve selected promotional discount boundaries”.

Both expect the literal text `item.source_type==='consultation'` inside `server/utils/billing.js`; promotion application has been extracted into `billingServicePromotions.js`. The behavioral tests for that helper pass, including registered patients' saved discounts, additional eligible services, discount caps and deleted-offer snapshots. These older source assertions were not rewritten to hide their failures. The complete repository test suite was not rerun; this is a focused feature/regression run.

## Database and deployment

The metadata checker verified existing `account_security_codes`, `registration_sms_limits` and `guest_booking_access`, including the security-code unique index on `(role, account_id, purpose)`. The existing column types support this implementation. **No migration is needed or was applied. No production rows, financial data or migration history were changed.** No live SMS messages were sent.

The feature is ready for staging validation. Deploy the backend and frontend together. SMS delivery requires the existing valid `SEMAPHORE_API_KEY`/sender configuration and provider credits; production requires the existing JWT secret of at least 32 characters. Real provider delivery and the hosted browser flow still need a staging smoke test. The two baseline test failures mean the full regression suite cannot be described as green.

## Changed application files

- `client/src/pages/patientPage/GuestBookAppointment.jsx`: portal-style wizard, SMS verification, quota display and response recovery.
- `client/src/pages/patientPage/BookAppointment.jsx`: shared components support regular-price guest presentation; accessible note fields.
- `client/src/pages/patientPage/GuestAppointmentStatus.jsx`: another-booking link.
- `client/src/services/guestBooking.service.js`, `client/src/utils/guestBookingFlow.mjs`: guest HTTP requests and form helpers.
- `client/src/pages/LandingPages/News.jsx`, `client/src/services/landing.service.js`: patient-only offers and uncached authenticated reads.
- `server/controllers/guestBooking.controller.js`: verified-phone enforcement, daily quota, guest reuse, notes, idempotent submission/recovery and promotion rejection.
- `server/controllers/guestPhoneVerification.controller.js`, `server/utils/guestBookingPolicy.js`: hashed SMS challenges, separate guest proof and persistent quota policy.
- `server/routers/patient.router.js`, `server/utils/smsService.js`: verification/recovery endpoints, structured guest errors and SMS transport.
- `server/controllers/patient.controller.js`: omit promotions from guest services; retain registered-patient offers.
- `server/utils/patientPromotionAccess.js`, `server/controllers/promotions.controller.js`, `server/routers/branchAnnouncements.js`: patient-session checks on homepage offers and promotional news.
- `server/utils/billingServicePromotions.js`, `server/utils/billing.js`: enforce regular prices for guest-source bills and carry the appointment source into checkout calculations.

New automated tests are in `server/tests/guestBooking20261112.node.cjs`, `server/tests/guestPromotions20261112.node.cjs`, `server/tests/helpers/guestBookingHarness.cjs`, `client/tests/guestBooking20261112.node.test.mjs` and `client/tests/browser/guestBooking20261112.spec.mjs`.

## Reproduction

From the repository root:

```powershell
node --test server/tests/guestBooking20261112.node.cjs server/tests/guestPromotions20261112.node.cjs server/tests/registrationSmsLimits20261111.node.cjs server/tests/announcementBookingValidation.node.test.cjs server/tests/billing/servicePromotions20261111.node.test.cjs
node --test client/tests/guestBooking20261112.node.test.mjs client/tests/patientBookingFourStep.node.test.mjs client/tests/promoServiceBooking.node.test.mjs client/tests/bookingOfferContinuity20261105.node.test.mjs
node --test server/tests/promotions/promotionPricing20261105.node.cjs
node --require ./QA_REPORT/guest-booking-2026-11-12/baseline-source.cjs --test client/tests/bookingOfferContinuity20261105.node.test.mjs server/tests/promotions/promotionPricing20261105.node.cjs
node QA_REPORT/guest-booking-2026-11-12/check-schema-readonly.cjs
```

From `server`:

```powershell
npm.cmd run check:syntax
npm.cmd run verify:source
node node_modules/vitest/vitest.mjs run tests/security/accountSecurityPurpose.test.js tests/security/appointmentSecurity.test.js tests/security/promotionAndBookingWorkflow20261008.test.js
```

From `client`, run `npm.cmd run build`; then from the repository root run `node QA_REPORT/guest-booking-2026-11-12/run-browser.cjs`. The browser runner owns its local preview process and stops it on completion. All browser API calls are mocked; backend feature tests replace database and SMS boundaries with synthetic fixtures.

Local evidence includes `feature-backend.log`, `frontend-tests.log`, `backend-regressions.log`, `promotion-regressions.log`, `baseline-regressions.log`, build/syntax/source/lint logs, `schema-readonly.json` and `browser-results.json`. Logs and JSON artifacts are git-ignored. Screenshots: [desktop](review-1440.png), [mobile](review-390.png).
