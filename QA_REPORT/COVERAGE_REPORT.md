# Automated coverage

Instrumented runner: server npm run test:coverage (Vitest/V8), with reportOnFailure and explicit include patterns for controllers, routers, utils, middlewares, db and server.js. 139 server runtime files appear in the report. Tests still fail; coverage is partial execution evidence.

| Metric | Covered | Total | Percent |
| --- | --- | --- | --- |
| lines | 3050 | 13221 | 23.06% |
| branches | 1640 | 14838 | 11.05% |
| functions | 340 | 2078 | 16.36% |
| statements | 3293 | 16227 | 20.29% |

Raw artifacts: evidence/coverage/coverage-summary.json and coverage-final.json (generated/ignored locally). The per-file CSV embeds observed line execution where available. This is **not** all-repository coverage and excludes native Node/API/browser executions from its numerator. No combined or 100% claim is made. Client instrumented coverage was NOT TESTED; Node source-assertion tests do not provide it.

## Low-coverage critical files

| File | Line % | Branch % | Function % |
| --- | --- | --- | --- |
| server/controllers/billingHistory.controller.js | 0 | 0 | 0 |
| server/controllers/doctor.controller.js | 6.47 | 2.55 | 5.2 |
| server/controllers/admin.controller.js | 6.6 | 3.96 | 8.01 |
| server/utils/chargeAdjustments.js | 7.47 | 0.45 | 0 |
| server/controllers/staff.controller.js | 7.58 | 3.49 | 3.6 |
| server/controllers/billingCorrections.controller.js | 8.03 | 3.41 | 0 |
| server/controllers/patient.controller.js | 9.97 | 2.05 | 4.91 |
| server/controllers/auth.controller.js | 12.78 | 0 | 0 |
| server/controllers/promotions.controller.js | 13.59 | 0 | 10.52 |
| server/utils/inventoryBatches.js | 13.86 | 9.46 | 17.14 |
| server/controllers/common.controller.js | 14.36 | 4.82 | 4.87 |
| server/utils/sessionSecurity.js | 43.33 | 36 | 25 |
| server/utils/billing.js | 45.27 | 43.82 | 54 |
| server/controllers/staffAccess.controller.js | 60 | 100 | 0 |

New checks added: error reference propagation, saved Maps directions/NULL fallback, resumable migration DDL, asynchronous Settings/legacy redirect rendering, concurrent walk-in lock ownership, and native cross-role clinical/billing/stock/branch/idempotency cases. These increase evidence for critical paths without claiming complete controller coverage.

Remaining unit/integration/browser failure counts and exact names are preserved in REMAINING_ISSUES.md. No failure was hidden by disabling a test.
