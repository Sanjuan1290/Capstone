# Security audit

Date: 2026-11-09. Workspace: CAPSTONE; Windows, Node v22.15.0. No deployment, commit, push, production migration, or production application-data writes were performed. Source database access was limited to metadata and the migration ledger; the metadata copy contains no patient/application rows. All mutations used a separate loopback MySQL 8.0.41 instance (port 33409, database carait_qa_20261109) and synthetic accounts. External provider delivery was blocked by the audit network guard.

This is an application audit with targeted adversarial checks, not an exhaustive penetration-test certification.

| Area | Result | Evidence / limitation |
| --- | --- | --- |
| JWT/session validation | PASS for exercised cases | 736 anonymous + 736 expired checks; database-backed active-account/session_version check. Tokens are role scoped and Admin portals use separate cookies. |
| Password login and cookie protection | PASS / limited | Actual bcrypt password checks exercised for all 5 roles; patient/doctor HttpOnly assertions. Admin MFA disabled only in the local child fixture; real MFA delivery BLOCKED. Production Secure/SameSite=Lax configuration inspected. |
| Revocation / banning / logout | PASS | Existing patient token blocked after ban; old token remains revoked after unban; new session allowed; logout replay returns401. |
| Role and branch authorization | PASS for named attacks | Other roles denied Super Admin directory; Admin/Staff workspace branch2 denied; multi-branch Doctor start vulnerability fixed and regression verified; patient IDOR on paid bill returns404. Other resource/action ownership combinations NOT TESTED. |
| CSRF / CORS | PASS for targeted controls | Exact origin allowlist + cookie-aware production origin guard inspected; unwanted origin returns403 instead of500. OriginGuard is bypassed by NODE_ENV=test in native workflow harness. Production origin behavior has existing middleware tests; exhaustive hosted cross-origin browser matrix NOT TESTED. |
| SQL injection | Partial review | Critical changed queries use bound parameters. Dynamic identifiers inspected in role/table allowlists. Full repository dynamic SQL taint analysis and fuzzing NOT TESTED; a successful EXPLAIN is not an injection audit. |
| Billing authorization and transactions | PASS | Staff cannot decide requests; paid/confirmed bills reject reductions; unfinished clinical state cannot be approved; direct Admin reason/audit/version/row lock verified; no stock edits by reductions. |
| Concurrency | PASS for new regression | Walk-in patient lock formerly process global; now local to each invocation. Concurrent fake executor regression proves release keys; native queue duplication and payment idempotency cases pass. Load/stress testing NOT TESTED. |
| Error disclosure | PASS for injected DB failure | Safe API500 includes request_id, omits raw synthetic driver diagnostic/stack; readiness503. Server logs retain diagnostic details. Other external failure paths NOT TESTED. |
| File uploads / XSS | Partial / BLOCKED | Existing Cloudinary signature and upload integrity suites executed; real provider scan/upload delivery BLOCKED. No dangerouslySetInnerHTML found in active source scan; structured announcement rendering inspected. This does not prove all XSS sinks safe. Quill low dependency advisory remains. |
| Password reset / verification / rate limit | Partial / BLOCKED | Existing unit/integration tests executed; real email/SMS OTP and reset completion delivery BLOCKED. Limits are process local, so multi-instance enforcement is unverified. |
| API proxy | PASS in existing local tests | HMAC client-IP metadata, path validation, no webhook relay, bounded timeout, cookie/header forwarding checked in hosting suite. Remote Cloudflare secrets and Render match NOT TESTED. |

Fixed high-priority findings: Doctor selected-branch bypass, global walk-in lock key, premature bill confirmation, unsafe reduction inputs/caps. Baseline failure evidence and final named cases are retained. Dependency advisory totals are client1 low and server2 moderate dev-only, with no high/critical from the recorded npm audit. Do not infer that the absence of a high-severity advisory proves the system secure.
