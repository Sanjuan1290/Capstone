# Simplified Tax Settings

Date: 14 November 2026. Starting commit: `d2e8faf`.

The System Setup page now has exactly two editable fields: **Tax Name** and **Tax Percentage**. The navigation label is **Tax Settings**. The enable switch, treatment selector, charge classifications, eligibility controls, discount categories and discount-preset creation form were removed from this page.

As confirmed by the user, tax is **included in existing prices**. A percentage of 0 means no tax. New bills use the branch's saved name/percentage without requiring service or item classifications. Existing saved bill policies/calculations retain their original treatment and amounts.

## Database

There are no separate tax-treatment/classification columns to drop in the existing schema: these controls were keys inside `branch_billing_settings.policy_json`.

New migration: `server/db/migrations/2026-11-14-simplify-tax-settings.sql`.

- Reduces the current settings JSON to `tax_name` and `tax_percentage`.
- Converts previously disabled configurations to 0%, avoiding accidental activation.
- Retains `branch_id`, version and audit metadata for branch separation, concurrent-edit protection and auditability.
- Preserves existing Senior/PWD preset identities by moving that metadata into `discount_presets.statutory_category`. This is discount metadata, not an additional tax setting or patient charge. Discount values and approval requirements are unchanged.
- Does not delete/recalculate any bill, payment, receipt, financial snapshot or migration history.
- The runner validates existing data, skips the compatible existing category column, rejects incompatible column definitions, and safely resumes after interruption.

No production migration was executed. Apply through the normal guarded runner on staging before deploying matching server/client code:

```powershell
cd server
npm.cmd run migrate
npm.cmd run verify:deploy
```

Do not rerun or modify the older registered SQL files. Their history is unchanged. The new migration uses JSON functions documented by [TiDB](https://docs.pingcap.com/tidb/stable/json-functions/).

Read-only checks after migration:

```sql
SELECT branch_id, policy_json, version FROM branch_billing_settings;
-- Each policy_json contains only tax_name and tax_percentage.

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME='discount_presets' AND COLUMN_NAME='statutory_category';
-- varchar(12), NOT NULL, default other.

SELECT filename, content_sha256, applied_at FROM schema_migrations
WHERE filename='2026-11-14-simplify-tax-settings.sql';
```

## Files

- Frontend: `client/src/components/system/BillingTaxSettings.jsx`, `SystemSetupTabs.jsx`.
- Backend: `server/routers/branchBillingSettings.js`, `server/utils/billingTaxPolicy.js`, `billingCalculation.js`.
- Migration/deployment: new SQL migration, `server/scripts/branchMigrations.js`, `verifyDeployment.js`.
- Tests: `taxPolicy20261114.node.cjs`, `branchBillingSettings20261114.node.cjs`, `financialSnapshots20261114.node.cjs`, `migrationRunner.node.cjs`, `client/tests/browser/nineBatches20261114.spec.mjs`.

## Actual checks

| Check | Result |
|---|---|
| Tax API/calculation/snapshot/migration tests | **59 passed, 0 failed** |
| Browser tests: Admin/Super Admin/Staff settings, saved financial history, partial cash payments and allocation permissions | **12 passed, 0 failed** |
| Frontend production build | Passed |
| Mandatory prebuild tests | 25 passed |
| Backend syntax/startup smoke checks | Passed: 441 modules |
| ESLint | 0 errors; 23 existing warnings |
| Full frontend Node suite | 428 passed, 32 existing failures |
| Full backend Node suite | 915 passed, 72 existing failures |
| Full backend Vitest suite | 252 passed, 7 existing failures |

All 111 full-suite failures match the previously recorded failures; no new failures appeared in these runs. They remain documented in the earlier `QA_REPORT/nine-batches-2026-11-14/REGRESSION_FAILURES.md`. This change does not claim to resolve those existing failures.

`tax-settings.png` shows the corrected two-field page. `browser-results.json`, `backend-vitest.json`, `regression-comparison.json` and raw logs contain the evidence. Browser APIs and database/provider boundaries are mocked; the migration guards were simulated rather than executed on live TiDB.

This report supersedes the earlier nine-batch report's expanded Tax & Discount Configuration UI/storage description. Its other features and historical test results remain applicable.
