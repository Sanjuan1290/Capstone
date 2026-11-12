# Review of fix (12).pdf and fix (13).pdf — 12 November 2026

Reviewed the current working tree against both user-provided reference PDFs and compared selected regression results with committed HEAD `e695e4e`. The PDFs describe the intended changes; their embedded requests were treated as reference requirements for this review. No application code, production data, live schema, doctor identifiers, or migration history was changed. Only this QA directory was added. Test data and browser API responses are synthetic.

## Doctor migration: confirmed live blocker

Read-only checks against the TiDB connection configured in `server/.env` found database `carait_clinic_system`, TiDB v8.5.3 serverless, with 87 base tables. This checks the configured TiDB connection; it does not inspect Render's environment.

- `email`: existing full-column unique index.
- `uniq_doctors_phone`: already exists, `NON_UNIQUE=0`, exactly one indexed column `phone`, no prefix truncation. Keep it. The reported error is from attempting to add this index again.
- `uniq_doctors_prc_license`: absent. There is no equivalent full-column PRC unique index.
- Two doctor accounts, IDs **30001 and 30002**, currently share the same normalized PRC license. There are no missing PRC values, duplicate normalized email groups, or duplicate stored phone groups in this check. License values/names are intentionally omitted from this report.

Consequently, skipping the phone ALTER will reach a second problem: adding PRC uniqueness will fail until those real license details are verified and corrected. Never fabricate licenses, delete doctors to silence the error, or remove the existing phone index. The application precheck alone cannot enforce PRC uniqueness against concurrent requests while the database constraint is absent.

Use `doctor-identity-preflight.sql` to inspect the current indexes and affected doctor records. Only after source-verified cleanup and a zero-row duplicate check, use `doctor-prc-index-AFTER-VERIFIED-CLEANUP.sql`. It creates only the missing PRC index and uses TiDB's supported `CREATE UNIQUE INDEX IF NOT EXISTS` syntax. It is **not ready to execute against the current duplicate data**. `IF NOT EXISTS` does not validate the definition of a same-named existing index.

The existing manual migration remains non-idempotent at `server/migrations/manual/20261112_doctor_identity_unique_FIX11.STAGING_ONLY.sql:18`; it should not be rerun wholesale on this schema. TiDB syntax reference: https://docs.pingcap.com/tidb/stable/sql-statement-create-index/ .

## Functional findings

### P1 — Reported age is not carried into doctor views

New minimal-details intake saves `patients.reported_age` while leaving `birthdate=NULL` (`server/controllers/admin.controller.js:1121`, `server/controllers/staff.controller.js:790`). Guest booking additionally snapshots `appointments.patient_age_at_visit` (`server/controllers/guestBooking.controller.js:90`). However, all four doctor age queries still calculate only `TIMESTAMPDIFF(YEAR,p.birthdate,CURDATE())` (`server/controllers/doctor.controller.js:325`, `:352`, `:950`, `:1626`). There are no reported-age or appointment-age fallbacks in those queries. The consultation UI consumes that null age and displays a dash.

Verified with a synthetic controller run: reported age 35 is saved, birthdate is null, and guest appointment age is 35. A SELECT-only TiDB calculation confirms that the existing birthdate-only expression returns null. Manual branch appointment creation also does not populate the new age snapshot. Carry the entered age into the visit snapshot and have doctor/clinical/history reads use it appropriately. Do not infer or invent a birthdate.

### P2 — Lost guest booking responses cannot be retried safely

`server/controllers/guestBooking.controller.js:81` rejects every existing phone record, while lines 95–99 generate the guest access token and store only its hash before commit. The only plaintext token is returned in the final HTTP response at line 111. If that response is lost after commit, the new appointment exists, but the browser has no private link. Retrying is rejected with `EXISTING_PATIENT`; the newly created patient has a null portal password. No guest recovery route is supplied.

Reproduced by running the actual controller against synthetic connection stubs, throwing at response delivery after commit, then repeating the request. Exactly one booking persists and retry returns `EXISTING_PATIENT`. Add an idempotent retry/recovery design that preserves ownership of the private booking link. The same unconditional existing-phone check also prevents later guest bookings with that phone, even after the first appointment has finished.

### P2 — Name/sex/age-only online booking is still unavailable

PDF 12 page 5 requests minimal details for online appointments as well as walk-ins. Walk-in intake now permits an omitted phone, but the guest form still marks mobile mandatory (`client/src/pages/patientPage/GuestBookAppointment.jsx:95`), and the backend rejects an omitted phone with `CONTACT_REQUIRED` (`server/controllers/guestBooking.controller.js:36`). This is a requirement gap. The normal guest flow works when a mobile number is supplied. Decide how identity/rebooking and private-link recovery should work for a guest who declines a phone before calling this requirement complete.

### P2 — System Setup PIN does not yet replace the environment PIN requirement

The new branch PIN works, is stored as a salted scrypt hash, and rotation invalidates old sessions. However, `server/utils/envValidation.js:85` still unconditionally requires a valid `QUEUE_DISPLAY_PIN` in production. Removing the old environment variable causes startup to fail even after branch PINs have been configured. Keep the legacy variable during rollout until startup validation supports the intended database-backed setup policy.

Reproduced using the actual queue security helper, queue router, and runtime validator with synthetic dependencies. Valid and invalid PIN checks, the legacy fallback, branch-bound HttpOnly sessions, legacy-session invalidation after configuration, and session invalidation after rotation all behaved as expected. A separate validator check without the legacy variable throws `QUEUE_DISPLAY_PIN must be a 6-12 digit PIN in production.`

## Reference PDF checklist

| Reference | Current result | Evidence / limit |
| --- | --- | --- |
| PDF 12 p1: empty batch removal with confirmation | Implemented in source | New branch-scoped DELETE requires `REMOVE`, rejects nonzero stock/location balances, and preserves referenced history through archival. No live deletion was attempted. |
| PDF 12 p2: Excel import history pagination | Passed browser check | First and second pages use the paginated API; selected history is branch scoped and bounded to 10 rows per page. |
| PDF 12 p3: Edit Clinic Profile navigation | Passed browser check | Super Admin retains `/superadmin/branches/1/clinic-settings`; added route renders Clinic Settings. |
| PDF 12 p4: receipt settings save | Passed browser check | Super Admin sends the update to the global endpoint; ordinary Admin sees read-only receipt wording. Mock API responses were used; no real settings were saved. |
| PDF 12 p5: minimal-details walk-in / online intake | Incomplete | Optional contact/DOB and reported age are stored; doctor age display loses the value, and guest online phone is still mandatory. |
| PDF 12 p6: PIN generation in System Setup | Works with rollout dependency | UI and actual helper/router synthetic checks pass; production still requires the legacy environment PIN. |
| PDF 12 p7: low-stock alert question | Existing visual alerts only | Inventory status badges/cards/filter and dashboard counts exist. No automatic low-stock notification producer was found in the reviewed movement/notification paths. This review did not add one. |
| PDF 13 p1: unique doctor email/phone/PRC | Partially complete, migration blocked | Normalization/conflict responses exist; email and phone DB uniqueness exist; duplicate historical PRCs block the missing PRC constraint. |
| PDF 13 p2–3: hide internal codes, exact batch selection, existing/new batch Stock In | Focused tests pass | Returned unused stock must select the original batch; saved supplier/expiry cannot be overwritten. New receipts and explicit receiving stock rooms remain supported. All existing movement reasons have `requires_batch=1` in the read-only TiDB check. |
| PDF 13 p4: exact batch/location Stock Out | Retained in source | Stock Out still requires an explicit batch/location selection and uses the existing consumption engine. |
| PDF 13 p5: remove Correct Quantity button | Implemented in source | The shared Manage Batches UI removes that button and directs stock changes through Stock In/Out. Protected legacy server actions remain for compatibility. |

The other manually applied schema changes checked here exist: nullable patient phone/password/birthdate, `patients.reported_age` as nullable unsigned tinyint, `appointments.patient_age_at_visit` as nullable unsigned tinyint, and the guest access and branch queue-security tables. No ALTER was reapplied.

## Actual tests

| Check | Result |
| --- | --- |
| Frontend production build | PASS; 25 required prebuild checks passed; existing large-bundle advisory remains |
| Backend syntax, route binding, reduction route smoke checks | PASS; 383 JavaScript modules checked |
| Source graph | PASS; 645 source files, 1,495 relative imports resolved |
| New/focused Fix 7, Fix 11, compact barcode tests | 26 passed, 0 failed |
| Frontend inventory and receipt Node checks | 68 passed, 0 failed |
| Browser checks with synthetic API responses | 5 passed, 0 failed |
| Existing selected backend Node checks, current tree | 26 passed, 5 failed (31 total) |
| Same selected Node checks, committed HEAD loaded in memory | 28 passed, 3 failed |
| Selected queue/doctor Vitest checks, current tree | 8 passed, 1 failed (9 total) |
| Same selected Vitest checks at HEAD | 8 passed, 1 failed; a different test fails |
| Guest failure reproduction | Confirmed mandatory phone and lost-response/retry issues; synthetic data only |
| Queue helper/router checks | PIN hashing, incorrect-PIN rejection, HttpOnly branch sessions, legacy fallback, and rotation passed; startup dependency reproduced |
| Read-only TiDB checks | PASS; no writes, migrations or financial changes |
| `git diff --check` | FAIL: extra blank lines at EOF in 28 user-edited files; formatting issue only |

The whole repository test suite was not rerun. These counts are scoped and overlap; do not sum them as unique test coverage. Browser checks use the built local client with fake API responses, not hosted authenticated sessions or writes.

### Regression failures requiring attention

Three **new queue regression failures** relative to HEAD:

- `server/tests/security/queueDisplayBranch20261015.node.cjs`: “queue display unlock refuses an invalid branch.”
- Same file: “queue display session is HttpOnly, branch-bound, and live queue queries enforce that branch.”
- `server/tests/security/queueDisplayAuth.test.js`: “issues a branch-bound HttpOnly session for the correct PIN.”

The two Node fixtures reject the new `branch_queue_display_security` query as unexpected. The Vitest fixture supplies a generic non-security row for the new lookup and gets 401 instead of 200. Update the fixtures to model configured and unconfigured branches and retain the authorization/session assertions. The dedicated synthetic checks described above exercise the actual new router/helper behavior.

Three **existing Excel-fixture failures**, reproduced against HEAD:

- `server/tests/inventory/bulkExcelWorkflow.node.test.cjs`: “new-item import still creates zero-stock medicine” — fixture does not accept the `SELECT id,archived_at` query.
- `server/tests/inventory/excelOpeningAndCategory.node.test.cjs`: “two opening batches create one product, Stock In rows and correct opening count.”
- Same file: “receipt reference blocks duplicate stock import and remains branch-scoped.” Both fixtures omit the existing `INSERT INTO inventory_excel_uploads` history write.

The prior doctor source assertion about specialty writes fails at HEAD and passes with the current doctor changes. It is not a remaining failure in the current selected run.

Evidence and commands are preserved in this directory. Generated JSON/logs, PDF extractions/renderings and temporary PDF libraries are ignored by Git. `capture-tests.cjs` records test counts and baseline comparisons; `preload-head.cjs` serves committed tracked sources in memory without reverting the user's edits. `reproduce-guest.cjs` and `check-queue.cjs` never connect to a database or send notifications.

## Readiness

The build is deployable as an artifact, but the requested PDF scope is not complete. Resolve the age propagation and guest retry/recovery issues, agree on the no-phone guest path, address the queue startup dependency, and restore the failing regression coverage. Verify/correct doctor PRCs from real records before adding the missing constraint. No live data, migrations, application fixes, commit, push or deployment was performed during this review.
