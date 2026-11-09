# Final deployment / demonstration checklist

**Acceptance: FAIL / NOT TESTED — do not describe the repository as fully ready. No automatic deployment was performed.**

| Requirement | Status | Evidence / remaining action |
| --- | --- | --- |
| Repository/source inventory | PASS | 783 files inventoried; SOURCE_FILE_AUDIT.csv |
| Every relevant line manually reviewed | NOT TESTED | Automated full-file scan plus targeted manual review does not meet exhaustive manual review |
| All critical API scenario matrices | NOT TESTED | Named critical native workflows pass; remaining endpoint/action/input/ownership matrices incomplete |
| All five roles exercised | PASS for narrower recorded scope | Real sessions/pages and named workflows; not all features per role |
| Native booking -> clinical -> stock -> receipt/history chain | PASS | 15/15 clinical workflow cases |
| Reproduced high-priority branch/concurrency/billing defects | PASS for listed fixes | Exact sources and regression evidence in BUGS_FOUND_AND_FIXED.md |
| All tests / interactions green | FAIL | 27 server Node + 21 client Node + 4 Vitest + 17 browser failures |
| Database integrity | PASS for targeted transactions; incomplete overall | Migration replay, clinical rollback, one stock deduction, one receipt/payment pass; dynamic SQL and all reports not fully verified |
| Security findings documented | PASS | SECURITY_AUDIT.md; no penetration-test or complete security certification |
| Render local production prerequisites | PASS | Install/hooks/schema/startup pass; hosted Linux deployment NOT TESTED |
| Cloudflare local production build | PASS | Client prebuild + Vite pass; hosted Functions/routing NOT TESTED |
| External verification/payment/upload delivery | BLOCKED | Use authorized sandbox provider credentials and test inbox/phone; no production recipients or live payments |
| No unresolved critical risk | NOT TESTED | Remaining interaction failures, coverage gaps and optional-ledger activation must be resolved/reviewed |
| Real demonstration rehearsal | NOT TESTED | Rehearse with synthetic accounts on approved staging: book/check in/call/consult/finalize/pay/receipt, directory ban/unban, branch/Maps form, retry/error cases |
| Production migration/deploy approval | NOT TESTED | Prepare a reviewed patch and backup/migration plan; no deploy or source-DB write is authorized by this audit |

Before an authorized release: reconcile failed tests with accepted contracts without removing safety assertions; verify Google Maps saved destination in a real browser; check API_ORIGIN/API_PROXY_SECRET and Render allowlisted client origin; verify provider TEST mode, required secrets and PIN; keep the optional inventory ledger disabled until its separate cutover is complete. Run the remaining endpoint/UI cases and a full staging rehearsal before certifying readiness.

## Reproducing local checks

Use node QA_REPORT/scripts/run.cjs with named checks from that script. Synthetic unit/build checks strip .env values and block outbound access. The native DB checks require the disposable MySQL instance and synthetic schema; do not substitute production connection settings. scripts/disposable-db.cjs creates the loopback instance; scripts/bootstrap-isolated.cjs restores saved metadata into an empty local schema. Run isolated-migrate then api-smoke before clinical-workflow/browser-pages. Source schema acquisition is optional and read-only; ordinary replay uses saved metadata and does not contact the source database.

Raw check commands, exit codes, durations and logs are in evidence/. Report generation: node QA_REPORT/scripts/write-reports.cjs. Generated screenshots and V8 coverage files are ignored locally. Source evidence JSON and logs contain no copied application records or source credential values.
