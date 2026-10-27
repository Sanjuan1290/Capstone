# CARAIT Clinic System — Final Pre-deployment Remediation & QA

**Review date:** 2026-10-20
**Repository:** `D:\Programming IDE_Codes\ALLPROGRAMMING_FILES_CODES\CAPSTONE`
**Starting revision:** `a6e0ee7` (`feat: update dependencies and improve migration handling`), clean worktree at review start
**Decision:** **READY FOR STAGING** — controlled staging verification only; not production certification.

## A. Implementation report

This review used the actual Git repository. The named source reference `AllCodes(20261020-035717).txt` is not present. The existing `.env` files were left unread. No database connection, migration, deployment, PayMongo request, real payment, or SQL migration edit was made.

- Added `server/scripts/foundationSchema.js` to verify the full multi-branch foundation contract from actual TiDB/MySQL information-schema metadata and seed queries: 28 tables, 27 branch-column definitions/defaults/nullability, 22 indexes, five foreign keys and delete rules, branch and booking-settings seed rows, the unscoped Super Admin, and branch ownership null/orphan invariants.
- Wired this contract into `branchMigrations.js` before the foundation migration is recorded and as a drift check for previously recorded foundations. An unrecorded partial foundation is retried. Recovery only removes an old global unique index after verifying or safely creating its exact branch-scoped replacement; malformed indexes and missing foreign keys fail with a diagnostic instead of being blindly recreated.
- Fixed consultation autosave races across slow saves, appointment route changes, stale loads, failures, and finalization. Saves are serialized and appointment-scoped; a latest dirty draft is saved after an in-flight write, while finalization prevents queued draft writes from starting afterward.
- Added deterministic source export tooling that includes project assets and excludes credentials, local `.env` files, dumps, generated exports, archives, dependencies, build output, and temporary files.
- Added a local HTTPS integration test that routes requests through the actual Cloudflare Pages Function to a running local Express server.

## B. Changed files

Modified:

- `client/package.json`
- `client/src/pages/doctorPage/Doctor_Consultation.jsx`
- `docs/DEPLOYMENT_RUNBOOK_2026-10-20.md`
- `docs/PREDEPLOYMENT_AUDIT_2026-10-20.md`
- `server/package.json`
- `server/scripts/branchMigrations.js`
- `server/scripts/verifyDeployment.js`
- `server/tests/branchIntegration/branchSafetyFixes.node.cjs`
- `server/tests/deployment/migrationRunner.node.cjs`

Added:

- `client/src/utils/consultationDraftQueue.js`
- `client/tests/consultationAutosave.node.test.mjs`
- `server/scripts/exportDeployment.js`
- `server/scripts/foundationSchema.js`
- `server/scripts/sourceExport.js`
- `server/tests/deployment/foundationSchema.node.cjs`
- `server/tests/deployment/sourceExport.node.cjs`
- `server/tests/helpers/foundationSchemaFixture.cjs`
- `server/tests/hosting/cloudflareLocalIntegration.node.cjs`

All files under `server/db/migrations/` are unchanged. Existing user deliverables were not deleted.

## C. Test report

Dependency installation completed from both current lockfiles using `npm.cmd ci` with per-package temporary caches.

| Command | Result |
|---|---:|
| `cd server && npm.cmd run verify:source` | Passed: 400 source files; 994 relative imports resolved |
| `cd server && npm.cmd run test:node` | Passed: 202 tests; includes foundation/export regressions and local proxy integration |
| `cd server && npm.cmd test` | Passed: 77 files, 259 tests |
| `cd client && npm.cmd run test:design` | Passed: 8 tests |
| `cd client && npm.cmd run test:hosting` | Passed: 5 tests |
| `cd client && npm.cmd run test:autosave` | Passed: 7 tests |
| `cd client && npm.cmd run lint` | Passed: 0 errors, 15 warnings |
| `cd client && npm.cmd run build` | Passed: 2,080.32 kB JS (507.86 kB gzip); Vite chunk-size advisory |
| `cd server && npm.cmd audit --omit=dev` | Passed: 0 production vulnerabilities |
| `cd client && npm.cmd audit --omit=dev` | Passed: 0 production vulnerabilities |
| `git diff --check` | Passed; Git printed only line-ending conversion warnings |

Across the five executed test commands, **481 passed, 0 failed, 0 skipped**. The local proxy check uses a local HTTPS server; it is not a live Cloudflare or Render integration. TiDB metadata, migration locks, and schema recovery use mocks/fixtures.

The full dependency-tree audit reported 3 high development-only server findings and 5 high plus 2 moderate client build-tool findings during dependency installation. Production-only audits are clear. Review build-job exposure and update compatible tooling when fixes are available; do not use forced major upgrades as part of staging preparation.

Not run: `npm.cmd run verify:deploy`, migrations, database-backed reports checks, startup/readiness against an identified disposable database, five-role browser UAT, or PayMongo sandbox/webhook tests. No disposable TiDB target was confirmed. No external service or database was contacted.

## D. TiDB migration verification

The complete foundation migration contract is covered by metadata-driven implementation and automated fixture tests, including valid, incomplete, and partial-index-recovery cases. The runner also retains migration ordering, checksum, locking, and retry coverage. The historical SQL files and their checksums remain untouched.

**No real TiDB instance was used.** Run the documented migration, `verify:deploy`, readiness, operational reads/writes, and concurrency recovery checks only against a newly created, disposable staging database after confirming backup and restore. The existing local database configuration was not read or used.

## E. Security report

| Severity | Finding | Status |
|---|---|---|
| Medium | Pages-to-Render client-IP HMAC includes IP, timestamp, method, and URL and expires after 60 seconds, but does not use a shared one-time nonce or sign the request body. A captured valid header could be replayed within that window for the same method and URL. | TLS protects the normal hop; resolve with distributed replay protection or formally accept before production. Per-process memory is insufficient for multiple Render instances. |
| High (development tooling) | Full dependency-tree audit reports development/build tool advisories; the production dependency trees have zero reported vulnerabilities. | Use production-only Render installation; restrict CI/build jobs to trusted source and track compatible upstream fixes. |
| Medium (release gate) | TiDB, hosted Pages/Render behavior, five-role browser UAT, and PayMongo sandbox processing have not been exercised against staging. | Open staging verification items. Source now supports TEST/LIVE modes, with new LIVE QR creation explicitly gated; the deployed commit and environment remain unverified. |
| Low | ESLint reports 15 existing hook/dependency warnings; production build reports one oversized JavaScript chunk advisory. | No lint errors or build failure; review before unrelated UI refactoring or broader performance work. |

As of source commit `ac11370`, PayMongo supports matching TEST/LIVE key prefixes, mode-specific webhook signatures, and LIVE QR creation behind `PAYMONGO_LIVE_ENABLED=true`; the default remains disabled. The Pages proxy blocks PayMongo webhooks so they go directly to Render, and payment handling has idempotency checks. This audit did not verify the deployed commit, merchant capability, or sandbox behavior. Do not enable live processing or process real payments based on this source review.

## F. Deployment runbook

`docs/DEPLOYMENT_RUNBOOK_2026-10-20.md` covers disposable TiDB setup, TLS and migration commands, Render build/start and environment configuration, Pages root/build/proxy and SPA routing, test-mode PayMongo procedure, backup/restore, rollback, and synthetic Super Admin, Branch Admin, Staff, Doctor, and Patient smoke checks. It includes the foundation schema contract and the proxy replay limitation.

## G. Final exports

Generated at the repository root:

- `AllCodes_DEPLOYMENT_FINAL_20261020.txt`
- `CARAIT_DEPLOYMENT_FINAL_20261020.zip`

The export test checks sensitive/generated exclusions, retention of legitimate assets, and byte-for-byte determinism over repeated exports. The ZIP is checked for readability and excluded credential, dependency, build, and nested-export entries.

## H. Git verification

The work is saved in the actual repository. At review completion, the exact `git status --short`, `git diff --stat`, `git diff --check`, and `git diff --name-status` summaries are reported in the final response. New files are untracked additions in the worktree; nothing was committed.

## I. Readiness decision

**READY FOR STAGING.** The code and local checks are ready for controlled staging validation using synthetic data and test payment credentials. This is not evidence that live TiDB, Cloudflare Pages, Render, role workflows, or PayMongo sandbox integrations have passed. Production remains blocked on those checks, backup/restore rehearsal, development-toolchain review, and resolution or formal acceptance of the proxy replay limitation.


