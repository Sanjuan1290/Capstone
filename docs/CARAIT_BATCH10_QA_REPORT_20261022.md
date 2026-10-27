# CARAIT Clinic — Batch 10 QA & Release Readiness Report

**Assessment:** 22 October 2026 (Asia/Manila)  
**Release decision: BLOCKED — NOT PRODUCTION-READY**  
**Execution surface:** offline reconstructed source (`AllCodes(20261022-082938).txt`) with the October 22 **Batches 1–9 cumulative patch** overlaid. The complete deployed Git commit, real frontend/backend build, TiDB connection, and browser sessions were not available. This is a **partial executed QA**, not an end-to-end clinical acceptance certificate.

## Executive findings

1. **Frontend Node regressions: 66/66 PASS.** `CARAIT_BATCH10_CLIENT_FINAL.log`.
2. **Backend Node regressions: 251/253 PASS, two cannot run due to missing dependencies.** `CARAIT_BATCH10_BACKEND_FINAL.log`. Two integration test files fail at module load (`express` or `mysql2/promise`); neither establishes that the corresponding production feature works or fails.
3. **456 JavaScript/JSX files parse**, including 140 JSX files, with zero parser diagnostics. `B10_syntax.json`.
4. **430 source files / 1,062 relative imports resolve**. `B10_sourcegraph.log`.
5. **Admin/branch API route static check: 137 frontend calls, 146 registered patterns, zero unmatched**, within the tool's stated Admin-only scope. `B10_routes.json`.
6. **All five pinned historical migration checksums match** after correcting one extra newline accidentally appended by the flattened source-export reconstruction. `B10_migration_runner.log`: 5/5 PASS. **No SQL schema or migration content was changed.**
7. QA correction package fixes one *real testability concern* (reports importing the DB module before a supplied executor is used) and updates two obsolete tests to assert the intended guest-only login routes and partial-dashboard behavior. **No production database or financial calculation was modified.**
8. **Production build/Vitest attempts blocked on unavailable dependencies; no hosted browser UAT, actual provider integration, device scan, concurrency load, or rollout performed.** The local read-only runtime preflight finds no API listening at localhost:3000 and reports 0/6 reachable probes; that result does not diagnose the deployed host.

## Batch 10 phase-by-phase outcomes

| Phase | Evidence completed | Result | Still required |
|---|---|---|---|
| **10.1 Source & build** | Reconstructed October 22 source and cumulative update; dependency-free Node suites, parser, route/source graph | **PARTIAL PASS** | Compare real Git HEAD and deployed Render/Cloudflare revisions; `npm ci` with working dependencies; client Vite build/lint; server Vitest; server startup (local Vite/Vitest attempts exited 127: commands unavailable) |
| **10.2 TiDB / migrations** | Pinned historical migration hashes verified; mocked migration runner tests 5/5 PASS | **PARTIAL PASS** | Take verified DB backup; query live/staging schema; migrate disposable TiDB clone; branch clone integrity, existing record preservation and rollback compatibility |
| **10.3 Roles & security** | Existing static/unit role, branch and SSE security tests passed; stale login test updated with stronger assertions | **PARTIAL PASS** | Real Super Admin, Branch Admin, Staff, Doctor, Patient and anonymous API/browser sessions; MFA, required password, revocation and direct-IDOR probes |
| **10.4 Patient booking** | Existing booking unit regressions passed; source routes resolved | **PARTIAL PASS** | Authenticated booking readiness against TiDB; 12-hour cutoff, doctor/service/branch matching; dual-patient same-slot contention; cancellation and rescheduling E2E |
| **10.5 Clinic workflow** | Existing unit/static checks for doctor consultation, appointments, queue, clinical inventory | **PARTIAL PASS** | Synthetic complete patient and walk-in journeys through doctor consultation and finalization on staging |
| **10.6 Inventory & finance** | Branch billing and Daily Close fake-DB tests now pass; PayMongo unit regressions pass | **PARTIAL PASS** | TiDB-backed inventory batches, stock transfers, receipt uniqueness, cash drawer, refunds/voids, confirmed PayMongo TEST webhooks; no LIVE transactions |
| **10.7 Promotions / SSE** | Existing promotion approval-token and SSE branch-isolation regressions passed in Node suite | **PARTIAL PASS** | Real Cloudinary moderation (pending/approved/rejected), three-offer carousel, two-browser SSE/reconnect, Render topology, no cross-branch data leaks |
| **10.8 Mobile/accessibility** | All JSX parses and UI Node tests pass | **NOT RUN (DEVICE)** | Android Chrome + iPhone Safari physical camera autofocus/rear selection, orientation, keyboard, dialogs, carousel accessibility |
| **10.9 Reliability/performance** | Existing concurrency/security unit regressions pass | **NOT RUN (HOSTED)** | Load/concurrency, API/database failure injection, long-running SSE, outage recovery, slow-query baselines, latency/error rate evidence |
| **10.10 Release & monitoring** | This release gate and handoff produced | **BLOCKED** | Stakeholder UAT approval, reviewed migrations, staging sign-off, backend/frontend deploy in controlled window, production smoke tests and rollback verification |

## 12 previously failing backend tests — root-cause reconciliation

Baseline run: **241 pass / 12 fail**. Final local run: **251 pass / 2 fail**. The ten resolved failures are categorized below:

| Count | Category | Resolution / evidence |
|---:|---|---|
| 7 | `branchReadContracts` (6) + Daily Close ledger (1) could not import `reportMetrics` without `mysql2` although injected executors made actual DB access unnecessary | Deferred DB loading until executor fallback is used (`server/utils/reportMetrics.js`); focused cases 14/14 passed; full suite improved |
| 1 | Historical migration hash mismatch in flattened export | Traced to **one extra trailing newline** added to reconstructed SQL files; restored canonical original bytes and independently validated all five pinned SHA-256 hashes; migration test suite 5/5 |
| 1 | Login route test expected the old unguarded `<AdminLogin />` route | Updated test to expect role-aware `<GuestOnlyRoute>` wrapping both Admin and Super Admin logins and the patient login; verified guard checks session readiness and redirects |
| 1 | Original Dashboard test expected old error wording | Updated test to check the new branch dashboard error message, partial-summary state, blank-for-unavailable counts, independent appointments error and loading reset |
| **2 remain** | Cloudflare local integration and schema bootstrap preservation test files cannot resolve `express` / `mysql2` | **NOT EXECUTED**, not passed. Install dependencies and rerun. Do not weaken or disable tests. |

**Migration note:** A hash mismatch due to the export parser is **not proof** the real Git migration file matches its deployed schema-migration ledger. Compare the original Git file's checksum and the TiDB migration ledger in staging before approving release. Do **not** rewrite pinned hashes, edit historical migration SQL, or run a production migration just to satisfy a test.

## Batch 10 QA corrections (only 3 files)

- `server/utils/reportMetrics.js`: Lazily resolve the default `../db/connect` dependency. Real SQL and aggregation logic unchanged; injected fake-DB unit tests no longer instantiate a database module as a side effect.
- `server/tests/security/adminPortalLogin20261009.node.cjs`: Replace obsolete direct-login expectations with checks for the guest-only guard on all login paths and appropriate routing behavior.
- `server/tests/security/originalAdminPortalBranch20261009.node.cjs`: Assert currently intended independent dashboard error states and missing-value presentation rather than removed text.

**Delivery:** `CARAIT_BATCH10_QA_CORRECTIONS_20261022.patch` applies to the **exact reconstructed October 22 Batches 1–9 baseline**. Review with `git apply --check` before applying; **never combine it with an older version of the same modules without reconciliation**. No database migration accompanies this QA patch.

## Critical staging acceptance matrix (unexecuted)

| ID | Scenario | Expected result | Owner / environment |
|---|---|---|---|
| UAT-01 | Five role logins; logout, MFA, password changes, session revocation | Correct portals and enforced account states | Authenticated browser staging |
| UAT-02 | Direct API access to another branch or patient's records | Denied without disclosing private data | Two-branch TiDB staging |
| UAT-03 | Blank, Standard, Copy Branch creation | Correct configuration, no transferred stock/patients/accounts/finances | Disposable TiDB clone |
| UAT-04 | Copy services referencing consumables | Services remain inactive or marked incomplete until destination materials are properly assigned | TiDB clone |
| UAT-05 | Create/edit/delete service as Super Admin and Branch Admin | Correct branch context, no redirect to `/admin/login` | Authenticated browser |
| UAT-06 | Patient booking readiness and slot validation | Correct doctor/service, clinic restrictions and 12-hour cutoff | TiDB staging |
| UAT-07 | Concurrent same-slot booking | No double booking; one request safely rejected | Concurrent API clients |
| UAT-08 | Reschedule/cancel, doctor time off, queue, walk-in & consultation | Correct resulting patient/doctor/admin states | End-to-end browser |
| UAT-09 | New Medicine and historical Supply item | New item has Medicine type; historic supply remains editable and usable | Admin/Staff browsers |
| UAT-10 | Receive, transfer, consume and return inventory | Quantities, batch movements and ledger stay consistent | TiDB staging |
| UAT-11 | Barcode camera on Android Chrome and iPhone Safari | Rear camera where supported; reliable decode/fallback; cleanup | Physical devices |
| UAT-12 | Promotion create, image moderation and dashboard | Scan approval enforced; up to 3 featured; View All; no price mutation | Cloudinary + staging |
| UAT-13 | SSE with two branches, two accounts, reconnection | Correct authorized refresh; no cross-branch exposure; preserved unsaved forms | Render/Cloudflare staging |
| UAT-14 | Cash/QR Ph billing, PayMongo TEST webhook duplicates | No false paid status, double processing, refund/receipt errors | PayMongo TEST + TiDB clone |
| UAT-15 | Daily Cash Reconciliation | Physical cash excludes QR Ph, correct refunds/closing | Cashier staging |
| UAT-16 | Mobile and tablet modals, availability, keyboard & carousel | No clipped controls, usable focus/navigation | Real devices and browsers |
| UAT-17 | Database outage, Render restart, network disconnect | Appropriate errors and recovery without duplicate mutations | Staging failure injection |
| UAT-18 | Controlled release & rollback | Verified backup, safe schema, consistent commits, smoke tests | Operations / stakeholder sign-off |

**Do not mark these as PASS based on source inspection.** They require executable staging evidence, including dates, URLs/commit identifiers, logs and reviewer names.

## Exact release gates before deployment

1. **Reconcile version:** Obtain real Git HEAD, Render service commit and Cloudflare Pages deployment commit. Apply only the compatible update. Do not deploy a reconstructed export or overwrite original binary assets.
2. **Clean install:** On an internet-enabled or pre-provisioned CI runner, `cd client && npm ci && npm run lint && npm run build && node --test tests/*.node.test.mjs`; `cd server && npm ci && npm run verify:source && npm run test:node && npm test`. Resolve **all** failures that affect production release, including the two unavailable integration suites. Document any truly obsolete assertion and its approved replacement.
3. **Database:** Back up/restore a disposable TiDB clone, inspect columns and hashes before any migration. `server/db/migrations/2026-10-22-batch7-promotion-images.MANUAL.sql` is **NOT idempotent** and MUST NOT run if any of its three columns exist. Use the reviewed idempotent schema reconciler in staging when appropriate.
4. **Secrets/media:** Confirm Cloudinary server credentials, moderation provider capability, Resend, secure cookies and appropriate domain/proxy env. Never publish secrets in build artifacts or logs.
5. **Financial isolation:** PayMongo **TEST** only during UAT. Confirm idempotent webhook handling, refunds, receipt numbering, cash reconciliation and existing transaction conservation. Never run destructive database resets.
6. **Performance/recovery:** Record measured staging baseline (including mobile, SSE and concurrent operations), use targeted load with synthetic data, and verify error/reconnect handling.
7. **Approve:** Require zero unresolved P0/P1 issues, authenticated clinical and payment sign-off, and a tested rollback runbook. Only then deploy a reviewed backend and matching frontend commit; perform read-only smoke tests first and monitor live errors.

## Offline execution / artifacts

- `CARAIT_BATCH10_CLIENT_FINAL.log` — frontend Node results (66/66).
- `CARAIT_BATCH10_BACKEND_FINAL.log` — backend results after QA corrections (251/253), including full two outstanding errors.
- `B10_migration_runner.log` — migration runner 5/5 after reconstructing original file bytes.
- `B10_auth_dashboard_tests.log` — updated 12/12 login/dashboard checks.
- `B10_reportmetrics_targeted.log` — 14/14 fake-DB read-contract checks.
- `B10_sourcegraph.log`, `B10_routes.json`, `B10_syntax.json` — source/import/API/parse validation.
- `B10_runtime.log` — confirms no local API was available for HTTP preflight (0/6; **not a deployed-host result**).
- `B10_client_build.log` and `B10_server_vitest.log` — actual build/test attempts fail because `vite` and `vitest` are not installed in the reconstructed source environment.
- `CARAIT_BATCH10_QA_CORRECTIONS_20261022.patch` — 3-file reviewable patch.

## Final decision

**BLOCKED.** The available dependency-free and static checks are encouraging and ten of twelve previous local backend failures have been reconciled. However, **the live clinic system is not certified**, and no evidence exists here for a successful production build, real TiDB migration, physical camera validation, authenticated E2E patient-to-payment journey, provider payment settlement, or release rollback. This report intentionally does **not** claim deployment or production verification.

