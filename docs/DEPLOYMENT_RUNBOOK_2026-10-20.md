# CARAIT Clinic — staging/deployment preparation (October 20, 2026)

**Release status:** Code changes prepared and dependency-free tests passed. **Not certified for production.** No real payments, no migration against a live database, no browser E2E, no live webhook, and no live Cloudflare/Render/TiDB access occurred in this review.

## Non-negotiable release rules

1. PayMongo **TEST mode only** (`PAYMONGO_MODE=test`; `sk_test_...` / `pk_test_...`). Do not add live keys until business approval and a separately reviewed live-mode implementation.
2. Never import the original MySQL dump on top of an existing clinic database: it includes `DROP TABLE` statements, account records, and potentially private medical/financial information. Store it encrypted/off-repository.
3. Do not apply any database migration before a verified restorable backup and a disposable TiDB staging test.
4. Keep the actual source Git repository, including genuine image/binary files. The supplied **flattened .txt source is not a replacement for the original Git repository**: some image entries contain only source URLs, not binary PNG data.
5. Verify the PayMongo `payment.paid` idempotency, expiry, reconciliation and billing/inventory behavior on sandbox before any production payment release.

## Changes in this patch

- `server/db/connectionOptions.js` (new) + `server/db/connect.js`: optional `DB_PROVIDER=tidb`, DB port, TLS verification, optional trusted CA path.
- `server/utils/envValidation.js`: production HTTPS origin validation and **fail-closed** PayMongo mode/key validation (TEST only).
- `server/scripts/tidbMigrationAdapter.js` (new) + `server/scripts/branchMigrations.js`: application-managed schema guards for three historical procedure-based migrations when they are unapplied on TiDB. The original migration SQL and SHA-256 hashes are **unchanged**.
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

- Create a **new empty staging TiDB database** (not production). Copy connection details from TiDB Cloud's **Connect** UI. Set the exact host, port, username and DB; TiDB's public endpoint generally uses **4000 + verified TLS**.
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
TRUST_PROXY=true
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

- Create a **Node web service** from the real repository, root directory `server`, build `npm ci`, start `npm start`; use a supported Node 22 runtime. A paid non-sleeping web service is preferable for clinic operations.
- Keep startup migrations OFF; run them deliberately in a protected job before opening traffic. Use `/api/ready` to verify database reachability, `/api/health` for liveness.
- Preserve default Render HTTPS and any extra custom `api.` hostname. Webhook route must be reachable **directly at Render** (not through Cloudflare Pages):
  `https://YOUR_RENDER_API_HOST/api/webhooks/paymongo`.
- Set `TRUST_PROXY=true` only behind a trusted proxy and review real-IP/rate-limiter behavior.

## Step 4 — Cloudflare Pages

- Connect the actual Git repository to Pages. Root directory `client`; build `npm ci && npm run build`, build output `dist`. Keep the `functions/` directory at the **client project root** so Pages Functions sees it.
- Set **Pages Function runtime environment variable** `API_ORIGIN=https://YOUR_RENDER_API_HOST` (no path or trailing slash). This is **not** a Vite client variable; do not use `VITE_API_ORIGIN`.
- Keep `client/public/_routes.json` in the actual repository; Vite copies it to `dist`. Browser requests to `/api/*` will be handled by Pages Function. PayMongo webhooks are intentionally denied here.
- Add your purchased domain and HTTPS through Cloudflare; set `CLIENT_URL` in Render to the exact Cloudflare origin, e.g., `https://staging.example.com` with no trailing `/`. Do not point `CLIENT_URL` at the backend URL.
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

## Actual validation in this delivery environment

- `npm run verify:source` **passed**: 384 backend source files / 975 relative imports.
- `npm run test:node` **passed**: 171 Node regression tests, including 5 new hosting/TiDB checks.
- `npm run test:design` **passed**: 8 frontend tests.
- `npm run test:hosting` **passed**: 3 new Pages proxy tests.
- `npm ci --offline` was attempted on both projects but failed due to missing cached dependencies. Therefore the full client build, ESLint, Vitest, browser UI, and real TiDB/PayMongo network tests are **not verified** here.
- The sanitized TiDB schema-only candidate was generated from the supplied dump, but **never imported**. It omits all 24 original INSERT statements.
- **Do not interpret these unit/regression results as authorization to deploy a live clinic/payment environment.**
