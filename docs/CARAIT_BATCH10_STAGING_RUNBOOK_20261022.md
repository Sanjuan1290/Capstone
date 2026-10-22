# CARAIT — Batch 10 Staging Execution Runbook

**Use only against an approved staging clone with synthetic accounts/patients. Never reset or migrate the production TiDB database for QA.**

## 1. Source & artifact checks

- Record `git rev-parse HEAD`, Render deployed commit and Cloudflare Pages deployment ID, and compare with the October 22 Batches 1–9 patch baseline.
- On a **clean review branch**, check the Batch 10 correction patch: `git apply --check CARAIT_BATCH10_QA_CORRECTIONS_20261022.patch`; review `git diff --check` after application. If source differs, reconcile manually instead of force-applying.
- Preserve binary clinic assets, deployment secrets, and genuine Git history. The QA reconstruction is **not** a distributable full repository.

## 2. Verify builds and tests in CI

```sh
cd client
npm ci
npm run lint
npm run build
node --test tests/*.node.test.mjs

cd ../server
npm ci
npm run verify:source
npm run test:node
npm test
npm run verify:reports-sql
```

Two integration tests require `express` and `mysql2/promise` and must be rerun; do not turn them into silent skips. Source-only tests do not replace authenticated browser tests.

## 3. TiDB staging

1. Record a tested, access-controlled backup and restore into an isolated database. Disable outbound patient notifications and live payment actions in the staging environment.
2. Query `information_schema.COLUMNS` to confirm promotion `image_url`, `image_asset_id`, and `featured_order`, plus admin `must_change_password` and `password_changed_at` columns. Review all pending migrations.
3. Compare historical migration SQL hashes to the `schema_migrations` ledger before applying anything. Do not change prior migration text/checksums.
4. Run only reviewed schema reconciler migrations in staging, then rerun full application smoke tests. **Do not run optional manual ADD COLUMN migrations unconditionally**.
5. Exercise Blank/Standard/Copy branch setups and confirm record isolation; compare row counts/foreign keys and verify cloned consumable-linked services remain ineligible until configured.

## 4. End-to-end accounts and sessions

Use five role-specific synthetic accounts (Super Admin, Branch Admin, Staff, Doctor, Patient), two active branches, and two parallel browser sessions. Record exact URLs, HTTP codes, API response shapes, screenshots and Render/TiDB logs for each test. Include patient registration/login, booking readiness, 12-hour minimum notice, doctor schedule conflict, appointment confirmation, check-in, consultation draft/finalization, stock deduction, bill, PayMongo **TEST** payment, receipt and Daily Cash Reconciliation.

## 5. Providers, live updates, mobile

- Test Cloudinary + moderation states (pending, passed, rejected) with test uploads; verify approval tokens cannot be replayed across branches.
- Open connected browser sessions on Branch A and B; verify SSE updates are scoped, reconnect after Render restart, and preserve unsaved forms. Patient promotions/schedule can be eventual (poll/on-focus), not necessarily push.
- Test real Android Chrome and iPhone Safari rear-camera scanning; flashlight/zoom only where supported, barcode formats, close/reopen cleanup, manual entry, image fallback, keyboard and modal size.
- PayMongo remains **TEST**. Confirm a repeated webhook cannot create duplicate receipts or inventory deductions. Never infer payment state from SSE alone.

## 6. Release decision

Zero unresolved P0/P1 defects; build and supported CI suites pass; branch isolation verified; provider/device UAT signed off; data backup verified and rollback tested; matching backend/frontend commits approved. **Until then: BLOCKED — NO PRODUCTION DEPLOYMENT.**
