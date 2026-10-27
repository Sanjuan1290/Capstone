# CARAIT Clinic — latest source export, October 27, 2026

**Source:** `AllCodes(20261027-104711).txt`. This codebase is reconstructed from the user's latest flattened source export. A one-line `client/public/_routes.json` was recovered from the same export. The five historical registered migration files have only their export-added trailing blank lines normalized back to the exact SHA-256 hashes pinned in the source test. No SQL statements, application behavior, or business logic were changed.

## Important limitations
- The source export contains GitHub source links, not the actual binary bytes, for 13 PNG files. The missing image binaries are listed in `_DELIVERY/Image_Assets_Required.json`. When using your original Git checkout, KEEP its real image files. Use `node scripts/fetch-public-assets.mjs` to retrieve 11 public files where Internet is available, and retrieve the 2 remaining `client/src/assets` images from the original repository.
- This ZIP does not include node_modules, `.env` credentials, the raw patient database backup, or a `.git` history.
- Do **not** replace a newer live Git checkout without reviewing its differences. Use this package as a source reference or selectively merge verified changes.

## Verification on Windows
```powershell
cd server
npm ci
npm run verify:source
npm test
npm run test:node
npm run diagnose:consultation
npm run verify:deploy
```

`diagnose:consultation` and `verify:deploy` query the database configured in your local environment (read-only). These do not apply migration DDL. To apply a pending schema migration, first take a verified backup, use a staging clone and run `npm run migrate` with *staging credentials*.

**Batch 4 pending schema:** `server/db/migrations/2026-10-26-batch4-selected-promotion.sql` (the existing canonical migration). The server already registers it via `server/scripts/branchMigrations.js` and guards interrupted runs with `server/scripts/promotionMigration.js`.
