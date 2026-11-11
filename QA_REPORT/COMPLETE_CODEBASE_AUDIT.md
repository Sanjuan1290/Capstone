# Carait Clinic audit — acceptance incomplete

Date: 2026-11-09. Workspace: CAPSTONE; Windows, Node v22.15.0. No deployment, commit, push, production migration, or production application-data writes were performed. Source database access was limited to metadata and the migration ledger; the metadata copy contains no patient/application rows. All mutations used a separate loopback MySQL 8.0.41 instance (port 33409, database carait_qa_20261109) and synthetic accounts. External provider delivery was blocked by the audit network guard.

The original Cloudflare failure was a missing getNotificationDestination export in portal.service.js. The current production client builds successfully. This audit also repaired reproducible runtime, billing, migration, branch-authorization and concurrency defects. **The system is not certified ready for the thesis demonstration or deployment:** regression failures and required untested scenarios remain.

| Check | Status | Observed result / evidence |
| --- | --- | --- |
| Client production build | PASS | 25/25 prebuild tests; Vite output created; evidence/client-build.log |
| Client ESLint | PASS | 0 errors; remaining warnings in evidence/client-lint-results.json |
| Server focused ESLint | PASS | No undefined variables, duplicate keys, unreachable code or other enabled-rule errors |
| Render postinstall checks | PASS | Server syntax and actual Staff/charge route registration; evidence/server-postinstall.log |
| Server Node regression suite | FAIL | 657/684 pass; 27 fail; 0 skipped |
| Client Node regression suite | FAIL | 349/370 pass; 21 fail; 0 skipped |
| Server Vitest | FAIL | 259/263 pass; 4 fail |
| Existing + added Playwright tests | FAIL | 10/27 pass; 17 fail; API responses mocked |
| Real API targeted workflows | PASS | 41/41 named cases; real Express + isolated MySQL |
| Anonymous / expired authentication matrix | PASS | 736 anonymous checks + 736 expired-session checks |
| Real clinical workflow | PASS | 15/15 steps; booking through receipt and history; rollback + idempotency |
| Live browser navigation / rendering | PASS | 288/288 renders across 144 route paths and 2 widths; interactions assessed separately |
| SQL SELECT plans | FAIL | 676/681 EXPLAIN checks; 5 failures in disabled optional inventory-ledger paths |
| Reports SQL | PASS | 19 read-only statements against isolated MySQL |
| Migration replay / repeat | PASS | Native MySQL, existing schema, empty source migration ledger; rerun passed |
| Schema deployment verifier | PASS | Isolated schema; synthetic service-category warning retained |
| API production-mode startup | PASS | Real server.js process; 5 expected endpoint responses, then stopped |
| Dependency installation | PASS | Both lockfiles installed in disposable directories; lifecycle checks executed separately |
| Dependency advisories | FAIL | Client: 1 low; server: 2 moderate dev dependency advisories; 0 high/critical |
| Dormant client/WEBSITE build | FAIL | Missing restore script and source files; separate incomplete application |
| Static Admin service route coverage | FAIL | Retired supply-request service calls remain unmatched; see evidence/branch-routes.log |

## Inventory and review scope

783 files / 87,941 lines were inventoried, including client, server, tests, configuration, SQL and supporting scripts. 706 JavaScript/JSX files passed full-file parsing. Imports, named exports, Linux filename case, route declarations, SQL literals, environment-variable names and generic error strings were scanned. Generated dependencies/builds, delivery archives, QA output and .env contents are excluded. See [SOURCE_FILE_AUDIT.csv](SOURCE_FILE_AUDIT.csv) and [source-inventory.json](evidence/source-inventory.json).

Complete manual semantic review of every line is **NOT TESTED**. Targeted manual review covered the changed behavior and authentication, branch guards, transaction boundaries, migration replay, Maps links, directory search, notifications and billing. Neither automated parsing nor the per-file CSV claims all 87,941 lines were manually reviewed. Test associations are textual hints, not coverage proof.

The runtime API inventory contains 827 registered method/path entries including nested payment routers and catch-alls; 736 protected entries were exercised anonymously and with expired sessions. Detailed valid/invalid/ownership/business matrices were executed for the named native workflows only. The remaining endpoint scenarios are explicitly NOT TESTED in [API_ENDPOINT_AUDIT.csv](API_ENDPOINT_AUDIT.csv).

## Evidence and navigation

- [Bugs and fixes](BUGS_FOUND_AND_FIXED.md): exact source anchors, causes and regressions.
- [Remaining issues](REMAINING_ISSUES.md): residual failures and acceptance gaps.
- [Database](DATABASE_AUDIT.md), [security](SECURITY_AUDIT.md), [coverage](COVERAGE_REPORT.md).
- [Frontend](FRONTEND_TEST_RESULTS.md), [end-to-end](END_TO_END_TEST_RESULTS.md), [UI/UX](UI_UX_TEST_RESULTS.md).
- [Render](RENDER_BUILD_RESULTS.md), [Cloudflare](CLOUDFLARE_BUILD_RESULTS.md), [deployment checklist](FINAL_DEPLOYMENT_CHECKLIST.md).

PASS means the stated check executed and verified its assertions. FAIL means a reproducible failure remains. BLOCKED means a dependency/environment prevented testing. NOT TESTED means the action was not executed. A successful parse, rendered page, authentication rejection, SQL plan, or related test reference does not establish full feature correctness.
