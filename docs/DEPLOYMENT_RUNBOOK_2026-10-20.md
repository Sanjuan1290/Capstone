# CARAIT Clinic — staging/deployment preparation (October 20, 2026)

**Release status:** Local build and regression checks pass. **Not certified for production.** No TiDB migration, browser E2E, PayMongo network call, live webhook, or hosting deployment was performed. A read-only Reports SQL `EXPLAIN` check ran against the database configured in the local server environment; it did not apply migrations or modify rows, and that target was not verified as a disposable TiDB staging database.

## Non-negotiable release rules

1. PayMongo **TEST mode only** (`PAYMONGO_MODE=test`; `sk_test_...` / `pk_test_...`). Do not add live keys until business approval and a separately reviewed live-mode implementation.
2. Never import the original MySQL dump on top of an existing clinic database: it includes `DROP TABLE` statements, account records, and potentially private medical/financial information. Store it encrypted/off-repository.
3. Do not apply any database migration before a verified restorable backup and a disposable TiDB staging test.
4. Keep the actual source Git repository, including genuine image/binary files. The supplied **flattened .txt source is not a replacement for the original Git repository**: some image entries contain only source URLs, not binary PNG data.
5. Verify the PayMongo `payment.paid` idempotency, expiry, reconciliation and billing/inventory behavior on sandbox before any production payment release.

## Changes in this patch

- `server/db/connectionOptions.js` + `server/db/connect.js`: optional `DB_PROVIDER=tidb`, DB port, verified TLS, optional trusted CA path, bounded pool/queue settings, and connection timeout. `DB_PASSWORD` is preferred while legacy `DB_PASS` remains supported.
- `server/package.json` + lock file: keep the production dependency tree clear of known advisories; transactional and marketing email use the Resend HTTPS API without Nodemailer or SMTP.
- `server/utils/envValidation.js`: production HTTPS origin validation and **fail-closed** PayMongo mode/key validation (TEST only).
- `server/middlewares/trustedProxy.middleware.js` + Pages proxy: signed Cloudflare client-IP attribution, forwarded-header stripping, and a 30-second upstream response timeout. Production now requires the same private `API_PROXY_SECRET` in Render and Pages; `TRUST_PROXY=true` is rejected.
- `server/scripts/tidbMigrationAdapter.js` + `server/scripts/branchMigrations.js`: application-managed schema guards for three historical procedure-based migrations when they are unapplied on TiDB. A database lock row serializes migration runners; failed migrations are not recorded, and guarded DDL can be retried. The original migration SQL and SHA-256 hashes are **unchanged**.
- `server/utils/schema.js`: preserve saved UOM precision, avoid recurring abbreviation-column deletion, and rebuild the derived stock summary atomically.
- `server/utils/marketingCampaigns.js`: use normal locking `FOR UPDATE` on TiDB (already protected by the locked campaign row); retain the existing MySQL `SKIP LOCKED` behavior.
- `server/scripts/prepareTidbDump.js`: non-destructive, offline dump-preparation tool, default **schema-only**, never imports by itself.
- `client/functions/api/[[path]].js` + `client/public/_routes.json`: Cloudflare Pages same-origin API proxy for Render. Cookies and event-stream body are preserved; signed PayMongo webhook must go directly to Render.
- New dependency-free tests for the TiDB adapter, TLS, dump safeguards, Cloudflare proxy and test-only PayMongo settings.
- <code>server/scripts/foundationSchema.js</code> verifies the migration's branch-column definitions, all required index definitions, foreign keys and delete rules, seed records, and existing branch ownership data. <code>branchMigrations.js</code> checks this contract before recording the foundation and rechecks it when the migration was previously recorded.
- Unrecorded partial migrations can be retried. The runner adds missing branch-scoped unique indexes safely and removes an old global index only after confirming the replacement. A missing or malformed foreign key fails with a diagnostic and is not recreated blindly.
- <code>client/src/pages/doctorPage/Doctor_Consultation.jsx</code> now protects autosaves from stale consultation loads, route changes, slow requests, and finalization races. <code>client/src/utils/consultationDraftQueue.js</code> serializes saves by appointment.
- <code>server/scripts/sourceExport.js</code> generates sorted, repeatable source exports while excluding local credentials, old exports, archives, database dumps, dependencies, build output, and temporary files.

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
- Before recording the foundation migration, metadata verification checks 28 required tables, the 27 branch-column calls and definitions, 22 indexes (including <code>uniq_branch_service_name</code> and <code>uniq_branch_inventory_barcode</code>), five foreign keys and delete rules, the branch and booking-settings seeds, the existing unscoped Super Admin, and null or orphaned branch references. Local tests mock database metadata; they do not replace a disposable TiDB run.
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
DB_PASSWORD=<secret>
# DB_PASS remains accepted for existing installations.
DB_NAME=<staging_database>
DB_SSL=true
# DB_SSL_CA_PATH=/etc/secrets/tidb-ca.pem   # only if your cluster requires it
DB_POOL_SIZE=10
DB_CONNECT_TIMEOUT_MS=10000
DB_QUEUE_LIMIT=0
DB_TIME_ZONE=+08:00
CLIENT_URL=https://staging.yourdomain.example
JWT_SECRET=<long-random-secret-32-plus-chars>
API_PROXY_SECRET=<same-random-secret-configured-in-Cloudflare-Pages>
RUN_SCHEMA_MIGRATIONS_ON_STARTUP=false
ADMIN_MFA_ENABLED=true
QUEUE_DISPLAY_PIN=<unique-random-6-to-12-digit-PIN>
EMAIL_PROVIDER=resend
RESEND_API_KEY=<resend-send-only-api-key>
EMAIL_FROM=CARAIT Clinic <no-reply@caraitclinic.com>
PAYMONGO_MODE=test
PAYMONGO_SECRET_KEY=<sk_test_...>
PAYMONGO_PUBLIC_KEY=<pk_test_...>
PAYMONGO_WEBHOOK_SECRET=<test-webhook-signing-secret>
```

Also configure required Semaphore, Cloudinary, marketing services *only* if those features will be used. Never paste real values into GitHub issues or chat.

## Step 3 — Render web service

- Create a [Render web service](https://render.com/docs/web-services) from the real repository, root directory `server`, build `npm ci --omit=dev`, start `npm start`; use a supported Node 22 runtime. Run full tests in CI before building the production service.
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

- Dependency-free checks: `cd server && npm run verify:source && npm run test:node`; `cd client && npm run test:design && npm run test:hosting && npm run test:autosave`.
- Dependency-required: run backend `npm test`, client `npm run lint && npm run build`; static checks do **not** replace these.
- With an isolated DB and five non-production test users, exercise every role's navigation, auth/MFA, appointment states, cancellation and availability, consultation, records, audit, queue display, stock transfers, supplier inventory, cashier approval/closure, refunds, reporting, promotions, branch isolation, and real-time notifications.
- Test unknown/error pages, slow network, concurrent changes, browser refresh, desktop/mobile, invalid uploads, rate-limits, expired cookies, attempted cross-branch access, malformed webhook payloads.
- Verify backups and actual restoration, including audit and bill records, before releasing any real patient data.

### Role smoke checklist

Run these checks with synthetic staging accounts. Repeat access checks with two branches:

- **Super Admin:** sign in and complete MFA; inspect both branches; grant and revoke a Branch Admin permission; verify branch settings and activity.
- **Branch Admin:** manage a service, booking setting, and staff permission in the assigned branch; confirm another branch's appointments, billing, staff, and stock are inaccessible.
- **Staff:** check in a synthetic appointment; advance the queue; complete a cash checkout and a PayMongo TEST QR checkout; confirm one receipt and one inventory deduction after verified settlement.
- **Doctor:** open two synthetic appointments; edit, wait for autosave, switch tabs, refresh, and return; retry after a failed draft request; finalize one consultation; confirm fields remain locked and corrections use an amendment.
- **Patient:** verify their account, book/view/cancel a synthetic appointment, confirm only their records are visible, and complete a PayMongo TEST checkout.
- **All roles:** check session cookies through Pages, MFA, logout, page refresh, timeout/error responses, and denied cross-branch requests.

### Export verified source

From the repository, run <code>cd server && npm run export:deployment</code>. It writes <code>AllCodes_DEPLOYMENT_FINAL_20261020.txt</code> and <code>CARAIT_DEPLOYMENT_FINAL_20261020.zip</code> in the repository root. The ZIP retains project assets, including binary images. The export test runs twice and checks that outputs remain byte-for-byte stable.

## Actual validation in this review

- Dependency installation completed from both lockfiles with `npm.cmd ci`.
- `cd server && npm.cmd run verify:source`: passed; 400 source files and 994 relative imports resolved.
- `cd server && npm.cmd run test:node`: passed; 202 tests, including mocked schema/migration/export checks and a local HTTPS Express-to-Pages proxy integration test.
- `cd server && npm.cmd test`: passed; 77 files and 259 Vitest tests.
- `cd client && npm.cmd run test:design`: passed, 8 tests.
- `cd client && npm.cmd run test:hosting`: passed, 5 tests.
- `cd client && npm.cmd run test:autosave`: passed, 7 tests.
- `cd client && npm.cmd run lint`: passed with 0 errors and 15 existing hook/dependency warnings.
- `cd client && npm.cmd run build`: succeeded; Vite reports a 2,080.32 kB JS chunk (507.86 kB gzip), above its 500 kB advisory threshold.
- `npm.cmd audit --omit=dev` passed in both packages with 0 production vulnerabilities. The full dependency-tree audit from dependency installation reported 3 high development-only server findings and 5 high plus 2 moderate client build-tool findings. Keep Render installs production-only and build jobs restricted to trusted source.
- Combined tests executed in this follow-up: 481 passed, 0 failed, 0 skipped (202 Node, 259 Vitest, 8 design, 5 hosting, 7 autosave).
- Tests exercise migration ordering/checksums/retry/locking with mocks; foundation schema contract and safe partial index recovery; export determinism and exclusions; Cloudflare proxy methods, body, query, cookies, streaming and timeout; signed visitor IP attribution; and consultation autosave concurrency. The local proxy integration starts a local HTTPS Express server. No external Render or Cloudflare service was contacted.
- Not run: `npm.cmd run verify:deploy`, `npm.cmd run migrate`, DB-backed Reports checks, startup/readiness against a disposable database, browser five-role UAT, or PayMongo sandbox/webhook tests. Existing local `.env` files were not read. No database connection, schema change, payment request, or deployment was made.
- The named `AllCodes(20261020-035717).txt` source reference is absent from this checkout. Work used the real Git repository at `a6e0ee7`; historical SQL migrations have no changes.

### Proxy replay limitation

The Pages-to-Render IP assertion uses HMAC-SHA256 over the IP, timestamp, method, and URL, with a 60-second freshness window. It rejects forged and expired headers and strips unsigned forwarding metadata. It does not use a shared one-time nonce and does not sign the request body, so a captured valid header could be replayed during the freshness window for the same method and URL. TLS protects the normal Pages-to-Render hop; treat this as a **Medium residual security finding** and resolve or formally accept it before production. A correct distributed replay defense needs shared state or an equivalent edge/origin control; per-process memory alone would not cover multiple Render instances.

No database rows or schema were changed. These checks do not authorize production deployment or real payments.

## Rollback and recovery

1. Before any schema change, create a TiDB snapshot/backup and restore it into a **new disposable database** to prove the backup can be read. Do not test restore by overwriting the clinic database.
2. Keep each Render and Pages release tied to a recorded Git commit. If the app release fails, roll both services back to the previous successful commit using their deployment history.
3. Do not run reverse SQL by guesswork. Some MySQL/TiDB DDL auto-commits. If a migration fails, stop the release, retain logs, inspect the migration registry and schema, and rehearse a repair against a disposable copy first.
4. If data recovery is required, restore the snapshot into a new TiDB database, validate schema and synthetic workflows there, then repoint Render only after the recovered database passes readiness and reconciliation checks. If new clinic activity occurred after the snapshot, reconcile those records before switching.
5. Recheck `/api/ready`, role logins, branch isolation, receipts, inventory balances, audit records, and PayMongo TEST-mode webhook verification before reopening staging traffic. Real payments remain disabled.

