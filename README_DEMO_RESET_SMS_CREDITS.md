# Carait Clinic — demo-data reset + Semaphore balance

Created November 11, 2026, for preparing sample records for the Friday, November 13 thesis demonstration.

## Important: no live database was reset

This package is a **patch** for the Carait repository after the November 11 Fix 4 changes. The reset command has not been run against a clinic database. It is read-only until the operator provides all execute confirmations. Do not run the execute command if any records are real patient information or real payments. Make a separate demo database if possible.

## Changes included

1. `GET /api/admin/system-setup/sms-credits` is accessible only with the existing Super Admin route protection. It reads Semaphore's account `credit_balance` on the server, uses a 90-second cache, and limits manual refreshes to one fresh lookup every 35 seconds per server process. It does not send an SMS or expose the API key.
2. Super Admin > System Setup shows the number of credits, last checked time, Refresh Balance, and a link to the official `https://semaphore.co/` website where staff can log in and purchase credits. If the provider is down, it displays the last cached balance or a clear error.
3. `server/scripts/resetDemoData.js` prints a read-only list of table counts by default. In execute mode it removes **temporary test records** and resets recorded stock quantities to zero while retaining branches, admin/staff/doctor accounts, services and service prices, inventory item catalog, suppliers, stockrooms, System Setup, templates/policies, migration history, and barcode/receipt sequences.

### Preserved by default

- `admins`, `staff`, `doctors`, permissions, clinic branches and doctor schedules.
- `billing_service_catalog`, `billing_service_materials`, service categories, discount presets and payment configuration.
- `inventory` item names, barcodes, selling prices, thresholds and supplier; inventory locations, suppliers and measurement units.
- System Setup, doctor email/SMS preferences, clinic policies, branch addresses and the landing page.
- `schema_migrations`, barcode sequences and receipt sequences (previous numbers never reused).
- `registration_sms_limits` security counters, if present.

### Removed when executed

- Patients, consents, visits, appointments, queues, medical consultation records, prescriptions attached to removed consultations, billing records, test payments/refunds, past notifications, marketing sends, test promotions/announcements, inventory test receipts/batches/movements and pending stock usage.
- Recorded stock quantities reset to 0. Inventory items remain available for entering real demo opening quantities.
- Historical audit records from this *demo-only* database after a fresh full backup. Never do this in a real clinic database with real records.

## Install

1. Back up your repository and apply the patch to the version containing the November 11 Fix 4 updates.
2. Copy `client/` and `server/` from the ZIP into your matching repository. The ZIP contains **only changed/new files**; it is not a whole source-code backup. Or run `git apply --check carait_demo_reset_semaphore_20261111.patch`, then `git apply carait_demo_reset_semaphore_20261111.patch` on the correct baseline.
3. Check that `SEMAPHORE_API_KEY` exists in **server** environment variables. Never add it to the Vite client environment.
4. Deploy or run the app in staging and sign into Super Admin > System Setup. Verify live balance and the purchase link. The link goes to the Semaphore home/login page, not a guessed checkout deep link.

## Reset: preview first

Open PowerShell in the repository's `server` folder with its database settings configured:

```powershell
node scripts/resetDemoData.js
```

This is **read-only**. Save and review the listed row counts and the target database name. Confirm that these are only test records and that every retained service/item/account is wanted. The script checks database foreign keys and refuses unreviewed dependencies.

## Reset: execute only on a verified demo database

1. Export a complete SQL backup **from the exact target database** using the database provider's backup/export tool. Test that the backup can be read or restored. Store it outside the repository.
2. Prefer a separate TiDB/MySQL demo database, pointed to by `DB_NAME`, with the current migrations already applied.
3. Confirm that **all** patients, consultations and payments on the target are test data. If any are real, **do not execute**. Selectively clean test records instead.
4. Review the dry-run counts and back up all user-created sample settings if needed.
5. Only then run the guarded command, replacing the database name and backup path with the exact reviewed values:

```powershell
$env:CARAIT_ALLOW_DEMO_RESET = 'YES'
node scripts/resetDemoData.js --execute --database=YOUR_DEMO_DATABASE --confirm=ERASE_DEMO_RECORDS_FROM_YOUR_DEMO_DATABASE --reviewed-all-patient-data --backup='D:\Backups\your_fresh_verified_backup.sql'
Remove-Item Env:CARAIT_ALLOW_DEMO_RESET
```

If `NODE_ENV=production`, the script also refuses execution unless `CARAIT_ALLOW_PRODUCTION_RESET=YES`; that override is intentionally **not recommended**. Do not run the reset on the real clinic's production database.

## After resetting

- Verify that Super Admin can sign in and assigned branch settings still display.
- Add controlled fictional sample patients, bookings, consultations and payments for your thesis demo.
- Enter stock through normal Receive Stock/import workflows. The available stock should initially be zero.
- Create new promotions/announcements only if you want them shown in the demo.
- Check stock, billing, payment receipts, email/SMS, queue and patient history using only test data.

## Verification done in this environment

- Four focused Node tests passed: rate-limited Semaphore credit fetch, protected route/credit UI controls, reset table allowlist, FK deletion ordering.
- Backend `node --check` passed on all four changed/new `.js` files.
- Super Admin React JSX parsed successfully with the TypeScript parser.
- Confirmed reset allowlist against the supplied 81-table November backup and accounted for the later `clinical_inventory_reservations` table.
- Git patch passes `git diff --check`.

Not performed: a live database reset, live Semaphore account lookup, production build, or end-to-end tests against a real TiDB server.
