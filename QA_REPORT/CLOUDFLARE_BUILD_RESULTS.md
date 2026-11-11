# Cloudflare Pages build results

Local Carait client production build: **PASS**. Remote retry/deployment: **NOT TESTED**.

The supplied failing log reports MISSING_EXPORT: getNotificationDestination was not exported from src/services/portal.service.js. That export and its authenticated destination path are present in current source. Notification destination regression, client prebuild checks and production bundling pass. This is separate from the incomplete client/WEBSITE app.

| Check | Status | Evidence / scope |
| --- | --- | --- |
| Lockfile installation | PASS | Disposable client npm ci --ignore-scripts; hooks checked separately |
| Actual npm run build | PASS | 25 prebuild assertions + Vite; evidence/client-build.log |
| Active named imports / filename case | PASS | Build plus inventory case scan; dormant unresolved modules listed separately |
| API proxy | PASS in local automated suite | client/tests/cloudflareProxy.node.test.mjs and server hosting tests executed; HMAC metadata/path restrictions/timeout/cookies checked |
| Built route navigation | PASS for render checks | 288/288 local actual-API renders; SPA fallback served by audit harness, not the remote Pages edge |
| Hosted Functions secrets / edge execution / actual routing | NOT TESTED | No Cloudflare dashboard/API credentials inspected or deployment retried |
| All interactions and runtime acceptance | FAIL / NOT TESTED | Existing Playwright/Node failures and gaps remain |
| Separate client/WEBSITE build | FAIL | Missing restore script and imports; use Carait client root for this project |

Expected Carait Pages settings: root directory client; build command npm run build; output directory dist. Confirm Functions are included from client/functions. Set API_ORIGIN to the HTTPS Render API origin and API_PROXY_SECRET to the matching secret on Render (minimum32 characters); do not expose server/provider credentials through VITE variables. These names are from source, not verified remote settings.

No broken active asset import was reported by Vite. External image/provider delivery and real clinic Maps pin verification remain untested. Primary JS chunk size warning remains. Local Windows Nodev22.15.0 is not the exact Linux image from the supplied Cloudflare log.
