# CARAIT pre-deployment audit

**Review date:** 2026-10-20  
**Repository baseline:** `4de26e0` (`main`, initially clean)  
**Verdict:** **READY FOR STAGING**. This is not a production certification.

## A. Executive audit

The current repository already contained the clinic portals, multi-branch controls, PayMongo TEST-mode integration, TiDB connection options, Pages proxy, and substantial automated coverage. This review ran the available local suites, corrected verified proxy and database-bootstrap defects, fixed the reported frontend lint errors, and updated the deployment guide.

No original migration SQL was changed. No schema migration, production deployment, PayMongo request, or real payment was performed. The optional source dump and patch archive listed in the request were not present in the workspace, so the repository was the source of truth. Local `.env` files were not inspected or printed.

## B. Confirmed defects fixed

- **Forwarded-IP spoofing:** Express could trust one proxy hop based on `TRUST_PROXY=true` while Render remains publicly reachable. The Pages Function now signs the edge-observed client IP, method, path, and query with `API_PROXY_SECRET`; Render verifies the HMAC and freshness, clears unsigned forwarding headers, and uses the Render peer address for direct unsigned requests. A minimum 32-character secret is required in production. `TRUST_PROXY=true` is rejected.
- **Pages proxy failures:** requests now have a 30-second response-header timeout, preserve streaming responses, strip client-supplied forwarding metadata, and refuse direct routing of the PayMongo webhook, including a trailing slash or encoded path. The five supported HTTP methods are covered by tests.
- **Schema bootstrap data preservation:** repeated `npm run migrate` bootstrap previously dropped `inventory_uoms.abbreviation` and reset configured decimal precision to `2`. The repeated drop was removed; the precision backfill now fills only legacy zero/missing values. The derived location-stock summary rebuild now commits its delete and insert together and rolls back on failure.
- **Frontend correctness/lint:** removed a duplicate Admin navigation map key; moved a component declaration out of render; moved a ref write out of render; corrected a state declaration order; and removed unused imports/state/helpers. UI workflows and layouts were retained.

## C. Changed-file report

**Proxy and runtime configuration**

- `client/functions/api/[[path]].js` — signed Pages-to-Render client-IP forwarding, header stripping, webhook-path blocking, timeout handling.
- `server/middlewares/trustedProxy.middleware.js` — new HMAC verification middleware and safe IP fallback.
- `server/server.js` — disables blanket Express proxy trust and mounts the verifier before request handlers.
- `server/utils/envValidation.js` — requires the production proxy secret and rejects legacy blanket proxy trust.
- `server/.env.example` — documents server-only `API_PROXY_SECRET`.
- `server/tests/security/envValidation.test.js` — production proxy-secret and legacy-setting coverage.
- `server/tests/security/trustedProxy.node.cjs` — new signature freshness, spoofing, and shared-network tests.
- `client/tests/cloudflareProxy.node.test.mjs` — signature/header, methods/body, webhook, stream, and timeout tests.

**Database bootstrap and migration coverage**

- `server/utils/schema.js` — preserves UOM settings, removes recurring column deletion, and makes the stock-summary rebuild transactional.
- `server/tests/security/schemaBootstrapPreservation.node.cjs` — new backfill and rollback tests.
- `server/tests/deployment/hostingAndTidb.node.cjs` — exercises every currently registered procedural TiDB migration against mocked schema metadata.

**Frontend fixes**

- `client/src/components/layouts/AdminLayout.jsx` — removes duplicate permission-map key.
- `client/src/components/supply/SupplyRequestReviewPanel.jsx` — removes unused formatter.
- `client/src/pages/adminPage/Admin_BillingPaymentMethods.jsx` — removes unused destructured value.
- `client/src/pages/adminPage/Admin_CheckoutDetail.jsx` — removes unused catalog/reference state and request.
- `client/src/pages/adminPage/Admin_PatientRecord.jsx` — removes unused import.
- `client/src/pages/doctorPage/Doctor_Consultation.jsx` — removes unused import and updates autosave refs after render with valid callback dependencies.
- `client/src/pages/patientPage/DoctorAvailability.jsx` — declares error state before its effect uses it.
- `client/src/pages/shared/Appointments.jsx` — removes an unused modal prop.
- `client/src/pages/shared/Inventory.jsx` — removes unused helpers.
- `client/src/pages/staffPage/Staff_AccountsView.jsx` — moves the account section component to module scope to avoid recreating it on each render.
- `client/src/pages/staffPage/Staff_CheckoutDetail.jsx` — removes unused catalog/reference state and request.
- `client/src/pages/staffPage/Staff_PatientRecord.jsx` — removes unused import.
- `client/src/pages/staffPage/Staff_WalkInQueue.jsx` — removes unused hook import.
- `client/src/pages/superAdminPage/BranchPortals.jsx` — removes unused hook import.
- `client/src/pages/superAdminPage/redesign/reportFormat.js` — fixes an unnecessary regex escape without changing CSV protection.
- `client/src/pages/superAdminPage/redesign/shared.jsx` — updates the modal close ref in an effect.

**Documentation**

- `docs/DEPLOYMENT_RUNBOOK_2026-10-20.md` — records proxy secrets, deployment steps, current test results, external checks still required, and rollback/recovery steps.
- `docs/PREDEPLOYMENT_AUDIT_2026-10-20.md` — new audit report with the findings and verification evidence in this review.

No files were removed. `server/db/migrations/` has no changes.

## D. Test results

| Check | Result |
|---|---:|
| `cd server && npm run verify:source` | Passed: 389 source files, 982 relative imports |
| `cd server && npm run test:node` | Passed: 180 tests |
| `cd server && npm test` | Passed: 77 files, 258 tests |
| `cd client && npm run test:design` | Passed: 8 tests |
| `cd client && npm run test:hosting` | Passed: 5 tests |
| `cd client && npm run lint` | Passed: 0 errors, 17 warnings |
| `cd client && npm run build` | Passed; main JS chunk is 2.08 MB (507 KB gzip), above Vite's advisory threshold |
| `cd server && npm run verify:reports-sql` | Passed: 20 read-only `EXPLAIN` checks against the DB configured in local `server/.env` |
| `git diff --check` | Passed |

The Reports SQL check did not write data, but the configured database was not verified as a disposable TiDB database. `npm ci` was not needed because both `node_modules` directories were present. `npm run verify:deploy`, migrations, a database-mutating test, backend startup against staging, browser E2E, and PayMongo sandbox/network calls were not run.

## E. Database compatibility

`DB_PROVIDER=tidb`, configurable port, verified TLS, optional CA path, and the three procedural adapters registered by `server/scripts/branchMigrations.js` have static/unit coverage. The original SQL files and their stored checksums remain unchanged. The new tests exercise those registered adapters with mocked information-schema results; they do not prove TiDB execution behavior.

No disposable TiDB credentials/database were identified for this review. Therefore no TiDB schema import, migration, transaction, foreign-key, lock, or operational workflow was exercised against TiDB. The local Reports preflight used the configured `mysql2` connection and does not establish TiDB compatibility. Historical SQL files outside the current five-entry branch migration list remain archived; replaying that entire historical directory as a fresh TiDB installation is not validated. A static scan found stored-procedure DDL in `server/db/migrations/2026-09-22-current-codebase-reconciliation.sql`, `server/db/migrations/2026-09-22-inventory-schedule-schema-alignment.sql`, `server/db/migrations/2026-09-23-inventory-batch-controls.sql`, `server/db/migrations/2026-09-23-inventory-location-types-on-items.sql`, and `server/db/migrations/2026-10-04-billing-inventory-flow-fixes.sql`. They are not in the current `branchMigrations.js` list and were not changed.

Next database gate: create an empty disposable TiDB staging database, verify a restorable backup/import path, run `npm run migrate`, `npm run verify:deploy`, `npm run verify:reports-sql`, `npm run test:node`, and `npm test`, then exercise synthetic branch, billing, appointment, consultation, and inventory operations. Do not point these procedures at production.

## F. Security assessment

| Severity | Finding | Status / impact |
|---|---|---|
| High | No confirmed unresolved high-severity code finding from the checks performed. | Limited to static review and local/mocked suites; not a penetration test. |
| Medium | Unsigned forwarded-IP headers could affect rate-limit and audit IP attribution when blanket proxy trust was enabled. | Fixed in code. Before staging, set the same private `API_PROXY_SECRET` (32+ characters) in Render and Pages; remove `TRUST_PROXY=true`. |
| Medium | Repeated schema bootstrap could remove a UOM column, overwrite selected precision, or leave the derived stock summary empty if insertion failed after deletion. | Fixed in code with non-destructive backfill and transactional rebuild; mocked regression tests pass. |
| Medium | TiDB and hosting behavior is not validated against an isolated live staging stack. | Open release gate; run the disposable TiDB and staging workflow above before production. |
| Low | ESLint still reports 17 React hook/dependency warnings in existing files. | Build succeeds; inspect and resolve before a broad UI refactor. Files: `client/src/components/NotificationBell.jsx`, `client/src/components/layouts/AdminLayout.jsx`, `client/src/components/ui/ToastProvider.jsx`, `client/src/hooks/useClientPagination.js`, `client/src/pages/adminPage/Admin_BillingServiceForm.jsx`, `client/src/pages/adminPage/Admin_Checkout.jsx`, `client/src/pages/adminPage/Admin_Reports.jsx`, `client/src/pages/adminPage/Admin_SystemSetup.jsx`, `client/src/pages/doctorPage/Doctor_Consultation.jsx`, `client/src/pages/patientPage/BookAppointment.jsx`, `client/src/pages/patientPage/DoctorAvailability.jsx`, `client/src/pages/patientPage/ResheduleAppointment.jsx`, `client/src/pages/superAdminPage/redesign/shared.jsx`. |
| Low | Production bundle exceeds Vite's 500 KB chunk advisory. | No build failure; consider route-level dynamic imports after staging workflow tests. Primary review point: `client/src/App.jsx`. |

No secrets were found in tracked frontend source by the pattern scan. PayMongo remains TEST-only: live mode and live key prefixes are rejected by runtime validation; no real payment capability was enabled or called.

## G. Deployment instructions

Use the step-by-step [deployment runbook](DEPLOYMENT_RUNBOOK_2026-10-20.md). The required staging order is:

1. Create a new, empty TiDB staging database with TLS verification. Keep it separate from production.
2. Configure Render with `DB_PROVIDER=tidb`, port `4000`, `DB_SSL=true`, database credentials, exact HTTPS `CLIENT_URL`, a strong `JWT_SECRET`, and `RUN_SCHEMA_MIGRATIONS_ON_STARTUP=false`. Set `API_PROXY_SECRET` and configure email/MFA requirements.
3. Create Cloudflare Pages from the `client` root with `npm ci && npm run build` and output `dist`. Set `API_ORIGIN` and the matching encrypted `API_PROXY_SECRET` in Pages Function settings. `_routes.json` is included in the built output.
4. Attach the domain through Pages **Custom domains**, follow Cloudflare DNS instructions, confirm HTTPS, and set Render `CLIENT_URL` to that browser origin.
5. After staging deploy, use PayMongo TEST keys only and point the test webhook directly to `https://<render-host>/api/webhooks/paymongo`. Verify signatures, duplicates, expiry, amount, branch, receipt, and inventory behavior before considering any production release.
6. For rollback, redeploy the previous Render and Pages commit. Rehearse TiDB snapshot restoration into a new database; do not reverse DDL by guesswork or overwrite the existing clinic database.

Current platform details are linked from the runbook to the [TiDB TLS guide](https://docs.pingcap.com/tidbcloud/tidb-cloud-tls-connect-to-dedicated/), [Render web-service docs](https://render.com/docs/web-services), [Cloudflare Pages secrets](https://developers.cloudflare.com/pages/functions/bindings/), [Pages routing](https://developers.cloudflare.com/pages/functions/routing/), and [custom-domain setup](https://developers.cloudflare.com/pages/configuration/custom-domains/).

## H. Final readiness verdict

**READY FOR STAGING.** There is no known critical code blocker to beginning a protected staging deployment with synthetic data and TEST-mode payments. This verdict does not mean staging is already deployed or verified. Production remains unverified until isolated TiDB migration and operational tests, all five role workflows, browser/API failure cases, backup restoration, and PayMongo sandbox reconciliation pass. PayMongo real payments remain disabled regardless of verdict.

## Unresolved work and next actions

| Open item | Impact | Affected files | Next action |
|---|---|---|---|
| TiDB integration and application readiness | Unsupported SQL/DDL or transaction behavior could fail on the target engine. | `server/db/connectionOptions.js`, `server/db/connect.js`, `server/scripts/branchMigrations.js`, `server/scripts/tidbMigrationAdapter.js`, `server/utils/schema.js`, `server/scripts/verifyDeployment.js`; historical procedures also occur in the five migration files listed above. | Run the documented migration and readiness sequence only against a disposable TiDB database. Decide whether the historical files need a supported conversion path; keep their recorded checksums unchanged. |
| Five-role end-to-end QA | Login, navigation, mobile, session, and cross-branch behavior has not been exercised in a browser against staging. | `client/package.json`, `client/src/App.jsx`, `server/server.js`; no dedicated browser E2E suite is currently configured. | Prepare synthetic branch/users and a browser test environment, then test Super Admin, Branch Admin, Staff, Doctor, and Patient independently. |
| PayMongo sandbox reconciliation | No provider call or delivered webhook was made; mocked behavior does not establish provider compatibility. | `server/utils/paymongoClient.js`, `server/routers/paymongoGateway.js`, `server/tests/gateway/paymongoQr.node.cjs`, `server/tests/gateway/paymongoWebhook.node.cjs`, `server/tests/gateway/paymongoReconciliationStartup20261017.node.cjs`, `server/tests/gateway/paymongoRefundProof20261017.node.cjs` | Configure TEST-only credentials and direct test webhook in staging; exercise duplicate, delayed, failed, expired, and paid events. |
| Remaining lint warnings | Potential stale-effect behavior is not ruled out by a passing build. | The 13 frontend files listed in Security assessment. | Review warnings individually and add targeted regression coverage before broad UI changes. |
| Bundle-size advisory | Larger initial transfer may slow first load on mobile connections. | `client/src/App.jsx` and route modules | Measure in staging and consider lazy-loading route groups. |
