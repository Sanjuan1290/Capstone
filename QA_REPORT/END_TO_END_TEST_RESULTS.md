# Native API and end-to-end results

Date: 2026-11-09. Workspace: CAPSTONE; Windows, Node v22.15.0. No deployment, commit, push, production migration, or production application-data writes were performed. Source database access was limited to metadata and the migration ledger; the metadata copy contains no patient/application rows. All mutations used a separate loopback MySQL 8.0.41 instance (port 33409, database carait_qa_20261109) and synthetic accounts. External provider delivery was blocked by the audit network guard.

## Actual clinical/billing chain

These steps executed against actual Express HTTP endpoints and native MySQL, not repository SQL mocks. The fixture created synthetic accounts, doctor schedules, branch service and batch stock. The existing QA allowlist enabled same-day booking only for synthetic branch1 in this process; production booking settings were not modified. Admin password sessions used a local-only MFA override. Provider delivery is not established.

| Workflow assertion | Status | Failure if any |
| --- | --- | --- |
| admin password login with local-only MFA override | PASS |  |
| superadmin password login with local-only MFA override | PASS |  |
| staff password login with local-only MFA override | PASS |  |
| patient actual password login returns HttpOnly session cookie | PASS |  |
| doctor actual password login returns HttpOnly session cookie | PASS |  |
| Patient books a same-day synthetic appointment through actual slot validation | PASS |  |
| Staff confirms the booked appointment | PASS |  |
| Staff checks in the actual appointment; duplicate check-in cannot create a second queue row | PASS |  |
| Staff calls the patient and Doctor starts consultation | PASS |  |
| Doctor saves a versioned draft without inventory deduction | PASS |  |
| Insufficient stock rolls back finalization and clinical state | PASS |  |
| Doctor finalizes once, deducting exactly one unit and retaining prescription | PASS |  |
| Staff confirms the completed bill and collects cash exactly once | PASS |  |
| Patient history contains the same paid bill; another patient cannot read it | PASS |  |
| Patient logout invalidates the current session | PASS |  |

The chain crosses Patient -> Staff -> Doctor -> billing/payment -> Patient history. Negative assertions prove no duplicate queue entry/payment, no draft stock use, rollback on insufficient stock, one final stock deduction and patient billing ownership.

## Targeted native API cases

| Case | Status | Failure if any |
| --- | --- | --- |
| Health and database readiness use real Express and MySQL | PASS |  |
| Unknown API and webhook GET return JSON with the correct status | PASS |  |
| Untrusted browser origin is rejected as forbidden | PASS |  |
| patient authenticated session check | PASS |  |
| doctor authenticated session check | PASS |  |
| staff authenticated session check | PASS |  |
| admin authenticated session check | PASS |  |
| superadmin authenticated session check | PASS |  |
| Public branch response retains exact saved Maps pin and legacy NULL | PASS |  |
| Patient directory search by name | PASS |  |
| Patient directory search by email | PASS |  |
| Patient directory search by local mobile | PASS |  |
| Patient directory search by international mobile | PASS |  |
| Patient details retain gender/address and paginated history | PASS |  |
| Patient directory rejects invalid IDs and nonexistent accounts | PASS |  |
| patient cannot access the Super Admin patient directory | PASS |  |
| staff cannot access the Super Admin patient directory | PASS |  |
| doctor cannot access the Super Admin patient directory | PASS |  |
| admin cannot access the Super Admin patient directory | PASS |  |
| Ban input requires a boolean | PASS |  |
| Patient ban revokes an existing session and returns restriction message | PASS |  |
| Unban preserves revocation of the old token; a new session can sign in | PASS |  |
| Branch create rejects unrelated and non-HTTPS Maps links without inserting rows | PASS |  |
| Branch create/update preserve saved Google Maps destination | PASS |  |
| admin cannot change another branch by supplying a branch ID | PASS |  |
| staff cannot change another branch by supplying a branch ID | PASS |  |
| A multi-branch doctor cannot start another branch consultation from the selected branch | PASS |  |
| Create a synthetic completed consultation and its itemized draft bill | PASS |  |
| Billing-only Staff can read reductions without gaining permission to submit them | PASS |  |
| Doctor can request and cancel their own reduction but cannot cancel a Staff request | PASS |  |
| Doctor draft requests stay pending until clinical completion; Admin cannot apply money early | PASS |  |
| admin confirmation refuses a pending charge reduction without changing the bill | PASS |  |
| staff confirmation refuses a pending charge reduction without changing the bill | PASS |  |
| Admin approval changes money and audit history without inventory writes | PASS |  |
| admin applies a direct reduction with one audit event and no inventory changes | PASS |  |
| superadmin applies a direct reduction with one audit event and no inventory changes | PASS |  |
| Admin confirms a completed consultation after all reductions are resolved | PASS |  |
| Cash payment creates one receipt; retry cannot collect twice | PASS |  |
| Paid bills reject new charge reductions | PASS |  |
| Notification destination uses the authenticated Admin route and branch | PASS |  |
| Injected database outage returns readiness 503 and a safe request reference | PASS |  |

736 anonymous and 736 expired session checks also pass. Runtime-discovered inventory: 827 entries. [Per-endpoint evidence](API_ENDPOINT_AUDIT.csv), [actual request log](evidence/api-smoke-results.json), [clinical chain](evidence/clinical-workflow-results.json).

## Required workflow coverage gaps

| Role / integration | Status | Unverified actions |
| --- | --- | --- |
| Patient registration / verification | BLOCKED | Actual email/SMS code delivery and completion; password reset. Login/dashboard/pages/booking/billing/logout have narrower recorded evidence. |
| Staff | NOT TESTED for complete UI flow | Real HTTP confirmation/check-in/call/payment/receipt passes. Every UI action, patient registration consent variants, cashier closing and browser response-loss scenarios remain incomplete/failing. |
| Doctor | PASS for native clinical chain; UI partial | Diagnosis, prescription, draft, finalization and actual deduction pass. Image scans/amendments/all prescription print layouts not comprehensively tested. |
| Admin | PASS for named billing cases; otherwise partial | Direct reductions and decisions, branch restrictions and notifications verified. Full account/schedule/inventory/report/audit CRUD matrices NOT TESTED. |
| Super Admin | PASS for named directory/branch/billing cases; otherwise partial | Directory, ban/unban, Maps create/edit and direct reduction verified. Every setup/account/report/log control NOT TESTED. |
| PayMongo / Cloudinary / email / SMS | BLOCKED | External delivery intentionally disabled. Local mocked gateway/security tests do not establish real provider behavior. |
| All visible page controls / printer / multi-instance races | NOT TESTED | No complete manual click-through, real paper print, load/stress or cross-browser certification. |
