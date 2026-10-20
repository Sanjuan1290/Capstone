# CARAIT Clinic — staging/deployment preparation (October 20, 2026)

**Release status:** Local build and regression checks pass. **Not certified for production.** No TiDB migration, browser E2E, PayMongo network call, live webhook, or hosting deployment was performed. A read-only Reports SQL `EXPLAIN` check ran against the database configured in the local server environment; it did not apply migrations or modify rows, and that target was not verified as a disposable TiDB staging database.

## Non-negotiable release rules

1. PayMongo **TEST mode only** (`PAYMONGO_MODE=test`; `sk_test_...` / `pk_test_...`). Do not add live keys until business approval and a separately reviewed live-mode implementation.
2. Never import the original MySQL dump on top of an existing clinic database: it includes `DROP TABLE` statements, account records, and potentially private medical/financial information. Store it encrypted/off-repository.
3. Do not apply any database migration before a verified restorable backup and a disposable TiDB staging test.
4. Keep the actual source Git repository, including genuine image/binary files. The supplied **flattened .txt source is not a replacement for the original Git repository**: some image entries contain only source URLs, not binary PNG data.
5. Verify the PayMongo `payment.paid` idempotency, expiry, reconciliation and billing/inventory behavior on sandbox before any production payment release.

## Changes in this patch

- `server/db/connectionOptions.js` (new) + `server/db/connect.js`: optional `DB_PROVIDER=tidb`, DB port, TLS verification, optional trusted CA path.
- `server/utils/envValidation.js`: production HTTPS origin validation and **fail-closed** PayMongo mode/key validation (TEST only).
- `server/middlewares/trustedProxy.middleware.js` + Pages proxy: signed Cloudflare client-IP attribution, forwarded-header stripping, and a 30-second upstream response timeout. Production now requires the same private `API_PROXY_SECRET` in Render and Pages; `TRUST_PROXY=true` is rejected.
- `server/scripts/tidbMigrationAdapter.js` (new) + `server/scripts/branchMigrations.js`: application-managed schema guards for three historical procedure-based migrations when they are unapplied on TiDB. The original migration SQL and SHA-256 hashes are **unchanged**.
- `server/utils/schema.js`: preserve saved UOM precision, avoid recurring abbreviation-column deletion, and rebuild the derived stock summary atomically.
- `server/utils/marketingCampaigns.js`: use normal locking `FOR UPDATE` on TiDB (already protected by the locked campaign row); retain the existing MySQL `SKIP LOCKED` behavior.
- `server/scripts/prepareTidbDump.js`: non-destructive, offline dump-preparation tool, default **schema-only**, never imports by itself.
- `client/functions/api/[[path]].js` + `client/public/_routes.json`: Cloudflare Pages same-origin API proxy for Render. Cookies and event-stream body are preserved; signed PayMongo webhook must go directly to Render.
- New dependency-free tests for the TiDB adapter, TLS, dump safeguards, Cloudflare proxy and test-only PayMongo settings.

## Step 1 — Git source, environments, privacy

- Create a protected release branch from the actual source repository. Overlay files in the patch using the **same paths**; do not replace the real image assets with text-export placeholders.
- Use Node.js version compatible with Vite 8 and the server dependencies (recommended Node 22 LTS; pin version in Cloudflare/Render).
- Create separate staging and production databases/Render services when possible. Store credentials in Render environment variables / TiDB secrets, never in Git or Vite `VITE_` variables.
- Review clinical privacy, access permissions, secure image moderation, retention, backups and incident recovery before accepting real patient details.

## Step 2 — TiDB Cloud staging

- Create a **new empty staging TiDB database** (not production). Copy connection details from TiDB Cloud's **Connect** UI. Set the exact host, port, username and DB; TiDB Cloud Dedicated uses port `4000` with verified TLS ([TiDB TLS connection guide](https://docs.pingcap.com/tidbcloud/tidb-cloud-tls-connect-to-dedicated/)).
- Place the **original** dump in a private local folder. For a synthetic/schema-only rehearsal, generate a script:

```bash
cd server
node scripts/prepareTidbDump.js "/private/Dump20261020.sql" "/private/TiDB_SCHEMA_REVIEW.sql"
```

- **Review** the generated SQL and import only into an empty, disposable staging database, after confirming TiDB's supported DDL and collation. Schema-only mode intentionally omits accounts and rows; test accounts must be created safely.
- If current clinic records must be migrated, use an approved, encrypted MySQL-to-TiDB migration workflow. There is an explicit `--include-data` option (requires `CARAIT_ACKNOWLEDGE_SENSITIVE_DATA=YES`), but its generated SQL still requires a private import test and clinical data governance review.
- The original dump includes five recorded migrations. The migration runner preserves their original hashes and skips entries that match. **Do not edit historical migration SQL or checksum rows.**
- Verify and run, on disposable staging **only**, after inspecting outputs:

```bash
cd server
npm ci
npm run migrate
npm run verify:deploy
npm run verify:reports-sql
npm run test:node
npm test
```

- Compare table/column counts, primary and unique indexes, foreign keys, decimals, time zones, and multi-branch isolation against the original MySQL database. Run the app using `DB_PROVIDER=tidb` and confirm `/api/ready`. Import success is **not established** by static checks alone.

### Render environment (server-only)

```dotenv
NODE_ENV=production
PORT=10000
DB_PROVIDER=tidb
DB_HOST=<from-tidb>
DB_PORT=4000
DB_USER=<from-tidb>
DB_PASS=<secret>
DB_NAME=<staging_database>
DB_SSL=true
# DB_SSL_CA_PATH=/etc/secrets/tidb-ca.pem   # only if your cluster requires it
DB_TIME_ZONE=+08:00
CLIENT_URL=https://staging.yourdomain.example
JWT_SECRET=<long-random-secret-32-plus-chars>
API_PROXY_SECRET=<same-random-secret-configured-in-Cloudflare-Pages>
RUN_SCHEMA_MIGRATIONS_ON_STARTUP=false
ADMIN_MFA_ENABLED=true
QUEUE_DISPLAY_PIN=<unique-random-6-to-12-digit-PIN>
EMAIL_USER=<mfa-mailbox>
EMAIL_PASS=<app-password>
PAYMONGO_MODE=test
PAYMONGO_SECRET_KEY=<sk_test_...>
PAYMONGO_PUBLIC_KEY=<pk_test_...>
PAYMONGO_WEBHOOK_SECRET=<test-webhook-signing-secret>
```

Also configure required Semaphore, Cloudinary, marketing services *only* if those features will be used. Never paste real values into GitHub issues or chat.

## Step 3 — Render web service

- Create a [Render web service](https://render.com/docs/web-services) from the real repository, root directory `server`, build `npm ci`, start `npm start`; use a supported Node 22 runtime. A paid non-sleeping web service is preferable for clinic operations.
- Keep startup migrations OFF; run them deliberately in a protected job before opening traffic. Use `/api/ready` to verify database reachability, `/api/health` for liveness.
- Preserve default Render HTTPS and any extra custom `api.` hostname. Webhook route must be reachable **directly at Render** (not through Cloudflare Pages):
  `https://YOUR_RENDER_API_HOST/api/webhooks/paymongo`.
- Set `API_PROXY_SECRET` to a unique random value of at least 32 characters. The same value must be configured as an encrypted [Cloudflare Pages Function secret](https://developers.cloudflare.com/pages/functions/bindings/). The Pages Function signs the Cloudflare-observed client IP and request target; Render ignores unsigned forwarded-IP headers. Do not set `TRUST_PROXY=true`.

Generate the secret locally and paste it only into the Render and Cloudflare secret stores (never into Git or chat):

```bash
openssl rand -hex 32
```

## Step 4 — Cloudflare Pages

- Connect the actual Git repository to Pages. Root directory `client`; build `npm ci && npm run build`, build output `dist`. Keep the `functions/` directory at the **client project root** so Pages Functions sees it.
- Set **Pages Function runtime variables** `API_ORIGIN=https://YOUR_RENDER_API_HOST` (no path or trailing slash) and the secret `API_PROXY_SECRET` (same value as Render). These are **not** Vite client variables; do not use `VITE_API_ORIGIN` or `VITE_API_PROXY_SECRET`.
- Keep `client/public/_routes.json` in the actual repository; Vite copies it to `dist`. Browser requests to `/api/*` will be handled by Pages Function. PayMongo webhooks are intentionally denied here.
- The Pages Function strips browser-supplied forwarding metadata, signs the edge-observed client IP for Render, and returns 504 if the upstream API fails to respond within 30 seconds. SSE streams remain unbuffered after headers arrive.
- Add the domain to the Cloudflare zone, then follow the [Pages custom-domain setup](https://developers.cloudflare.com/pages/configuration/custom-domains/) for apex/hostnames and DNS records. Confirm the certificate is active and HTTPS works. Set `CLIENT_URL` in Render to the exact browser origin, e.g., `https://staging.example.com` with no trailing `/`. Do not point `CLIENT_URL` at the backend URL.
- Check a direct hard refresh on `/patient/login`, `/admin/login`, `/doctor/login`, `/staff/login`, `/superadmin`, public CMS URLs, etc. SPA fallback should return the frontend app, while unknown `/api/*` paths return JSON errors.
- Confirm cookies persist through the same-origin Pages API proxy; check login, MFA, logouts, `EventSource` streams and concurrent tabs.

## Step 5 — PayMongo TEST, after staging deployment

- Use TEST dashboard keys and a **test-mode** webhook that points directly to the Render HTTPS endpoint. Subscribe only to event types handled by the current PayMongo integration (`payment.paid`, `payment.failed`, and `qrph.expired`, as configured in source). Use the exact webhook signing secret for that endpoint.
- Generate QR Ph in the clinic checkout, use PayMongo `test_url` simulation only. **Never scan test QR codes from actual banking or wallet apps.**
- Confirm: signature failures denied; test-mode only; exact bill amount/branch; duplicate event and retries produce exactly one receipt; bill locks clear on terminal states; inventory is deducted only once after correct settlement; failed/expired payments stay unpaid; race conditions, timeout, sweeper/reconciliation, and refunds require QA.
- Do **not** change to live keys or enable live processing until account approval and a separately reviewed, tested release.

## Step 6 — QA gates and release decision

- Dependency-free checks: `cd server && npm run verify:source && npm run test:node`; `cd client && npm run test:design && npm run test:hosting`.
- Dependency-required: run backend `npm test`, client `npm run lint && npm run build`; static checks do **not** replace these.
- With an isolated DB and five non-production test users, exercise every role's navigation, auth/MFA, appointment states, cancellation and availability, consultation, records, audit, queue display, stock transfers, supplier inventory, cashier approval/closure, refunds, reporting, promotions, branch isolation, and real-time notifications.
- Test unknown/error pages, slow network, concurrent changes, browser refresh, desktop/mobile, invalid uploads, rate-limits, expired cookies, attempted cross-branch access, malformed webhook payloads.
- Verify backups and actual restoration, including audit and bill records, before releasing any real patient data.

## Actual validation in this review

- `npm run verify:source` passed: 389 backend source files and 982 relative imports resolved.
- `npm run test:node` passed all 180 tests; `npm test` passed 77 files and 258 tests.
- `npm run test:design` passed 8 tests; `npm run test:hosting` passed 5 tests.
- `npm run lint` passed with 0 errors and 17 React hook/dependency warnings.
- `npm run build` succeeded. Vite reports the main minified JS chunk is about 2.08 MB (507 KB gzip), above its 500 KB advisory threshold.
- `npm run verify:reports-sql` completed 20 read-only `EXPLAIN` checks against the database configured in `server/.env`. No migration or write test was run against that target, and it was not verified as disposable TiDB.
- Mocked checks cover TiDB TLS/options, all three registered stored-procedure migration adapters, stock-summary transaction rollback, signed proxy-IP handling, spoofed and expired signatures, request methods/bodies, timeout behavior, and PayMongo TEST-only configuration.
- Not run: `npm ci` (dependencies were already installed), `npm run verify:deploy`, migrations, a TiDB disposable-database integration pass, live backend startup/readiness, five-role browser E2E, or PayMongo sandbox/network tests. No PayMongo requests or deployments were made.
- Historical SQL files outside the three migrations registered in `branchMigrations.js` remain unchanged. Replaying the entire historical SQL directory into a fresh TiDB database is not validated; test the documented current migration path against disposable TiDB first.
- No database rows or schema were changed in this review. These checks do not authorize production deployment or real payments.

## Rollback and recovery

1. Before any schema change, create a TiDB snapshot/backup and restore it into a **new disposable database** to prove the backup can be read. Do not test restore by overwriting the clinic database.
2. Keep each Render and Pages release tied to a recorded Git commit. If the app release fails, roll both services back to the previous successful commit using their deployment history.
3. Do not run reverse SQL by guesswork. Some MySQL/TiDB DDL auto-commits. If a migration fails, stop the release, retain logs, inspect the migration registry and schema, and rehearse a repair against a disposable copy first.
4. If data recovery is required, restore the snapshot into a new TiDB database, validate schema and synthetic workflows there, then repoint Render only after the recovered database passes readiness and reconciliation checks. If new clinic activity occurred after the snapshot, reconcile those records before switching.
5. Recheck `/api/ready`, role logins, branch isolation, receipts, inventory balances, audit records, and PayMongo TEST-mode webhook verification before reopening staging traffic. Real payments remain disabled.
