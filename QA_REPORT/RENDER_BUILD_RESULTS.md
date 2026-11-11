# Render production readiness checks

Local result: **PASS for dependency install, postinstall, schema checks and startup; FAIL for complete regression acceptance. Remote deployment NOT TESTED.**

| Render-related check | Status | Evidence / scope |
| --- | --- | --- |
| npm ci dependency install | PASS | Disposable server directory, lockfile reproduced with lifecycle hooks disabled there; hooks run separately in actual workspace |
| npm run postinstall | PASS | Syntax modules and actual Staff/charge route binding validation; see evidence/server-postinstall.log |
| Recurring walk-ins/acceptance callback | PASS | Staff factory-registration regression runs inside postinstall; no undefined controller dependency |
| Source graph / imports | PASS | Source graph verification passed: 606 source files, 1406 relative imports resolved. |
| Isolated npm run migrate | PASS | Native MySQL; metadata-guarded replay and repeat; production source not migrated |
| npm run verify:deploy / verify:reports-sql | PASS | Synthetic database schema check and19 report statements |
| NODE_ENV=production node server.js | PASS | Separate local process, isolated SQL runtime user and dummy provider configuration; health200/ready200/news200/webhookGET405/unknown404; stopped after checks |
| Full automated regression acceptance | FAIL | Node/Vitest/browser failures retained; see main audit |
| Real Render Linux deployment / production credentials | NOT TESTED | No deploy or production migration performed |

Environment-variable names are inventoried in evidence/source-inventory.json; values are excluded. Required runtime validation was exercised: missing provider/secret config initially fails startup; synthetic required configuration allows local production-mode startup. Dummy values establish configuration shape only, not provider delivery. This Windows runtime differs from hosted Linux/Node versions; case-sensitive import checks reduce but do not eliminate that gap.

Start/build commands for a server-root Render service: npm ci (runs postinstall), separately controlled npm run migrate, npm start. Confirm actual service settings and required secrets from server/utils/envValidation.js before any authorized remote deployment. No dashboard settings were changed.
