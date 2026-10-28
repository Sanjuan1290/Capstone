# CARAIT full-system audit — 28 October 2026

## A. Executive summary

**Release decision: NO-GO for full production sign-off.** The local fixes, build, dependency checks and available regressions pass. Financial and clinical transaction correctness under real concurrent TiDB writes still needs a disposable database. Several remaining risks are documented below; a green suite is not a certification of every workflow.

The starting repository was clean at commit `79ae2bc`, dated 27 October 2026. The current repository was used throughout; older delivery notes were treated as historical context. No separate source export was supplied. The supplied SQL backup was examined offline, and the configured database was also inspected using a SELECT/EXPLAIN-only executor. It reports TiDB v8.5.3 serverless. These observations concern the locally configured database, not a verified connection to Render's runtime configuration.

Confirmed results:

- The backup has 73 tables, 831 columns, 233 indexes (111 unique), and 89 foreign keys. Live column definitions, nullability, explicit defaults, auto-increment/update attributes, indexes, and foreign-key relationships/rules match the backup.
- All 14 selected-promotion columns, the promotion index, and its foreign key already exist. Five registered migration checksums match. Batch 4 is absent from migration history. **The history gap does not itself prove a missing feature column or explain the former autosave failure. Do not rerun its ALTER statements.**
- All 571 statically extractable literal SELECT queries and the 20 runtime-composed branch report queries pass TiDB EXPLAIN after fixing the campaign list query. Dynamic queries and write statements are not covered by that claim.
- The backup's 666 aggregate/metadata integrity checks have no violations. Live checks found no orphans across 89 declared foreign keys and no violations in 32 additional branch, stock, billing, payment-link and status checks. These counts do not establish clinical correctness of individual records.
- Final unique test counts: **262 Vitest + 331 backend Node + 101 frontend Node + 1 root export test = 695 passed**, zero failed/skipped/cancelled in these suites. Ten real-browser scenarios against synthetic HTTP responses also passed.
- The final focused set passed five consecutive runs: 61 backend Node, 25 frontend Node and 11 inventory Vitest tests per run, **485 successful test executions**. The ten-scenario browser suite was also repeated five times. The corrected campaign SELECT separately passed five live EXPLAIN runs.
- Build and lint pass. Lint retains 16 warnings; the build retains a large-chunk warning. Both full npm dependency audits report zero known advisories after compatible updates.
- Vitest-only production-code coverage is **24.51% lines, 21.73% statements, 12.50% branches and 17.25% functions**. Standalone Node and browser runs are excluded from those percentages. Coverage remains too sparse to infer complete workflow safety.

No deployment, commit, push, production migration, account creation, clinical/financial record write, provider upload, live payment, refund, cancellation, or notification delivery was performed. Historical migration SQL files and checksums were not changed. Browser APIs and write-path tests used synthetic responses/in-memory executors.

## B. Discovery and module coverage

The [file inventory](MODULE_INVENTORY.md) lists every discovered source, script and test file, SQL-literal counts, textual test associations, and per-file Vitest coverage where measured. The [machine-readable inventory](evidence/source-inventory.json) additionally includes functions, routes, imports and literal SELECT queries. Discovery parses files and traces contracts; it is not a claim of line-by-line manual review or complete UI execution. Manual inspection concentrated on the higher-risk paths below.

The application contains nine controllers, 28 router modules, eight middleware modules, 62 backend utility modules, 95 page modules, 48 component modules, nine frontend service modules, four hooks and two contexts. The source-graph verifier resolves 1,102 relative imports across 452 files. The broader inventory includes tests, Cloudflare functions and audit helpers. Of 163 discovered test files after this work, 98 use source-file reading; some mix behavioral tests with source assertions. A file's textual test references are not execution coverage.

| Module and implementation | Checks actually performed | Remaining verification |
| --- | --- | --- |
| Patient registration/login/profile, `patient.controller`, patient services/pages | Validation/verification policies, recovery source trace, existing Node/Vitest tests, signed-token tests, browser login access/redirects | Real SMS/OTP registration and profile updates on synthetic DB accounts; duplicate registration races |
| Doctor, Staff, Admin, Superadmin authentication | Cookie/role guards, session-version checks, branch scope, password-change gates, token claim matrix, invalid/expired/replayed token tests; all five protected settings URLs redirect in browser without sessions | End-to-end login/MFA/password-change flows with isolated account records and multiple real tabs |
| Guest/public navigation and booking handoff | Existing portal/handoff tests; Superadmin session with `/login`, `/patient/login`, `/patient/register`; each portal's login under a different role session | Browser confirmation of every public CTA and authenticated handoff combination |
| Appointments, reasons, cancellations, rescheduling, schedules, doctor availability | Source/controller/service/route trace; scheduling, no-show, timezone, booking-readiness and branch tests; SELECT validation | Real simultaneous bookings, blocked dates and capacity under transactional TiDB writes; appointment editing on all screen sizes |
| Walk-in registration, scheduled check-in, queues and TV display | Existing behavioral/source regressions including branch safety, duplicate check-ins, queue state machine and scheduled-source preservation; anonymous display access tests | Real concurrent queue-number allocation, cross-instance advisory locks, scheduled check-in and doctor assignment against isolated DB |
| Consultation draft/finalize/edit/amend/history | New real-controller tests with injected DB, stale-version/rollback/finalization checks, branch checks; autosave queue failure/concurrency tests; browser load/retry/edit/rejection/mobile and delayed finalization/upload navigation scenarios | Full finalization/inventory/bill transaction in TiDB; amendments and actual signed/scanned uploads with provider failures |
| Clinical images, signed Cloudinary scans and bypass | Existing token/scan integrity tests, upload authorization tests, bounded input and branch trace | Actual malware scanning/quarantine, image gallery upload/remove flows and provider interruption; no Cloudinary requests made |
| Billing catalog, service materials, checkout extras, discounts, promotion review | Existing billing/security/selected-promotion tests, branch route contracts, input/rounding/authorization review; SELECT and live aggregate validation | Complete doctor-to-cashier workflow, promotion review/approval, precise totals, stale bill edits and rollback using real isolated transactions |
| Cash/manual GCash/Maya/bank payments and receipts | Payment helper/idempotency/authorization tests, locking and receipt allocation source review, branch/patient/payment aggregate consistency | Real concurrent cashiers, receipt allocation rollback, partial payments, change, duplicate submission and drawer close/reopen on disposable DB |
| PayMongo QR, webhooks, cancellation, refunds/reconciliation | Provider-mocked tests for duplicate events, identity/mode/amount/currency verification, unknown/cancelled states and refund proof; conservative lock behavior inspected | Explicitly authorized TEST-provider E2E and isolated DB transaction races. No real provider operation performed |
| Inventory items/UOMs/batches/locations, stock moves, returns and transfers | Existing stock/concurrency/manual-stock-out/multi-item-transfer suites; aggregate reconciliation; new Manila expiry boundary test | Real stock-contention/rollback and returns across branches; scanner/camera hardware, expiry/low-stock visual UAT |
| Supply requests and doctor stock requests | Grouped transfer/branch authorization tests and query/contracts review | Concurrent approve/receive/reject actions, partial failure and actual location/batch balances in isolated DB |
| Superadmin branches, team/accounts and global inventory | Branch provisioning/access tests, route coverage, dashboard partial-state tests, static UI and reference tests | Create/reassign/deactivate with isolated synthetic accounts; every dashboard/filter/button/mobile state |
| Admin/staff accounts, permissions, clinic/system/payment/receipt settings | Permission/delegation/password gates, branch-safe adapters, existing setup/settings/authorization suites | Complete permission matrix with real login cookies; concurrent settings edits and branch reassignment races |
| Promotions, announcements, campaigns and public news | Validation/consent/quota/signature/worker tests; campaign query bug found by real TiDB EXPLAIN and corrected | Campaign creation, recipient delivery/retry/unknown review and image authoring with isolated records/provider mocks |
| Notifications/SSE, refresh/polling hooks | Existing session/branch/SSE tests and browser mounting; hook lint fixes; event filtering/static route checks | Multi-instance reconnect, revoked sessions on a long-lived stream, notification read mutations and delayed cross-tab updates |
| Reports/analytics/reconciliation and exports | All 20 branch report queries EXPLAIN successfully; existing financial metrics/SQL/export tests; source graph and branch route verifier | Financial reconciliation through a complete seeded ledger and exported content compared to source transactions |
| Audit logs/archive/privacy | Source/filter/branch/pagination/SQL review; existing tests; reminder recipient logging removed | Archive/create/delete/race scenarios on disposable records, audit completeness after transaction failures |
| Password reset/settings/security codes, Resend/SMS | Hashing/purpose/rate-limit/input review; new atomic-reset and logout tests; existing mocked email/OTP failures | Concurrent OTP verification/resend and real TEST delivery. No messages sent |
| Landing/about/contact/services/doctors/news/privacy/terms and SEO | Route/import/build, existing presentation tests and source validation; browser login pages and default public layout | Every link/button, public CMS configuration, accessibility, real mobile networks and dynamic SEO indexing |
| Hosting/proxy/configuration/dependencies | Cloudflare proxy/local HTTPS tests, env/TLS validation tests, source/export checks, npm audits and production build | Actual Cloudflare/Render environment variables, logs, cache/origin headers and deployed readiness. Hosting was not accessed or changed |

Weighted Vitest line coverage by source area: controllers 7.62%, routers 38.83%, middleware 62.17%, utilities 33.56%, database connection modules 77.42%, server entrypoint 45.79%. This explains why source assertions passing could coexist with the campaign SQL failure.

## C. Findings and reproduction evidence

Each status below distinguishes a verified local fix from an open risk. Reproduction instructions use synthetic records, injected executors or an isolated database unless explicitly described as read-only metadata/EXPLAIN.

### F01 — High — TiDB-incompatible Batch 4 DDL (fixed locally)

**File/function:** `server/scripts/promotionMigration.js`, `runSelectedPromotionMigration`.

**Reproduce:** Start with promotion columns absent and invoke the registered runner against a TiDB-like executor that rejects adding a column and referencing it in an index/FK in one ALTER. Previously the runner sent the historical combined statement.

**Expected / actual:** Independent column/index/FK operations; previously the fresh path could repeat the known TiDB failure. A fully applied schema was already skipped correctly.

**Root cause / impact:** The guard classified tables, then executed the original combined DDL unchanged. New installations or recovery could fail before the ledger was written.

**Fix/evidence:** Derive separate column, index and FK operations without editing archived SQL; verify metadata; allow recovery at complete-column/index/FK boundaries; reject arbitrary partial/incompatible columns. Migration runner tests cover four DDL operations, interruptions, checksum mismatch, complete manual application with **zero ALTERs**, and partial-column refusal. Real DDL remains untested because no disposable DB was provisioned. TiDB documents limitations involving objects introduced within multi-change ALTERs: [PingCAP ALTER TABLE reference](https://docs.pingcap.com/tidb/stable/sql-statement-alter-table/).

### F02 — Medium — Batch 4 history is unsynchronized (open; no write attempted)

**File/function:** `server/scripts/branchMigrations.js`, `runRegisteredBranchMigrations`; `schema_migrations`.

**Reproduce:** SELECT metadata and registered history using `scripts/audit/liveReadOnly.cjs`. Both the supplied backup and the configured TiDB contain the complete schema and lack the Batch 4 entry.

**Expected / actual:** History should reflect verified application; the last registered migration is unrecorded despite its schema effects being present.

**Root cause / impact:** Manual DDL did not use the ledger-writing runner. Operational tools can mistake it for pending feature DDL. The missing row itself does not make consultation SQL fail.

**Recommendation/evidence:** Reconcile only through the reviewed registered runner after explicit authorization and staging rehearsal. It computes the actual file checksum and verifies schema before recording. Do not insert an ad hoc history row, invent a checksum, or run the four ALTERs again. Current complete-schema recovery tests prove no ALTER is submitted. The broad `npm run migrate` path has the separate F17 risk.

### F03 — High — Clinical routes omitted current branch ownership (fixed locally)

**File/functions:** `server/controllers/doctor.controller.js`, `getConsultation`, `updateConsultation`, `getPatientHistory`, `addConsultationAmendment`, `getClinicalUploadAppointment` and its callers.

**Reproduce:** Give the same doctor ID a new assigned branch, then request an old-branch consultation/history/upload or amendment. Previously several queries checked doctor ID alone.

**Expected / actual:** Current-branch ownership must be required; previously an old relationship could authorize these paths.

**Root cause / impact:** Branch middleware established `req.branchId`, but these object queries did not consistently consume it. Clinical data disclosure or inappropriate edits/uploads were possible after account reassignment.

**Fix/evidence:** Bind branch IDs in clinical selects, edits, amendments, history relationships and upload authorization. New controller tests return 404/403 for former-branch read/history/upload attempts before accessing billing/Cloudinary. SQL EXPLAIN validates the final queries. Production access was not attempted.

### F04 — High — Legacy consultation edit could race finalization (fixed locally)

**File/function:** `doctor.controller.js`, `updateConsultation`.

**Reproduce:** Hold finalization's appointment lock; start a legacy PATCH edit; finalize before releasing the lock. Previously the edit read draft status without locking before issuing its update.

**Expected / actual:** Original finalized records remain immutable; the unprotected read allowed a stale draft decision.

**Root cause / impact:** A check-then-write race could silently alter a finalized medical record.

**Fix/evidence:** Acquire appointment then consultation locks in the same order as draft/finalize, recheck finalized status under lock, and increment the record version. The injected-controller race test delays lock acquisition, changes state to finalized, and verifies rejection, zero updates, rollback and connection release. Actual TiDB lock contention still needs isolated integration testing.

### F05 — High — Initial load errors could initialize an editable blank draft (fixed locally)

**File/function:** `client/src/pages/doctorPage/Doctor_Consultation.jsx`, consultation loading effect; `client/src/utils/consultationLoad.mjs`.

**Reproduce:** Open an appointment while its saved-consultation GET returns network/auth/schema failure. Previously a blanket catch treated the error like an absent consultation, and `finally` enabled autosave.

**Expected / actual:** Editing should wait for a trustworthy saved baseline; previously typing into the resulting empty form could overwrite saved fields.

**Root cause / impact:** Missing record and failed load were conflated, risking loss of clinical text.

**Fix/evidence:** Only a genuine 404 with a matching editable appointment may initialize a new draft. Other failures show a retry panel and keep autosave disabled. Unit tests distinguish 401/403/409/503 and valid/invalid 404 initialization. Real-browser tests verify zero textareas/writes during load failure, restoration of saved content on retry, and subsequent successful saves.

### F06 — High — Concurrent clinical drafts had no stale-version rejection (fixed for current client)

**File/functions:** `server/utils/consultationIntegrity.js`, `assertConsultationVersion`; doctor draft/finalize/edit handlers; consultation page save wrapper.

**Reproduce:** Load version 1 in two synthetic sessions; save in one; submit the other's unchanged expected version. Previously the later request could overwrite the first writer.

**Expected / actual:** Conflicting changes should remain unsaved and visible; the database version was incremented but not checked.

**Root cause / impact:** Last-writer-wins behavior could silently overwrite another session's clinical notes.

**Fix/evidence:** The current client sends `expected_version`; the server compares it under the write lock, returns `CONSULTATION_VERSION_CONFLICT`, and returns the committed draft version. Tests prove stale rejection/rollback, initial version 0 and successive browser versions 7/8. **Compatibility limit:** legacy callers omitting `expected_version` remain accepted. Mandatory enforcement for every external/old client requires an API compatibility decision. Ambiguous committed writes with a lost response can produce a safe conflict on retry; keep a copy of the unsaved draft and compare the saved record before continuing.

### F07 — Medium — Returning to the same appointment could accept an old response (fixed locally)

**File/function:** `client/src/utils/consultationDraftQueue.js`, `reset`/`persist`.

**Reproduce:** Start saving A, switch to B, return to A before the old request completes, then resolve the first request.

**Expected / actual:** The new A editing session must own its baseline; appointment-ID equality alone previously allowed old success/error callbacks to change it.

**Root cause / impact:** Identity checks lacked a load generation, causing misleading saved status or signature replacement.

**Fix/evidence:** Reset increments a generation; save results/errors require both generation and appointment identity. Queued current-generation work resumes after old requests finish. The behavioral regression verifies only the current signature is reported saved.

### F08 — Medium — Permanent HTTP failures and malformed responses were mishandled (fixed locally)

**File/functions:** draft queue permanent-error classification; `client/src/services/doctor.service.js`, `requestJson`.

**Reproduce:** Reject a draft with 413, return HTML/null instead of API JSON, or stall a request. The 413 response was not included in permanent failures; requests had no timeout and JSON parsing lost HTTP context.

**Expected / actual:** Permanent rejection should stop repetition and keep content dirty; transient 408/429/network errors should remain retryable; unreadable responses must never count as success.

**Root cause / impact:** Repeated impossible saves, a stuck queue or misleading error/retry state.

**Fix/evidence:** Reject all permanent 4xx except 408/429; retain status on unreadable JSON; reject null responses; use a 30-second request timeout and preserve the request reference in messages. Behavioral tests cover 413 versus 408/429, malformed/null JSON and schema errors. The browser confirms schema rejection stays unsaved with retries stopped; a shared visible alert now appears above the tabs, including on mobile.

### F09 — High — Logout only deleted the browser cookie (fixed locally)

**File/functions:** `sessionSecurity.js`, `invalidateRequestSession`; all four controllers' `logout` handlers (Admin and Superadmin use separate cookies).

**Reproduce:** Copy a synthetic signed token, log out, replay the copy through session verification. Previously no session version was changed, so the copy remained usable until expiry.

**Expected / actual:** Logout should invalidate the authenticated session server-side; it previously cleared only the current browser's cookie.

**Root cause / impact:** Replayed tokens survived logout. Public logout handlers also lacked a resolved identity for their audit entry.

**Fix/evidence:** Verify the selected role cookie, reject mismatched admin portals, increment that account's session version, then clear the cookie. All five portal tests verify replay rejection, invalid/expired-token handling, cross-role rejection and database-outage propagation. **Behavior change:** existing session versions revoke every session for that account/role, including other devices; separate role accounts/cookies are not revoked. This follows the server-side invalidation requirement in [OWASP session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

### F10 — High — Password-reset consumption was not atomic (fixed locally)

**File/function:** `server/controllers/auth.controller.js`, `resetPassword`.

**Reproduce:** Submit the same verified synthetic reset token concurrently, or fail deletion/session revocation after the password update. Previously SELECT, password update, revocation and token deletion used separate pool queries.

**Expected / actual:** One locked transaction should consume a reset once and commit password/session changes together; previously partial completion/reuse windows existed.

**Root cause / impact:** A token could remain reusable after a password change, and partial failures could produce inconsistent security state.

**Fix/evidence:** Lock the reset row, change the password, revoke using the same connection, delete the token and commit before responding. New injected-connection tests check lock use, common executor, commit-before-response and rollback/release on a synthetic deletion failure. Real simultaneous reset submissions still require the isolated DB release gate.

### F11 — Medium — Campaign list fails strict TiDB grouping (fixed; live SQL verified)

**File/function:** `server/routers/branchAnnouncements.js`, `campaigns`.

**Reproduce:** EXPLAIN the original literal campaign list SELECT on the configured TiDB. It returns `ER_WRONG_FIELD_WITH_GROUP` even with no campaign rows.

**Expected / actual:** List campaign details and recipient counters; previously the endpoint's SELECT could fail with HTTP 500.

**Root cause / impact:** Selecting `c.*` and article title while grouping only `c.id` violates strict grouping. Existing tests validated announcement policy/source but never sent this SQL to TiDB.

**Fix/evidence:** Aggregate recipient statuses by campaign in a derived table, join to campaign/article rows with branch ownership, and return zero counters for no recipients. All literal SELECTs pass after the fix; this query passes five repeated TiDB EXPLAINs. The preserved [before result](evidence/live-read-only-before-campaign-fix.json) records the actual failure. Four other initial parse failures were harness `LIMIT NULL` artifacts and disappeared with valid synthetic numeric bindings.

### F12 — Medium — Global inventory expiry used UTC calendar dates (fixed locally)

**File/functions:** `server/routers/branchAllInventory.js`, `statusOf` and `/inventory/all` expiry filters/summary.

**Reproduce:** At `2026-10-27T16:05Z` (28 October in Manila), inspect an item whose nearest expiry is 27 October.

**Expected / actual:** It should be expired for the clinic; UTC slicing still treated the date as current.

**Root cause / impact:** `toISOString().slice(0,10)` delayed expired classification for the first eight hours of the clinic day and shifted upcoming-expiry cutoffs.

**Fix/evidence:** Use shared clinic-date helpers for today and day arithmetic. A route-level test with a fixed boundary clock verifies the expired row/filter/summary and excludes it from upcoming expiry. Actual lot deductions already use database clinic dates; this fix concerns the global summary.

### F13 — High/Medium — Known dependency advisories (fixed; audit verified)

**Files:** server/client package manifests and lockfiles.

**Reproduce:** Run the full npm audit against the original lockfiles. Backend: one high and two moderate affected package entries; frontend tooling: two high affected package entries.

**Expected / actual:** Supported compatible dependencies without the reported advisories; original locks retained affected versions.

**Root cause / impact:** Express 4.22.2/body-parser 1.20.6/qs 6.16.0 and Vite 8.3.0/Zod 4.6.5 were behind compatible fixes. The body-parser advisory describes an unauthenticated compressed-body process-crash condition. Vite issues primarily affect development tooling; they are not proof of an exploit against static Pages assets.

**Fix/evidence:** Express 4.22.3, explicit body-parser 1.20.9 and qs 6.16.1 overrides; client Vite 8.3.5 and transitive Zod 4.6.7. Installs disabled lifecycle scripts. Both final full audits report zero advisories; broad suites/build pass on the installed updates. [Upstream body-parser advisory](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828), [qs advisory](https://github.com/ljharb/qs/security/advisories/GHSA-6pq8-jhm2-2vcw), [Vite advisory](https://github.com/vitejs/vite/security/advisories/GHSA-9jrq-w75r-8gcw). Zero known advisories is not proof of absence of vulnerabilities.

### F14 — Medium — Frontend lint gate failed (fixed; warnings remain)

**Files/functions:** `useClinicRefresh` and `useSSE` callback-ref updates; `BookAppointment.loadBookingReadiness` unused catch variable.

**Reproduce:** Run the original `npm run lint`: three errors and 16 warnings.

**Expected / actual:** A passing lint gate; render-time ref writes and an unused variable failed it.

**Root cause / impact:** Callback refs were assigned during render. These can expose uncommitted callback state and violate React's ref rules; the unused exception variable was a separate error.

**Fix/evidence:** Update refs in effects and remove the unused binding. Final lint exits 0 with zero errors/16 warnings. Browser scenarios also mount the SSE/refresh paths. Existing dependency-array warnings are retained for separate behavioral review, not silenced.

### F15 — Medium — New passwords could lose their suffix under bcrypt (fixed locally)

**Files/functions:** `server/utils/accountSecurity.js`, `validatePassword`; `client/src/utils/passwordPolicy.js`.

**Reproduce:** Use two synthetic passwords sharing the first 72 UTF-8 bytes and having different suffixes. Original validation accepted both; bcrypt verified both against the same synthetic hash.

**Expected / actual:** Every accepted part of a new password should participate in verification; the original 128-character limit exceeded bcrypt's byte boundary.

**Root cause / impact:** Character-count validation ignored bcrypt truncation, including shorter Unicode strings with longer encoded values.

**Fix/evidence:** Reject newly set secrets above 72 UTF-8 bytes on server and client. Existing hash verification remains compatible; no stored password was changed. New backend/frontend tests exercise the exact boundary, extra suffixes and Unicode byte lengths.

### F16 — Low — Reminder failure logs included recipient email (fixed locally)

**File/function:** `server/utils/reminder.js`, `sendTomorrowReminders` catch block.

**Reproduce:** Make a synthetic reminder sender reject. Previously the log format interpolated the recipient and raw provider error text.

**Expected / actual:** Operational delivery errors should avoid contact data; recipient email could appear in hosting logs.

**Root cause / impact:** A diagnostic message exposed patient contact information to log readers.

**Fix/evidence:** Log appointment reference and error code without recipient or raw provider message. Static review verifies the changed statement; no email was sent to exercise it live.

### F17 — High — Broad schema reconciler can rewrite inventory and clinical data (open)

**File/functions:** `server/scripts/migrate.js`; `server/utils/schema.js`, `ensureAppSchema`, allocation backfills and `rebuildInventoryLocationStock`; `server/package.json`, `predev`.

**Reproduce on a disposable database only:** Create an unallocated positive batch in one branch and same-named Main Stockrooms in two branches. Run the full legacy reconciler. Its location-name join does not bind the batch's branch. Other source-location backfills likewise join names globally.

**Expected / actual:** Schema/history verification must not allocate one batch into unrelated branches or rebuild data without review. Source inspection shows unscoped allocation SQL, unconditional deletion/rebuild of location stock summaries, clinical-status updates and assorted data backfills before registered migrations. **These writes were not executed in this audit.** Current aggregate checks find no affected records requiring repair.

**Root cause / impact:** Historical single-branch repair logic is mixed with a multi-branch migration entrypoint. A future unallocated/legacy record can activate cross-branch allocations or unrelated rewrites. `npm run dev` also invokes it via `predev`.

**Recommendation/evidence:** Separate additive schema/history migration from explicit branch-aware data reconciliation; rehearse legacy and fresh baselines on disposable TiDB before authorizing the full command. Adding branch predicates blindly can break earlier bootstrap states where branch columns do not yet exist. This is a blocker to using `npm run migrate` as a casual ledger repair. The source and scripts were inspected; no production migration/history write occurred.

### F18 — High — Other in-flight clinical actions lacked navigation ownership (fixed locally)

**File/functions:** `Doctor_Consultation.jsx`, `handleFinalize`, `handleUploadProgressImage`, scan/bypass completion handlers and upload loop.

**Reproduction scenario:** Delay finalization or an image/scan response for A, navigate within the consultation route to B, then resolve A. Include multi-file uploads. These scenarios now run against delayed synthetic HTTP responses in the browser fixture.

**Expected / original source:** The load and draft queue paths had generation guards; these other asynchronous handlers called shared state setters after awaits without the same identity check. The original risk was identified statically; no pre-fix production failure is claimed.

**Root cause / potential impact:** A late response could mark a newly selected UI finalized or attach old upload state, stopping autosave or causing a token-context rejection. Server appointment IDs and signed upload tokens constrain database attachment but do not establish correct UI state.

**Fix/evidence:** Capture appointment/load ownership for finalization, amendments, upload/scan/bypass completion, status callbacks and cleanup; stop remaining files after navigation; clear pending upload/amendment UI state on route changes. Browser tests resolve A's finalization after B loads and verify B stays editable, then resolve the first of two image uploads after switching and verify B has zero images and the second file never starts. Real provider scanning and transactional finalization remain separate staging requirements.

### F19 — Medium — Logout UI ignored HTTP failure and duplicated requests (fixed locally)

**Files/functions:** `client/src/context/AuthContext.jsx`, `logout`; portal layout logout handlers; `client/src/utils/sessionLogout.mjs`.

**Reproduce:** Return HTTP 503 for logout. Previously fetch resolved normally, layouts redirected, and AuthContext cleared identity despite the server not confirming invalidation. Several layouts also sent a logout request before calling AuthContext's second logout request.

**Expected / actual:** One selected-role request and a confirmed sign-out before clearing identity; previously failed revocation could look successful and successful logout could produce duplicate requests/audit events.

**Root cause / impact:** Missing `response.ok` checks and split responsibility between context/layouts. A refresh could restore a supposedly logged-out session after an outage.

**Fix/evidence:** One timeout-bounded role-specific helper, awaited by AuthContext and layouts; errors retain local identity and surface failure. Tests verify all five endpoint mappings, HTTP/network rejection and single-request behavior. A browser test rejects a Doctor logout, confirms the consultation/session remains present, retries successfully, and checks exactly one request per click.

## D. File-by-file fixes and supporting artifacts

| File | Change and reason |
| --- | --- |
| `server/scripts/promotionMigration.js` | TiDB-compatible separated DDL and guarded recovery, preserving archived SQL |
| `server/tests/deployment/migrationRunner.node.cjs` | Models column/index/FK state independently and verifies interruptions/zero-DDL recovery/checksums |
| `server/controllers/doctor.controller.js` | Branch-bound clinical access, locked legacy edit, version checks/responses, server-side logout invalidation |
| `server/utils/consultationIntegrity.js` | Shared stale-version validation under clinical write locks |
| `client/src/pages/doctorPage/Doctor_Consultation.jsx` | Fail-closed load/retry, expected versions, visible errors/mobile tabs and generation-bound finalize/amend/image completions |
| `client/src/context/AuthContext.jsx` | Retain identity until shared logout succeeds |
| `client/src/components/layouts/DoctorLayout.jsx` | Await context logout; remove duplicate request and premature navigation |
| `client/src/components/layouts/PatientLayout.jsx` | Await one confirmed logout before home navigation |
| `client/src/components/layouts/AdminLayout.jsx` | Await the selected Admin/Superadmin role's logout before redirect |
| `client/src/components/layouts/StaffLayout.jsx` | One confirmed logout request; show failure and allow retry |
| `client/src/pages/superAdminPage/BranchPortals.jsx` | Handle failed central portal sign-out without clearing/navigating |
| `client/src/utils/sessionLogout.mjs`, `client/tests/sessionLogout.node.test.mjs` | Timeout-bounded role logout contract and HTTP/network/single-request regressions |
| `client/src/utils/consultationLoad.mjs` | Separates confirmed new consultation from failed existing-record load |
| `client/src/utils/consultationDraftQueue.js` | Generation ownership and permanent HTTP error handling |
| `client/src/services/doctor.service.js` | Request timeout, safe malformed-response failure, HTTP status and diagnostic reference retention |
| `client/tests/consultationAutosave.node.test.mjs` | New A→B→A, permanent/transient HTTP, failed load and API-response behavior regressions |
| `server/tests/consultations/clinicalSafety.node.cjs` | Executes real controller handlers with synthetic DB responses and transaction/rollback observations |
| `server/tests/security/clinicalUploadStatus.test.js` | Existing assertion now requires the branch argument; it was strengthened, not removed |
| `server/utils/sessionSecurity.js` | Verified selected-cookie invalidation using existing session versions |
| `server/controllers/admin.controller.js` | Separate Admin/Superadmin logout identity and revocation |
| `server/controllers/staff.controller.js` | Staff logout revocation and audit identity |
| `server/controllers/patient.controller.js` | Patient logout revocation and audit identity |
| `server/controllers/auth.controller.js` | Atomic locked password-reset consumption/password/session changes |
| `server/tests/security/sessionLifecycle.node.cjs` | Five portal logout/replay cases, cross-role/expired claims, outage/portal isolation, reset rollback and password byte boundary |
| `server/routers/branchAnnouncements.js` | Strict-mode-compatible campaign counters and branch-consistent article join |
| `server/routers/branchAllInventory.js` | Clinic calendar dates for expiry classification/cutoffs |
| `server/tests/inventory/clinicExpiry.node.cjs` | Route-level Manila-midnight expiry regression |
| `client/src/hooks/useClinicRefresh.js`, `client/src/hooks/useSSE.js` | Commit callback refs in effects to pass React rules |
| `client/src/pages/patientPage/BookAppointment.jsx` | Remove unused catch binding; readiness error behavior retained |
| `server/utils/accountSecurity.js`, `client/src/utils/passwordPolicy.js` | Consistent UTF-8 byte ceiling for new bcrypt passwords |
| `client/tests/passwordPolicy.node.test.mjs` | Boundary and Unicode policy regressions |
| `server/utils/reminder.js` | Redact contact details from delivery-failure logging |
| Server/client `package.json` and `package-lock.json` | Compatible patched dependency versions and explicit vulnerable-transitive overrides |
| `scripts/audit/networkGuard.cjs`, `runChecks.cjs` | Reproducible checks with dotenv loading disabled, synthetic DB configuration and external-network blocking for tests; registry-only exception for npm audit |
| `scripts/audit/backupAudit.py`, `sourceAudit.cjs` | Offline schema/integrity/migration hashes and module/SQL/test discovery |
| `scripts/audit/liveReadOnly.cjs`, `integrityQueries.cjs` | SELECT/EXPLAIN-only live metadata/query/aggregate checks without schema bootstrap or row-value output |
| `scripts/audit/browserSmoke.cjs` | Headless browser against the built client, synthetic API only, external requests blocked, screenshots and recorded results |
| This directory | Sanitized report, inventory, full command logs, JSON evidence and synthetic screenshots |

## E. Database and migration disposition

| Registered migration | Live/backup ledger | Checksum | Schema status |
| --- | --- | --- | --- |
| `2026-10-09-multi-branch-foundation.sql` | Recorded | Matches accepted line-ending variants | Detailed foundation verification passes |
| `2026-10-15-branch-ledgers.sql` | Recorded | Matches | Backup/live metadata match |
| `2026-10-15-cashier-branch-uniqueness.sql` | Recorded | Matches | Required uniqueness present |
| `2026-10-16-paymongo-test-qr.sql` | Recorded | Matches | Gateway tables/indexes present |
| `2026-10-17-announcements-campaigns.sql` | Recorded | Matches | Campaign tables/indexes present |
| `2026-10-26-batch4-selected-promotion.sql` | **Not recorded** | No saved checksum to compare | All eight appointment columns, six billing columns, index and SET NULL FK already present |

There are **45 SQL files in `server/db/migrations`**, of which six are registered by the current runner and 39 are historical/manual/unregistered. The other 39 are **not automatically pending**. Their execution history cannot be inferred from a missing ledger row: many effects are reconciled by the legacy bootstrap. The two `.MANUAL.sql` feature sets (required Admin password change and promotion images) are present in current metadata. Historical data backfill execution was not certified.

The offline reconciler contract extracted 525 required column names and found none missing. Live comparison covers all 831 backup columns and all 233 indexes, with no differences. All 89 FK relationships/rules match and their orphan counts are zero. Primary/unique-key and NOT NULL checks in the backup pass; 32 extra live aggregates include patient/appointment consistency, branch relationships, negative stock, batch over-allocation, stock summaries, bill arithmetic/subtotals, overcollection, paid balances, gateway review/settlement links and finalized/completed status.

**Records requiring attention:** none identified by those checks. This statement is bounded to the tested invariants and audit snapshots; it does not certify diagnoses, financial authorizations, historical branch attribution or provider truth for each record.

**Additional SQL needed now:** no additional promotion feature DDL is indicated. No destructive repair or data reseed is indicated. The Batch 4 **ledger** remains to be reconciled through a reviewed runner path after approval; it must not trigger redundant DDL or the unrelated F17 data repair logic. The audit did not manually insert a migration row or compute an invented ledger value. Raw migration files remain unchanged, and pinned historical checksum tests pass.

Full machine evidence: [backup audit](evidence/backup-audit.json), [live read-only audit](evidence/live-read-only.json). The supplied backup is not copied into this repository; only definitions, hashes and aggregate counts are retained.

## F. Commands and regression results

Every package script was inspected before use. `server`'s `pretest` runs source verification. **`predev` runs `migrate`**, so neither `npm run dev` nor a production server startup was used for this audit. `npm run migrate` was never run.

The commands below are executed by `node scripts/audit/runChecks.cjs ...`, with child `NODE_OPTIONS` loading the audit-only network guard and with no clinic credentials in test subprocesses. On Windows the helper invokes npm's JS entrypoint to avoid PowerShell policy/quoting issues. Each command/cwd/exit/duration is retained in its JSON/log evidence.

| Working directory / command | Final result |
| --- | --- |
| `server`: `npm run verify:source` | Pass; 452 files / 1,102 relative imports |
| `server`: `npm test` | 77 files; 262 passed; 0 failed/skipped |
| `server`: `npm run test:node` | 60 files; 331 passed; 0 failed/skipped/cancelled/todo |
| `client`: `node --test` with all 24 `tests/*.mjs` paths enumerated by helper | 101 passed; 0 failed/skipped/cancelled/todo |
| root: `node --test tests/deployment/sourceExport.node.cjs` | 1 passed; 0 failed/skipped |
| `client`: `npm run build` | Pass; Vite 8.3.5; chunk-size advisory remains |
| `client`: `npm run lint` | Pass; 0 errors, 16 warnings |
| `server`: `node scripts/verifyBranchRouteCoverage.js` | Pass; 139 Admin service calls mapped, 148 known patterns, no unmatched routes; Staff/Doctor/Patient runtime ownership is separate |
| Both packages: `npm audit --json --ignore-scripts --fetch-retries=0 --fetch-timeout=15000` | Both exit 0, all severity counts zero |
| `server`: Vitest coverage with explicit controllers/routers/utils/middleware/db/entrypoint includes | 262 passed; coverage percentages above; [JSON](evidence/coverage/coverage-summary.json) |
| root: `python scripts/audit/backupAudit.py <supplied-backup-path>` | 666 checks; no violations; no DB import |
| root: `node scripts/audit/sourceAudit.cjs` | All inventoried JS/JSX/MJS/CJS parse; no static missing-column candidates in supported SQL extraction |
| root: `node scripts/audit/liveReadOnly.cjs` | Live schema/ledger/integrity; 571 literal SELECT EXPLAINs + 20 report EXPLAINs; repeated campaign EXPLAINs; existing deployment-verifier logic under read guard |
| root: `node scripts/audit/browserSmoke.cjs` | Ten passed; zero uncaught browser exceptions; local synthetic APIs only |
| root: `node scripts/audit/runChecks.cjs browser-smoke --repeat=5` | Five clean runs of ten browser scenarios; 50 passes |
| root: `node scripts/audit/runChecks.cjs focused-node focused-client inventory-regression --repeat=5` | Five clean runs, 61+25+11=97 tests each, 485 passes; no skips |

The exact long frontend and focused-suite command arguments are in [runChecks.cjs](../../scripts/audit/runChecks.cjs) and the corresponding `evidence/*.json` files. Coverage command: `node node_modules/vitest/vitest.mjs run --coverage --coverage.include=controllers/** --coverage.include=routers/** --coverage.include=utils/** --coverage.include=middlewares/** --coverage.include=db/*.js --coverage.include=server.js --coverage.reporter=json-summary --coverage.reporter=text-summary --coverage.reportsDirectory=../docs/audit-2026-10-28/evidence/coverage` from `server`.

The direct `npm run verify:reports-sql` helper initially failed with `ECONNREFUSED` at the deliberately unreachable synthetic test DB. This is an environment result, not a passed SQL integration test. The actual report SQL was subsequently validated through the live read-only guard. The existing deployment verifier's result is recorded separately; checking local configuration does not establish Cloudflare/Render production settings.

Observed intermediate failures were corrected and not counted as passes: four environment tests initially inherited an audit-only payment-mode setting (helper corrected); a source-format assertion needed the new required branch argument (strengthened); npm audit was initially blocked by the test network guard (registry checks separated); four EXPLAIN parse errors came from invalid NULL pagination bindings (numeric bindings fixed); browser startup required a local headless sandbox compatibility flag; and a temporary JSX relocation mistake was caught by build/lint and corrected. The final artifacts contain the final successful checks. The campaign grouping failure and original dependency audit evidence are preserved separately.

The browser fixture uses an isolated temporary profile, headless Chromium and `--no-sandbox` to work inside the managed Windows environment. Its APIs are synthetic, external page requests are intercepted/blocked, and it does not open clinic/provider accounts. That launch configuration is for this local fixture only. Screenshots: [load failure](evidence/consultation-load-error-desktop.png), [mobile rejected save](evidence/consultation-blocked-save-mobile.png). The historical local HTTPS test emits a TLS-verification warning for its self-signed fixture; it restores that test setting and is not a production TLS configuration change.

## G. Remaining risks and limits

- **Open High F17:** the full schema reconciler needs branch-safe data-repair separation before it can be approved as a generic migration/history repair path.
- Finalization and delayed image/navigation guards now pass synthetic browser regressions (F18). Real provider scans, bypass authorization, amendments and finalization/inventory/billing transactions remain to be exercised together in staging.
- **Compatibility risk:** current-client clinical drafts use optimistic versions; legacy payloads without `expected_version` remain last-writer-wins. Removing this compatibility path requires rollout planning.
- Draft content is held in component memory. A confirmed save survives reload, and dirty reloads have a browser warning. Forced browser/process loss while offline is not covered by durable draft recovery. No unreviewed patient-data persistence was added to browser storage.
- Network-loss/rollback tests inject executor/provider failures. No actual active-database outage, lock wait/deadlock, transaction rollback or retrying TiDB client was forced. No disposable MySQL/TiDB or Docker service was available for write integration tests.
- Five role login pages and unauthenticated redirects ran in a browser with mocked check-auth responses. This is not five-role credential/OTP/MFA/permission UAT against real account rows. No production login was used because it can write audit/profile/session state.
- Payment tests use mocked provider proof and synthetic executors. They verify conservative QR locks, duplicate webhook handling and authorization logic, but cannot prove multi-instance receipt, refund, drawer-close and inventory atomicity in TiDB. No PayMongo account was contacted.
- OTP creation/verification/resend concurrency, long-lived SSE session revocation and real external upload/delivery failures require additional tests. Full-page access control remains server-enforced; a connected SSE stream's lifetime is a separate release check.
- Lint warnings remain in AdminLayout, ToastProvider, useClientPagination, billing service form, checkout/reports/system setup, booking, availability/rescheduling and Superadmin shared refresh code. Some concern stale dependency closures. They were not suppressed or declared harmless without behavioral proof.
- The production JS bundle is roughly 2.96 MB (about 655 kB gzip). Page-specific lazy loading and mobile performance measurements are recommended; no performance budget or throttled-network release test was supplied.
- No measured frontend coverage, all-page browser traversal, camera/device test, automated accessibility audit, screenshot comparison suite, deployed origin/cache/cookie inspection or active-provider end-to-end test was completed. Static/extracted SELECT validation does not cover every dynamic query, DML statement or business invariant.
- Package audits are a point-in-time registry result. Secrets are untracked in Git, tests did not load `.env` values, and reports contain no patient rows/tokens/passwords/provider keys; this is not a complete Git-history secret scan or verification of remote secret rotation.

## H. Required release gates and deployment recommendation

**NO-GO until the following gates are completed.** These are next steps, not actions performed or authorized production changes.

1. Review the local diff and the delayed-response clinical/logout browser regressions. Decide how legacy consultation versionless writes will be retired, and define the clinic's acceptable unsaved-draft recovery behavior.
2. Provision an explicitly disposable TiDB schema and synthetic five-role accounts. Rehearse fresh migrations, manually complete-but-unrecorded Batch 4, each partial DDL boundary, incompatible metadata, and two concurrent runners. Validate the precise unchanged file checksum and zero redundant ALTERs for a complete schema. Resolve F17 before exercising the broad reconciler against any database with records.
3. Run the complete patient booking → scheduled/walk-in check-in → queue → draft/prescription/images → finalize/inventory → promotion/discount review → cash/manual payment → receipt → cashier close/reopen journey. Include repeat submissions, lost responses, two users, two app instances, midnight boundaries, expired sessions, branch reassignment and rollback after every stock/financial write boundary.
4. In provider-mocked integration first, then only in an explicitly authorized PayMongo TEST environment, verify QR pending/unknown/expiry/cancel/paid/refund states, duplicate/reordered webhooks and late settlement after alternate actions. Require transaction-level proof that receipts and stock are not duplicated. Test email/SMS/upload integrations without real patient recipients.
5. Close the high-risk coverage gaps with behavioral assertions, especially controller mutations, permission/branch combinations and critical UI actions. Review the 16 warnings by behavior; keep build/lint/tests, dependency audits and checksum checks as release gates.
6. Separately review actual Render/Cloudflare configuration, signed proxy boundary, TLS/cookies/origins, readiness, upload limits, webhook secrets/mode and startup migration flag. No hosting configuration was read or changed in this audit. Do not infer deployed settings from the local `.env`.
7. After those gates pass, obtain explicit approval for any external migration/history reconciliation and deployment. The current selected-promotion feature needs **no additional feature ALTER**. Use the reviewed runner, not ad hoc ledger SQL. Keep automatic startup migration off while the broad reconciler remains unresolved. Install from the updated lockfiles, run the final local/regression checks, then deploy only through the approved release process.

The full requested write-path integration and production certification remain unfinished because the audit deliberately did not mutate external/active systems. The local fixes and sanitized evidence are ready for review; nothing has been committed, pushed or deployed.
