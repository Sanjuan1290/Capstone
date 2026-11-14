# Final test results

14 November 2026. Starting commit: `6f937c6`. No production database/provider writes. Browser APIs and upload/payment providers are mocked. SQL verification is a guarded metadata/DDL simulation, not execution on a live MySQL/TiDB server.

## Passing checks

| Check | Actual result | Evidence |
|---|---|---|
| Frontend production build | Pass; 1,260 modules | `build.log` |
| Mandatory frontend prebuild tests | 25 passed, 0 failed | `build.log` |
| ESLint | 0 errors, 23 existing warnings | `lint.log` |
| Backend syntax/startup smoke checks | 441 modules; Staff registration and charge-reduction smoke checks pass | `backend-syntax.log` |
| Critical route bindings | 256 exported handler references pass | `route-bindings.log` |
| Source/import graph | 726 files, 1,747 imports resolved | `source-graph.log` |
| Existing pricing contract | 5 passed | Command output from `npm.cmd run check:pricing-contract` |
| Focused backend feature/integration tests | 83 passed, 0 failed | `focused-backend.log` |
| Migration verification (included above) | 23 passed, 0 failed | `migration-verification.log` |
| Tax settings and charge-reversal regression checks | 26 passed, 0 failed | `tax-reversal.log` |
| Focused frontend payment/receipt/upload tests | 9 passed, 0 failed | `focused-frontend.log` |
| Cloudinary validation/authorization tests | 12 passed, 0 failed | `upload-security.json` |
| New-flow/shared-operation browser suite | 77 passed; 0 failed, skipped or flaky | `browser-results.json`, `browser.log` |
| Additional inventory barcode regression | 1 passed, 0 failed | `barcode-browser.log` |
| Conflict-marker scan / `git diff --check` | No source conflict markers; no whitespace errors | Final tool output |

The focused/migration/prebuild tests overlap with the complete suites below; these counts must not be added together as unique tests. The build has the existing large-bundle warning; it still completes successfully.

The barcode browser case decodes the rendered short product barcode with ZXing at a 390 px viewport. It also checks the current text-only batch code. Its old expectation of a separate batch barcode was updated to match the existing workflow. No inventory barcode implementation was removed or changed. A physical camera/scanner was not used.

The saved synthetic partial-payment receipt is A5 and one page: `partial-payment-receipt.pdf`. It shows the actual PHP 100 cash transaction, PHP 150 received, PHP 50 change, prior/current payment accounting and PHP 386 still due on a PHP 486 bill. The second electronic payment is checked separately without a cash-change row.

## Complete existing regression suites

| Suite | Starting commit passed / failed | Corrected repository passed / failed |
|---|---:|---:|
| Frontend Node tests | 412 / 35 | 428 / 32 |
| Backend Node tests | 850 / 74 | 908 / 72 |
| Backend Vitest | 256 / 7 | 252 / 7 |

**111 full-suite failures remain: 32 frontend, 72 backend Node, 7 Vitest.** All remaining failure names were reproduced in the starting-commit run under the same guard. No newly introduced failure names remain. Retired/replaced scanner assertions account for some test-count changes; a removed/renamed test is not presented as a fixed product defect.

`REGRESSION_FAILURES.md` lists every remaining test name, file and excerpt. `regression-comparison.json` contains the complete comparison. These failures include authentication/registration, legacy workflow/schema fixture and source-contract assertions; they have not all been diagnosed as harmless. The complete suite is **not green**, and this report does not certify the existing system as defect-free.

## Browser coverage

- Optional draft/finalized follow-up editing; date/note-only form; recommendation removal; completed doctor history.
- Patient dashboard/history filtering, branch switching through a recommendation link and a full patient-initiated booking. A slot/reason/consent are required; entering the recommendation link alone creates no appointment or bill.
- All three operational roles: service fee preview, saved line/item/discount/tax/doctor-fee history, two payments, transaction-specific cash/electronic receipts, partial payment request/confirmation and disabled QR behavior.
- Restricted tax editing and internal allocation reporting/PDF; Staff cannot access those financial-management operations.
- Clinical upload success, provider failure, authorization-token attachment and absence of scanner polling/bypass UI.
- Existing walk-in service selection, queue calls/no-answer actions, queue-day reset, schedule toggle persistence, stock alerts, whole-number inventory activity/audit before/after quantities, shared Add Item and permission pickers, reports and PDF controls.
- Legacy receipts and previously disabled payment-method behavior remain covered.

The final shared-operation suite has 77 passing browser cases. The additional ZXing barcode case ran separately and passed. Physical devices, live provider settlement/refunds, real SMS/email and a production database were not exercised.

## Reproduction

From the repository root:

```powershell
node QA_REPORT/nine-batches-2026-11-14/run-safe-tests.cjs frontend
node QA_REPORT/nine-batches-2026-11-14/run-safe-tests.cjs backend-node
node QA_REPORT/nine-batches-2026-11-14/run-safe-tests.cjs backend-vitest
```

The full commands deliberately return nonzero while the documented existing failures remain. They override database/provider variables and block unmocked external connections. Do not substitute the user's production environment into database integration tests.

From `client`: `npm.cmd run build` and `npm.cmd run lint`.

From `server`: `npm.cmd run check:syntax`, `npm.cmd run check:routes`, `npm.cmd run verify:source`, `npm.cmd run check:pricing-contract`.

The browser runner starts a hidden local Vite preview of the built client and terminates it afterwards. To reproduce the 77-case suite:

```powershell
node QA_REPORT/nine-batches-2026-11-14/run-browser.cjs
```

The focused barcode check can be run with:

```powershell
$env:CARAIT_UI_TEST_CONFIG = 'barcode.playwright.config.mjs'
node QA_REPORT/nine-batches-2026-11-14/run-browser.cjs --grep 'short product'
Remove-Item Env:CARAIT_UI_TEST_CONFIG
```

See `RESULTS.md` for per-batch files, migration instructions and release gates. The live migration/`verify:deploy` commands were intentionally not run against the configured database.
