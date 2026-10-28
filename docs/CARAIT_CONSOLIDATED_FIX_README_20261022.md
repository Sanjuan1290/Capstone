# CARAIT Clinic — Consolidated UAT + UI Fixes (2026-10-22)

**Patch origin:** Latest available source export `AllCodes(20261020-155114).txt`, with the independently supplied `carait-uat-fixes-20261022.patch` merged with unique UI improvements from `CARAIT_Targeted_Production_Fixes_20261022.zip`. The source export is **not the live GitHub repository**; inspect HEAD and review conflicts before applying. No changes have been deployed or made to production data.

## Included corrections

**UAT backend fixes (D1–D11):** migration verifier branch-reference fix; reconciliation arrays/cashiers; correct Super Admin account settings session; discount presets GET; Adjustments route; branch default setup; Doctor Dashboard parameter/count fixes; clinical consumable inventory finalization; Staff cashier SQL disambiguation; duplicate PayMongo event false review alert prevention. All corresponding UAT regression files are retained.

**UI fixes:** preserve UAT reconciliation implementation; add frontend response guards to Billing Overview/Daily Cash Reconciliation; rename Recent Transactions in Billing Overview to Recent Bills; rename Daily Close to Daily Cash Reconciliation with existing context; link Adjustment Requests to existing Approvals, with proper selected-branch active state; visible Add Staff button; independent Announcements sections and meaningful `Status unavailable` when provider check fails; replace React Router developer error with a clinic-friendly branch error page.

**Open UAT D12 implemented locally:** new Branch Admin accounts receive `must_change_password=1`; after MFA, the first login directs to `/admin/change-password-required`, where they must create a new password. Server middleware returns `428 PASSWORD_CHANGE_REQUIRED` on all protected Branch Admin API requests until completion, including branch workspace routes. Only the password-creation endpoint remains available. Completing the change clears the flag and revokes/reissues sessions. Existing administrators default to 0, so they are not forcibly logged out. Password recovery also clears the first-login flag. Super Admin unaffected.

**D13/D14 wording:** The Announcements status clarifies that marketing campaigns can be paused by missing sender/unsubscribe configuration even if transactional Resend works; the administrator invitation fallback no longer mentions SMTP. **`MARKETING_UNSUBSCRIBE_SECRET` still needs to be configured and verified on Render** if the email campaign feature is desired; this patch does not insert or reveal a secret.

## Important — schema prerequisites

The first-login fix requires two new `admins` columns, added idempotently by `ensureAppSchema()`:

- `must_change_password TINYINT(1) NOT NULL DEFAULT 0`
- `password_changed_at DATETIME NULL`

Before deploying this backend, back up TiDB and run **`cd server && npm run migrate` against a disposable/staging database first**, and confirm `npm run verify:deploy`. Deploy to production only after a reviewed forward-only migration procedure is approved and verified. An optional **manual** SQL file is provided in `server/db/migrations/2026-10-22-admin-required-password.MANUAL.sql` for use *only if those columns do not exist and the automatic migration cannot be run*. **Never run both methods without checking column existence.** The manual file is not registered in `branchMigrations.js`; historical migration checksums are untouched.

The normal Render build previously ran only `npm ci`. **Simply pushing this patch without performing the schema migration first can break administrator authentication.** Do not run a database reset or edit old migration files to silence SHA errors.

## Validation from this environment

- Source graph: 412 files / 1,011 relative imports resolved.
- TypeScript parser: 427 JS/JSX files parsed; zero syntax errors (before a couple of final string-only label changes).
- Frontend Node suite: 43/43 passed.
- Focused Branch Admin security tests: 6/6 passed (first-login 428 gate, allowed password endpoint, existing admin and Super Admin). The code path was executed using a mocked database and session identity, not a live database.
- Foundation schema + new security + UAT selected tests: 19/19 passed.
- Git diff whitespace check: passed.
- Full Node suite: **not fully passed in this reconstructed environment.** The attempted run produced 217/228 passes, 11 failures mostly from missing `mysql2`/`express` dependencies; one failure was an existing pinned historical migration checksum mismatch from the flattened source export. The old sign-in assertion was updated to reflect the required first-login redirect. Install dependencies in the real repo and rerun.
- Vite build/lint, authenticated Cloudflare/Render, PayMongo provider, TiDB and full browser transaction: **not executed here** (dependencies/provider connections unavailable).

## Apply safely

1. Confirm that the target repository's current HEAD corresponds to the source export/patch baseline. Back up all working changes. Do not apply the earlier UAT or targeted ZIP separately on top of this patch.
2. Review this consolidated patch using `git apply --check` and `git diff` (or copy the ZIP files into a scratch branch and review). Merge any changes made since the export; do not force-apply conflicts.
3. Run `npm ci`, `npm run verify:source`, `npm run test:node`, `npm test`, `npm run verify:deploy` in `server` using a safe staging configuration, and `npm ci`, `npm run lint`, `npm run build` in `client`.
4. In an isolated DB, test Branch Admin invitation → MFA login → password change required → actual password update → dashboard access; existing Branch Admin login; Super Admin login, Doctor Dashboard, consultation with consumable stock; Billing Overview, Daily Cash Reconciliation, adjustments, cashier drawer, discount presets and announcements.
5. Validate PayMongo TEST checkout against the real provider and disposable TiDB; reconcile bill, receipt and stock once, and verify refund and void flows.
6. Deploy backend and frontend together only after the database migration and test results have been reviewed. Retest the original production `GET /api/branches/workspace/1/legacy/dashboard` failure with Render `[api-error]` request logs.

## Still blocked / not claimed fixed

- Original production selected-branch Dashboard HTTP 500 and Doctor Availability generic errors were not reproduced by the external local UAT; exact Render/TiDB log evidence is still required. The Doctor's own dashboard 500 was fixed separately by UAT D7.
- Announcements backend failure could originate in schema or missing environment settings; UI now gives accurate partial-error states, but live readiness still needs verification.
- Actual PayMongo TEST webhook, real TiDB reconciliation, refunds and mobile browser E2E remain unverified.
- No production data, settings, domain, PayMongo LIVE activation or real email campaigns have been touched.

**Deployment status: NOT PRODUCTION-VERIFIED.**
