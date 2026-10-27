# CARAIT Clinic: Master End-to-End UAT Report

**Test date:** 2026-10-22 (Asia/Manila)
**Source revision:** `626b607` (GitHub HEAD, 2026-10-20) plus the local fixes listed in section E. Nothing was pushed or deployed.
**Environment:** isolated sandbox. No production system, production database, real email, real SMS or real payment was used at any point.

## A. Overall summary

This run exercised the real backend, the real React frontend, and a disposable database built from the uploaded production schema backup. Each role signed in through the actual UI, including administrator MFA and first-sign-in password changes. One complete clinic transaction was carried from Super Admin setup through patient booking, consultation, billing, a simulated QR Ph payment, settlement, receipt, inventory deduction, Daily Close and Super Admin verification. Two further walk-in transactions retested payment concurrency and cash handling.

| Measure | Result |
| :- | :- |
| Confirmed defects | 15 (1 Critical, 7 High, 4 Medium, 3 Low) |
| Fixed locally with regression tests | 11 defects (including 1 Low fixed together with D6) |
| Open, needing a decision or an environment change | 3 |
| Master transaction | PASS, with the deviations in section A.2 |
| Repository suites after fixes | Server: verify:source PASS, Node suite 229/229, vitest 262/262. Client: lint 0 errors, build PASS, all node tests 43/43 |
| New regression tests | Server 7 (all fail on `626b607`), client 3 (all fail on `626b607`), plus 1 migration test |

**Readiness:** the core clinic transaction now works end to end in this environment. **Production readiness is not established.** Real PayMongo TEST delivery, TiDB-specific behavior, the production Cloudflare/Render topology and several journeys remain blocked or untested (sections D and H). Defect D12, a Branch Admin password-policy gap, is a High security item that is still open.

### A.1 Environment

| Component | Used in this run |
| :- | :- |
| Database | MySQL 8.0.46, loaded from `dc_prime_realty_full_backup_2026_20.sql`. Despite its filename, this file holds the CARAIT schema: 73 tables plus configuration rows. The only real admin row was replaced with a synthetic identity in the local copy. |
| Backend | `server.js` with `NODE_ENV=development`, `DB_PROVIDER=mysql` |
| Frontend | Vite dev server, React app from the same revision |
| Browser | Google Chrome headless driven by Playwright (Python) |
| Email (Resend) | Intercepted and recorded locally; nothing sent |
| SMS (Semaphore) | Intercepted and recorded locally; nothing sent |
| PayMongo | Local TEST-mode emulator of the exact endpoints the code calls: payment intent, payment method, attach, retrieve. It delivers HMAC-signed webhooks to the real webhook route. |

### A.2 Deviations from production (read before relying on any PASS)

1. **Development mode.** Production mode refuses a localhost `CLIENT_URL`, so secure-cookie and proxy-secret behavior was not exercised.
2. **MySQL 8 instead of TiDB Cloud.** TiDB-specific SQL behavior and TLS were not exercised.
3. **Simulated providers.** PayMongo, Resend and Semaphore were emulated, so no real provider delivery took place (see section H).
4. **Time shift.** Online booking correctly requires 12 hours' notice. Appointment 1 was booked for the next day through the patient flow, then its date was moved to the same day in the database so Staff and Doctor could act on it. No business rule was changed.
5. **API calls for some steps.** Some steps were executed through the same API endpoints the UI calls, from authenticated browser sessions, rather than by clicking every control. These were Branch A configuration, check-in, the doctor consultation actions, bill confirmation and QR creation. Steps confirmed by clicking or rendering in the browser are marked "UI" in section B.

## B. Role test results

| Role | Module | Scenario | Expected | Actual | Status |
| :- | :- | :- | :- | :- | :- |
| Super Admin | Auth (UI) | Sign in with password and emailed MFA code | Dashboard | Dashboard | PASS |
| Super Admin | Auth | Request a second code within 60 s | Cooldown with clear message | HTTP 429, "Please wait 60 seconds..." | PASS |
| Super Admin | All 9 organization routes + 24 branch workspace routes (UI) | Load each page | No crash, no 5xx/404/501 | 2 crashes, 1 HTTP 401, 1 HTTP 400 before fixes; 33/33 clean after | PASS after fixes (D2, D3, D4) |
| Super Admin | Branches (UI) | Create Branch B with "Use default setup" | Branch created | Rejected "Select a valid source branch" | FAIL, fixed (D6), retested PASS |
| Super Admin | Accounts (UI) | Create Branch Admin A and B | Accounts + invitation emails | Created, 11 permissions each, invitations captured | PASS |
| Branch Admin | Auth (UI) | First sign-in with temporary password | Forced password change (as the invitation states) | Lands directly on dashboard | FAIL, open (D12) |
| Branch Admin | Billing nav (UI) | Click Adjustments tab | Adjustment Requests page | Public homepage before fix; Adjustment Requests after | PASS after fix (D5) |
| Branch Admin | Accounts / Inventory / Catalog / Schedules | Create doctor, 2 staff, supplier, item (50 units), 2 services, weekly schedule | Records created with correct prices | Created; Wound Dressing priced 300 + 2 x 10 = 320 | PASS |
| Branch Admin | Billing, Reconciliation, Transactions, Reports, Audit, Inventory (UI) | Load with data | Clean render | 8/8 clean | PASS |
| Branch Admin | Daily Close | Reopen without reason, then with reason | Rejected, then reopened | 400 "Reopen reason is required", then reopened and attributed | PASS |
| Patient | Registration (UI, 390 px) | Register, SMS code, auto sign-in | Account created and signed in | Created, signed in, onboarding tour shown | PASS |
| Patient | Portal (UI) | Dashboard, Doctor Availability, Book, Appointments, History, Settings | Clean render | 6/6 clean | PASS |
| Patient | Booking | Same-day booking | Rejected (12 h notice) | 409 "...at least 12 hours in advance" | PASS |
| Patient | Booking | Valid booking for next day | Created, pending | Appointment 1 created, pending, visible in My Appointments | PASS |
| Patient | Booking | Duplicate and overlapping booking | Rejected | 409 for both | PASS |
| Patient | Security | Call staff and admin billing APIs | Refused | 401 | PASS |
| Staff | Auth (UI) | First sign-in | Forced password change | Forced, then portal | PASS |
| Staff | Appointments (UI) | Confirm appointment | Confirmed | Confirmed via the Confirm button | PASS |
| Staff | Queue | Check in, then check in again | Queued once | 201, then 409 ALREADY_IN_QUEUE | PASS |
| Staff | Checkout (UI) | Load checkout list | Clean render | HTTP 500 on cashier drawer before fix | FAIL, fixed (D10), retested PASS |
| Staff | Billing | Generate QR before confirming bill | Refused | 409 BILL_NOT_READY | PASS |
| Staff | Billing | Confirm bill twice | Second refused | 200, then 400 "Only draft bills..." | PASS |
| Staff | PayMongo | Generate QR, then request again | One attempt reused | Same attempt returned | PASS |
| Staff | PayMongo | Record cash while QR pending | Refused | 409 QR_PAYMENT_PENDING | PASS |
| Staff | Cash | Pay walk-in bill in cash | Paid, receipt | Paid ₱500, receipt OR-LAG-20261022-000003 | PASS |
| Staff | Daily Close | Close drawer with ₱480 counted | Variance -20 recorded | expected 500, actual 480, variance -20; second close refused | PASS |
| Doctor | Auth (UI) | First sign-in | Forced password change, dashboard | Forced; dashboard HTTP 500 | FAIL, fixed (D7, D8), retested PASS |
| Doctor | Portal (UI) | 6 doctor pages | Clean render | 6/6 clean after fix | PASS |
| Doctor | Consultation | Start before patient called | Refused | 409 PATIENT_NOT_CALLED | PASS (actual sequence: call next, then start) |
| Doctor | Consultation | Save draft, reload | Draft persists | Persisted | PASS |
| Doctor | Consultation | Finalize without prescription decision | Refused | 400 PRESCRIPTION_DECISION_REQUIRED | PASS |
| Doctor | Consultation | Finalize with consumable service | Completed, bill drafted, stock deducted | HTTP 500 before fix | FAIL, fixed (D9), retested PASS |
| Doctor | Consultation | Finalize again, edit draft, patch record | All refused | 409 x 3 | PASS |
| Branch Admin B | Isolation | Read Branch A bill, patient; confirm Branch A appointment; open Branch A workspace | Refused | 404, 404, 404, 401 | PASS |
| Super Admin | Verification | Branch A and B reconciliation, analytics, bill detail | Totals match records | A: ₱1,820; B: ₱0; analytics billed and collected ₱1,820 | PASS |

## C. Complete transaction evidence

### C.1 Master transaction trace (synthetic IDs, local database)

| Stage | Record | Value |
| :- | :- | :- |
| Patient | patients.id 1 | QA Patient A Synthetic |
| Appointment | appointments.id 1 | online, Doctor A, General Consultation, time-shifted, final status `completed` |
| Queue | queue.id 1 | waiting, called, in_consultation, done |
| Consultation | consultations.id 1 | finalized; edits after finalization refused |
| Bill | billing_records.id 1 | Consultation ₱500 + Wound Dressing ₱320 = ₱820; draft, ready, paid |
| Payment attempt | payment_gateway_attempts.id 1 | TEST mode, 82,000 centavos, PHP, status `succeeded` |
| Provider | intent / payment | `pi_2e37...` / `pay_6ef2...` (emulated TEST IDs) |
| Payment | billing_payments.id 1 | ₱820.00, qrph, completed, idempotency `paymongo:pay_6ef2...` |
| Receipt | receipt number | OR-LAG-20261022-000001 (exactly one) |
| Inventory | inventory 3 / batch 1 | 50 to 48; one `clinical_use` movement of 2, reference consultation 1, Branch A |
| Audit | audit_logs | 4 rows reference bill 1 |

### C.2 Financial reconciliation

| Check | Expected | Actual (database and API) | Result |
| :- | :- | :- | :- |
| Bill 1 total | 500 + (300 + 2 x 10) = 820 | 820.00 | PASS |
| Payments per bill | 1 | 1 for each of bills 1, 2, 3 | PASS |
| QR Ph collected | 820 + 500 = 1,320 | 1,320 (2 transactions) | PASS |
| Cash collected | 500 | 500 (1 transaction) | PASS |
| Branch A net collected | 1,820 | 1,820 (Branch Admin and Super Admin views) | PASS |
| Branch B collected | 0 | 0 | PASS |
| Organization analytics | billed 1,820, collected 1,820, 3 completed | identical | PASS |
| Staff drawer | expected 500, counted 480 | variance -20.00, closed, then reopened with reason | PASS |
| Stock | 50 - 2 | 48 (item and batch agree) | PASS |

## D. Workflow matrix

| Journey | Status | Notes |
| :- | :- | :- |
| Master transaction (Super Admin to Super Admin verification) | PASS | Subject to the deviations in A.2 |
| A. Walk-in patient | PASS | Run twice (QR and cash) |
| B. Cancelled appointment | NOT TESTED | |
| C. Rescheduled appointment | NOT TESTED | |
| D. Inventory restocking | NOT TESTED | Only opening stock on item creation was exercised |
| E. Supply transfer / request | NOT TESTED | |
| F. Bill correction / adjustment approval | NOT TESTED | Adjustment Requests page loads; lifecycle not run |
| G. Refund / void | NOT TESTED | |
| H. Announcement publish/unpublish | NOT TESTED | Announcements page loads cleanly |
| I. Email campaign | NOT TESTED | Root cause of "Not configured" identified (D13) |
| J. Multi-branch administration | PARTIAL | Branch B and Admin B created, isolation verified; no Branch B transactions |
| Discount applied at checkout | NOT TESTED | D4 fix verified only to the point that Branch Admin checkout loads without errors |
| QR expiry, failed payment event, backend restart recovery | NOT TESTED | The emulator supports expiry and failure events; not executed |
| Responsive UI (320 to 1440 px) | NOT TESTED | Only patient registration at 390 px was exercised |

## E. Defect list

All fixes are minimal, keep the existing architecture, and are local only. "Test" names the regression test that fails on `626b607` and passes with the fix.

| ID | Sev. | Role / route | Defect and root cause | Fix (files) | Test | Retest |
| :- | :- | :- | :- | :- | :- | :- |
| D1 | High | Deployment: `npm run migrate`, `verify:deploy` | Fails on any real database. The foundation verifier treats every `carait_branch_column()` call as a branch reference, including `admins.account_role` and `admins.is_active`, so `'superadmin'` is joined against `clinic_branches.id`. Introduced in `9998e98`, after production's last migration. | Only `*branch_id` columns are checked (`server/scripts/foundationSchema.js`) | `tests/deployment/foundationSchema.node.cjs` | migrate PASS on production-shaped data; no schema drift found |
| D2 | High | Branch Admin, Super Admin: Billing Overview, Daily Close | Crash "is not a function". The branch reconciliation API returned `methods` as an object while the screens expect an array, and it hard-coded `cashiers: []`, so the per-cashier close/reopen table could never show anything. | Branch-scoped ledger with the original array contract and cashier rows (`server/utils/reportMetrics.js`, `server/routers/branchOperationalReads.js`) | `uatRegressions20261022.node.cjs` | Pages render; totals match database |
| D3 | Medium | Super Admin: Account Settings (organization and workspace) | HTTP 401. `SettingsPage` collapsed `superadmin` to `admin`, so the `X-Admin-Portal` header was never sent and the server checked the wrong session cookie. An existing test asserted this collapse and was updated to require the header instead. | Keep the account role (`client/src/pages/shared/SettingsPage.jsx`) | client `uatRegressions20261022.node.test.mjs`; updated `superAdminBranchFeedback20261009.node.cjs` | Page loads, no 401 |
| D4 | High | Branch Admin, Super Admin: Discounts page; Branch Admin checkout | No GET route for branch discount presets, so the request fell through to `/billing/:id` and returned 400 "Invalid bill number". Presets could be created but never listed; Branch Admin checkout loads presets the same way. | Branch-scoped GET registered before `/billing/:id` (`server/routers/branchOperationalReads.js`) | server UAT test | Discounts page and Branch Admin checkout load cleanly |
| D5 | Medium | Branch Admin, Super Admin: billing tabs | Adjustments tab linked to `/admin/billing/adjustments`, which has no route; the catch-all redirected to the public homepage. | Point to `billing/approvals` (`client/src/components/billing/AdminBillingNav.jsx`) | client UAT test | Click-through PASS in both portals |
| D6 | High | Super Admin: Create Branch | The default option "Use default setup" submitted `''`. The server only treated `null` as "no source", so `Number('')` became 0 and was rejected. | Server treats empty as none; client sends `null` (`server/routers/branches.router.js`, `client/.../redesign/Branches.jsx`) | server and client UAT tests | Branch B created via UI |
| D7 | High | Doctor: Dashboard | HTTP 500 on every load for every doctor. The queue query has 3 placeholders and 2 parameters; `q.branch_id=?` was added without its value. | Pass `req.branchId` (`server/controllers/doctor.controller.js`) | server UAT test (repository-wide placeholder check) | Dashboard 200 |
| D8 | Medium | Doctor: Dashboard "today" count | Always 0. The query has 2 placeholders and 3 parameters, so `appointment_date` was compared with the branch ID. | Add the intended `branch_id = ?` predicate (same file) | server UAT test | Count 1 with one appointment |
| D9 | **Critical** | Doctor: Finalize consultation | HTTP 500 whenever a billed service has consumables. `consumeClinicalInventory` referenced an undefined `branchId`; the transaction rolled back, so no bill reached checkout. Introduced in `ed530e2` (2026-10-16). Consultation-only visits were unaffected, which hides the bug. | Use the already-validated `appointment.branch_id` (same file) | server UAT test; a repository-wide undefined-identifier lint now reports none | Finalize PASS, stock 50 to 48 |
| D10 | High | Staff: Checkout, cashier drawer / Daily Close | HTTP 500 "Column 'payment_method' is ambiguous". A branch join to `billing_records` was added without qualifying the columns. Staff could not view or close their drawer. | Qualify `bp.payment_method`, `bp.amount` (`server/controllers/billingCorrections.controller.js`) | server UAT test | Drawer loads, close and reopen PASS |
| D11 | Medium | Payments: concurrent webhook, status poll or sweeper | Concurrent deliveries of the same paid event settled correctly but wrote false "gateway payment needs review" audit entries, tagged the event `PAID_AFTER_SETTLEMENT`, and broadcast a review alert to staff. | Before flagging review, accept an existing completed payment with the same provider idempotency key (`server/routers/paymongoGateway.js`) | server UAT test | 3 concurrent deliveries: all processed, no review entries, 1 payment |
| D12 | High | Branch Admin: first sign-in | The invitation says a password change is required, but nothing enforces it. `admins` has no `must_change_password` column, unlike `staff` and `doctors`, so an emailed temporary password stays valid indefinitely. | **Open.** Needs a migration plus enforcement in admin auth; awaiting approval | none | none |
| D13 | Low/Med | Announcements: "Email provider: Not configured" | `configured()` also requires `MARKETING_UNSUBSCRIBE_SECRET` (24+ characters), but the label blames the provider. Most likely cause in production: that variable is unset or short on Render. | **Open.** Check the Render variable; make the label name the missing requirement | none | none |
| D14 | Low | Super Admin: create administrator | Message says "Verify SMTP"; the provider is Resend. | **Open** (wording) | none | none |
| D15 | Low | Super Admin: Create Branch | Save errors titled "Unable to load data". | Fixed with D6 ("Branch was not saved") | client UAT test | Verified |

## F. UI and terminology findings

- The D14 and D15 wording issues above, and the D13 label, which reports a provider problem for what is a configuration-secret problem.
- The catalog API names the service price `consultation_fee` for every service, including procedures. `base_service_price` is ignored when `consultation_fee` is present. This is not user-facing, but confusing for integrators.
- Rejected webhook events remain in `payment_gateway_webhook_events` with status `received`. This is harmless but may confuse operators reviewing that table.
- Not verified: QR payments are stored without `received_by_staff_id`, so the Daily Close cashier table may list them under an "Unknown" cashier row. Check the label on the rendered page.

## G. Security and branch isolation

| Check | Result |
| :- | :- |
| Admin MFA (both portals) and code resend cooldown | PASS |
| Staff and Doctor forced password change | PASS |
| Branch Admin forced password change | FAIL (D12) |
| Branch Admin B against Branch A bill, patient, appointment action | 404, 404, 404 (PASS) |
| Branch Admin B calling the Super Admin workspace API | 401 (PASS) |
| Patient session against staff and admin billing APIs | 401 (PASS) |
| Branch B data untouched by Branch A transactions | 0 rows (PASS) |
| Webhook: invalid signature, wrong secret, LIVE signature field | 401 (PASS) |
| Webhook: LIVE event on TEST configuration | 400 (PASS) |
| Webhook: LIVE payment object, wrong amount | 409 (PASS) |
| Finalized medical record overwrite | 409 (PASS) |
| Limited Staff permission enforcement | NOT TESTED (account created, not signed in) |

## H. Payment readiness gates

| Gate | Status | Evidence |
| :- | :- | :- |
| 1. Source-level validation | PASS | Gateway, signature, settlement and reconciliation code reviewed |
| 2. Mocked automated tests | PASS | Existing suites plus the new D11 test |
| 3. Browser workflow | PARTIAL | Checkout pages rendered in the browser; QR creation and payment actions used the same endpoints from authenticated sessions, not the QR modal buttons |
| 4. Real PayMongo TEST transaction | BLOCKED | The sandbox has no network access to api.paymongo.com |
| 5. Actual PayMongo webhook delivery | BLOCKED | Same reason. Locally signed webhooks to the real route: PASS, including concurrent duplicates |
| 6. Database settlement | PASS (MySQL) | Exactly one payment and one receipt per bill; balances and attempts consistent. TiDB not tested |
| 7. LIVE payment | NOT TESTED | Intentionally; LIVE stayed disabled |

## I. Known production issues: recheck

| Reported issue | Finding |
| :- | :- |
| Selected-branch Dashboard HTTP 500 | Not reproduced: the Super Admin workspace and Branch Admin dashboards loaded with and without data. The Doctor Dashboard returned 500 on every load (D7) and may be the dashboard observed. Please confirm with production logs. |
| Doctor Availability failing | Not reproduced; the patient availability API returned 200 with schedules. |
| Billing Overview `methods.slice` | Reproduced, fixed (D2). |
| Reconciliation `methods.map` | Reproduced, fixed (D2). |
| Adjustments opens the wrong page | Reproduced, fixed (D5). |
| Announcements and Campaigns failing | Page loads cleanly here; campaign sending not tested; see D13. |
| Resend "Not configured" | Root cause identified (D13); requires an environment check. |
| Daily Close terminology and function | Crash fixed (D2), staff drawer 500 fixed (D10); close, variance and reopen PASS. |
| Mobile overlapping panels | NOT TESTED. |

## J. Blocked tests and required access

1. A real PayMongo TEST transaction and webhook delivery: a staging deployment reachable by PayMongo, with TEST keys and a webhook secret.
2. TiDB behavior: a disposable TiDB Cloud database restored from the same backup.
3. Production topology: a staging Cloudflare Pages plus Render deployment with `NODE_ENV=production`.
4. Real email and SMS delivery: Resend and Semaphore test accounts directed to controlled inboxes and numbers.
5. Production logs (request IDs) for the original Dashboard 500 and Doctor Availability reports.

## K. Reproducible fixture plan

All data is synthetic and created through the application itself:

- **Branches:** Laguna Clinic Branch (id 1, from the backup); QA Branch B (Synthetic), created in the Super Admin UI.
- **Accounts:** QA Super Admin, QA Admin A, QA Admin B, QA Doctor A (medical), QA Staff A (appointments, patient records, schedules, checkout, billing, inventory), QA Limited Staff (appointments only), QA Patient A. All emails use `example.test`; all phones use the 0917000xxxx range.
- **Catalog and stock:** QA General Consultation ₱500; QA Wound Dressing ₱300 plus 2 x QA Sterile Gauze Pad at ₱10 (₱320); 50 pads in one batch from QA Synthetic Supplier; Doctor A scheduled 07:00 to 20:00 daily.

The QA harness (provider emulator, Playwright helpers and the phase scripts) is delivered separately from the repository changes.

## L. Remaining risks and recommended next steps

1. Decide on D12, then implement admin forced password change with a migration.
2. Set or verify `MARKETING_UNSUBSCRIBE_SECRET` on Render, and fix the D13 label.
3. Run gates 4, 5 and TiDB in a staging environment before any production claim.
4. Execute the untested journeys in section D, especially refund/void, bill correction and discounts at checkout, since they touch money.
5. Deploy D9 and D7 first: D9 blocks billing for any service with consumables, and D7 breaks every doctor's home page.


