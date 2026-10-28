# CARAIT Batch-Free Inventory — IMPLEMENTATION IN PROGRESS (2026-10-28)

**This is a local staging/development artifact, NOT a complete production migration.**
Do **not** deploy this package to Render/Cloudflare or run the included staging SQL on production.
No live database was accessed or changed while preparing this package.

## What is implemented in source

- `server/utils/inventoryLocationStock.js`: new item/location-only receipt, issue, transfer service with atomic caller-owned transactions, explicit branch/item/location validation, duplicate-key handling, exact 4-decimal conversions, and checked location stock + derived item summary updates.
- `server/routers/branchLocationStock.js`: new Admin/Superadmin permission-scoped APIs (`GET /inventory/location-stock`, `POST /inventory/:id/location-movement`) registered alongside older APIs, **but runtime-blocked** until approved cutover.
- `server/utils/inventoryModeSafety.js`: refuses any legacy batch write/rebuild when database marker indicates location mode, regardless of lost environment settings.
- `server/utils/inventoryBatches.js`, `server/utils/schema.js`, `server/server.js`: safety barriers against unintended mode switching and old batch rebuilding. New mode causes the current server to refuse startup because high-risk writers are not yet converted.
- `server/migrations/manual/2026-10-28-batchfree-foundation.STAGING-ONLY.sql`: additive table and precision migration, mode stays `batch` by default. Contains **no historical table drops**.
- `server/docs/BATCHFREE_PRECUTOVER_READ_ONLY.sql`: read-only inventory reconciliation/expiry queries.
- `server/tests/inventory/`: 17 synthetic unit tests for arithmetic/movement/mode guards.
- `server/package.json`: new `npm run test:batchfree` command.

## Critical incomplete work — NO-GO

1. Doctor consultation dispensing still consumes and records batches.
2. Cashier/PayMongo-paid dispensing still consumes and records batches.
3. Historical-consumption returns, bill corrections and refunds still use batch references.
4. Supply-request review and cross-branch transfers still use batch allocations.
5. Staff legacy inventory endpoints still depend on batches.
6. Existing React Inventory UI still shows Manage Batches, and Stock In/Out/Move Stock use batch selectors. The new Admin/Superadmin endpoints have not replaced that UI.
7. Reports/stock readiness and low-stock calculations still use old batch data in places.
8. Medicine physical count/expiry reconciliation is incomplete. The Oct 28 backup contains an already-expired 9-unit allocation and a separate unexpired 10-unit allocation for one item; do not combine them as usable stock.
9. Actual TiDB staging migration + idempotency/concurrency/rollback/browser tests have **not** executed.
10. The manual Batch 4 promotion migration-history reconciliation is a separate outstanding item.

**Do not set `CARAIT_INVENTORY_LOCATION_MODE=enabled`.** Current startup intentionally aborts if set. Even a DB-only marker change to `mode='location'` intentionally blocks the old server. This is a safety gate, not an activation instruction.

## Test evidence (October 28 local extraction)

- New batch-free foundation: **17/17 passed** (`node --test server/tests/inventory/*.node.test.cjs`). These use synthetic mocked SQL, not a TiDB instance.
- Existing client Node suite: **103/103 passed**.
- Source graph: **458 source files, 1113 imports resolved**.
- Existing server Node suite: **312/317 passed**; 4 file failures are missing dependencies in this extracted environment, plus 1 historical migration checksum test failure. **Not a clean full regression pass**.
- No frontend production build or connected database E2E tests executed.

## What to do next, in this exact order

1. Reconcile physical and DB inventory and approve medicine expiry/quarantine treatment. Use provided read-only SQL to detect differences.
2. Complete the new ledger integration for clinical dispensing, paid checkout, returns, and transfers; preserve existing financial triggers and audit linkage.
3. Replace Staff/Admin/Superadmin frontend Stock In/Out/Move screens, and eliminate active batch mutation endpoints.
4. Rehearse additive SQL and exact opening-balance migration on a disposable, privacy-restricted TiDB clone. Resolve every discrepancy before activation.
5. Run concurrent transaction tests with real TiDB, full client/server suites, and browser UAT with synthetic records.
6. Only then prepare a separate explicitly authorized maintenance-window production cutover and rollback plan.

### Additional data precautions

The source was reconstructed from the supplied code export. The earlier reconstructed complete-source package did **not** contain all original image binaries. Restore those from your original Git repository before building/deploying. This ZIP intentionally excludes the real SQL backup, credentials, and patient records.
