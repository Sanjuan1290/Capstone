# CARAIT MEDICAL AND DERMATOLOGY CLINIC — Corrected Clinic Management System

This repository is the corrected full-stack clinic management codebase reconstructed from the supplied source export and upgraded around one connected clinic workflow:

**Appointment / Walk-in → Check-in / Queue → Consultation → Actual per-batch inventory use → Draft Bill → Staff Review & Finalize → Payment / Receipt → Admin Reporting & Audit**

## Main improvements

### UI / UX
- Removed the global 90% font shrink and normalized readable typography.
- Fixed the public header so **CARAIT MEDICAL AND DERMATOLOGY CLINIC** can remain on one line on normal desktop widths.
- Standardized centered page shells and improved patient-name hierarchy.
- Removed patient-facing appointment ID labels.
- Grouped Admin and Staff navigation by workflow.
- Added numeric Pending appointment badges to navigation.

### Doctor workflow
- Doctor Dashboard shows today plus upcoming patients with date/time/reason.
- Consultation now records **Services Performed** and **Actual Consumables Used**.
- Doctors do not edit financial pricing in the consultation workflow.
- Prescription print uses clinic settings and the logged-in doctor's PRC license instead of a hard-coded license.
- Removed the printed appointment ID and hard-coded prescription-validity statement.

### Billing
- Added a real Admin **Billing** oversight page separate from **Service Catalog**.
- Billing lifecycle supports `draft`, `ready`, `partially_paid`, `paid`, `voided`, and refund data.
- Doctor completion creates/updates the Draft Bill from performed services.
- Staff reviews a draft, finalizes charges, then records payment separately.
- Payment no longer deducts clinical inventory.
- Partial/split payment architecture is supported by multiple payment records and remaining-balance calculation.
- Added structured discount presets, price snapshots, receipts, void/refund foundations, reconciliation, and audit events.
- Historical billing items preserve the price used at the time of the bill.

### Service Catalog
The Add/Edit Service modal is now a guided workflow:

1. **Details**
2. **Default Consumables**
3. **Pricing**
4. **Review**

Changes include:
- **Required Materials** → **Default Consumables**.
- **Profit %** → **Markup %** in the UI.
- Material name/unit are derived from Inventory when an inventory item is selected.
- Explicit **Patient Price** is separated from internal material/service cost and suggested price, and is the primary price displayed in the Service Catalog/Staff billing selection.
- Default consumable quantity can use the item's dispensing/base unit.

### Inventory — per batch / lot
Inventory is now designed around an **item + batch + location** model.

Example:

```text
Amoxicillin 500 mg
├─ Batch AMX-260801 · Exp Aug 2027 · Main Stockroom: 8 boxes
└─ Batch AMX-260815 · Exp Nov 2027 · Main Stockroom: 14 boxes
```

Implemented:
- Each Stock In creates its own batch record.
- Optional supplier Batch/Lot Number and expiry date.
- Batch balances are preserved by location.
- FEFO consumes the usable batch with the nearest expiry first.
- Automatic FEFO excludes already-expired batches.
- Expired/damaged/wastage/supplier-return stock-outs require exact batch selection.
- Manual stock-out records the exact batch/lot that moved.
- Clinical use stores the exact source batch and room.
- Dispensed Billing stock stores the exact source batch.
- Stock transfers preserve the same physical batch rather than reducing clinic-wide quantity.
- An inventory item with remaining batch stock cannot be deleted.

Default inventory locations:
- Main Stockroom
- General Medicine Room
- Dermatology Room
- Dispensing Area

### Stock Transfers
Doctor/Admin/Staff Supply Request language has been revised toward **Stock Transfers**.

Approval now transfers stock **per batch using FEFO** from Main Stockroom to the destination treatment room. A transfer does not count as clinical consumption. Actual clinic quantity drops only when that stock is subsequently used/dispensed/wasted/etc.

### Walk-in workflow
**Register Walk-in Patient** is replaced by an **Add Walk-in Visit** workflow.

- Existing-patient-first search.
- Duplicate selected-patient card removed.
- Quick new-patient registration supports name, Philippine mobile, birthdate, sex, optional email, and consent method.
- Required visit reason.
- Doctor availability / First Available support.
- Duplicate active queue protection.
- Same-day online appointments can be checked in and reused instead of cancelled/recreated.
- Future appointments remain scheduled when today's separate walk-in is created.
- Explicit separate-walk-in action remains possible.
- A dedicated **Review Walk-in Visit** step confirms patient, clinic, doctor/queue, and reason before a new/separate walk-in is added.
- Walk-in appointments are marked with `appointment_source = 'walk_in'`.
- Per-doctor/day queue numbering is protected by a database unique key and server lock.
- Queue success state shows the assigned doctor and queue position.

### Reports / Print PDF
Admin Reports now separates:

**Selected Period**
- Gross billed
- Discounts
- Net billed
- Collections
- Refunds
- Net collections
- Appointment/source/status activity
- Doctor workload/completion
- Revenue trend
- Inventory movement by reason

**Current Snapshot**
- Outstanding balance now
- Current inventory value
- Out of stock
- Low stock
- Expired batches
- Batches expiring within 30 days
- Current queue/upcoming workload

Other corrections:
- Doctor completion rate = completed appointments / appointments.
- Expired batches are no longer counted as merely “expiring soon”.
- Removed the old double-counted demand-load concept.
- Top services are labelled by **Gross Billed Amount**.
- Print / Save PDF uses an isolated A4 report with clinic settings, report range, generated timestamp, repeated table headers, and `afterprint` cleanup.

### Audit Logs
- Inventory's old “Audit Log” section is correctly named **Inventory Activity**.
- Added a standalone Admin **Audit Logs** page backed by `audit_logs`.
- Supports search, date, role/module filters, pagination, and before/after detail.
- Audit helper masks common secret/token/password/bank-account fields.
- Important billing, inventory, walk-in, stock-transfer, consultation, catalog, and settings actions write audit entries.

### Clinic Settings
Added one Admin **Clinic Settings** source for:
- Clinic name
- Address
- Phone
- Email
- Report footer
- Receipt footer

Reports and prescription print use this centralized configuration.

---

## Database

### Simplest fresh setup
Import:

```text
currentSQLDB_CORRECTED.sql
```

This contains the supplied database dump followed by the 2026-08-26 workflow upgrade migration.

### Existing database
Apply only:

```text
server/db/migrations/2026-08-26-clinic-workflow-upgrade.sql
```

The server's `ensureAppSchema()` also contains compatibility guards for the added runtime schema.

Important new structures include:
- `clinic_settings`
- `discount_presets`
- `inventory_locations`
- `inventory_location_batches`
- `inventory_location_stock`
- `consultation_inventory_usage`
- `consultation_inventory_usage_batches`
- `billing_item_batch_usage`
- `inventory_transfers`
- `inventory_transfer_batches`
- `cashier_closings`
- expanded `audit_logs` usage

---

## Run locally

### Server

```bash
cd server
cp .env.example .env
npm ci
npm test
npm run dev
```

### Client

```bash
cd client
npm ci
npm run dev
```

Production client verification:

```bash
npm run build
```

---

## Final deployment-readiness fixes (2026-08-31)

This package also includes the final pre-deployment corrections from the code/database audit:

- Fixed the two missing Staff billing-adjustment controller exports that prevented Express from loading the full router.
- Standardized clinic branding on `client/public/logo.png` across auth screens, Admin/Staff/Doctor/Patient layouts, queue display, public layout fallback, and favicon.
- Preserved the Landing Page CMS logo override while changing its default/current database value to `/logo.png`.
- Fixed the shared pagination hook/component contract so Next/Previous and page-size controls work on screens that spread the hook result into `<Pagination />`.
- Enforced cashier shift locking: new payments cannot be recorded after a shift is closed, and admin void/refund operations require the related cashier shift to be reopened first.
- Serialized payment/closing operations with a Staff row lock to prevent close/payment race conditions.
- Stores payment timestamps using clinic-local wall-clock time for consistent daily reconciliation.
- Fixed public queue open/closed calculation so it uses the configured clinic date instead of the server host timezone.
- Removed the unused broken Doctor service `/api/doctors` call.
- Added production runtime configuration validation and a dependency-aware `/api/ready` endpoint.
- Added `npm run verify:deploy` for non-mutating environment/database readiness checks.
- Added MySQL-compatible final migration files plus `wholedatabase.sql` and `upgrade_current_database.sql`.
- Added additional runtime configuration/timezone regression tests.

## Database deployment

### Fresh database

Import the root-level file:

```sql
wholedatabase.sql
```

It contains the supplied database/data plus the final schema upgrade and new logo value.

### Existing supplied database

**Back up the database first.** Then either run:

```sql
upgrade_current_database.sql
```

or run the application's idempotent schema migrator:

```bash
cd server
npm run migrate
```

`upgrade_current_database.sql` is tailored to the exact database dump supplied with this package and also updates the current Landing Page logo. `npm run migrate` is preferable when the database may already be partially upgraded.

After migration:

```bash
npm run verify:deploy
npm test
```

## Production verification sequence

Server:

```bash
cd server
npm ci
copy .env.example .env   # Windows; use cp on macOS/Linux
npm run migrate
npm run verify:deploy
npm test
npm start
```

Client:

```bash
cd client
npm ci
copy .env.example .env   # Windows; use cp on macOS/Linux
npm run lint
npm run build
```

Production should use HTTPS. The frontend calls `/api/...` using same-origin URLs, so route `/api/*` to the Node server and configure your web server with SPA fallback to `client/dist/index.html` for browser routes. Set `CLIENT_URL` to the real production origin and keep `RUN_SCHEMA_MIGRATIONS_ON_STARTUP=false` after deployment migration is complete.

Liveness/readiness endpoints:

```text
GET /api/health   -> Node process is running
GET /api/ready    -> Node process can reach MySQL
```

## Validation performed in this delivery environment

Completed successfully after the fixes:

- **82** Server `.js`/`.mjs` files passed `node --check`.
- **98** Client `.js`/`.jsx` files passed a JSX syntax parse using the installed TypeScript parser.
- Local relative import resolution passed (the only apparent exception is a commented example inside `queue.router.js`, not a runtime import).
- Local ES named-import/export contract check passed with **0** missing exports.
- Local CommonJS destructured-import/export contract check passed with **0** missing exports.
- Router controller-object contract check passed with **0** undefined controller handlers.
- Dangerous-code scan found no active `eval`, `new Function`, `dangerouslySetInnerHTML`, direct `.innerHTML =`, or request-property SQL interpolation patterns.
- `wholedatabase.sql` was statically compared against the current `schema.js`: all expected tables/columns are represented.
- JSON package files parse successfully.

Not executable in this container:

- `npm test` and `npm run build` require project dependencies. The uploaded source did not include `node_modules`, and this execution environment cannot access the npm registry. Run the commands above locally before deployment.
- A real MySQL import/migration was not executed here because no MySQL server is available in this environment and modifying your live database without a backup would be unsafe.
- Real email, SMS, Cloudinary, HTTPS/reverse-proxy, and browser end-to-end flows still require your deployment credentials/environment.

The package now declares **25 backend test files**. Three additional regression assertions were added on top of the test suite you supplied (runtime configuration and clinic-date behavior).

## Original media assets

The flattened code export supplied the original clinic photos/service PNGs as GitHub source URLs rather than their image bytes. The exact **new clinic logo you uploaded is included at `client/public/logo.png`**. For the other public media, this ZIP contains valid placeholders so paths remain intact, plus two restoration helpers:

```text
restore-media-assets.ps1   # Windows PowerShell
restore-media-assets.sh    # macOS/Linux
```

Run the appropriate helper on a network-enabled machine to restore the exact original public images before final production deployment, or copy those images from your existing local CAPSTONE project. The restoration scripts intentionally do not replace the new `client/public/logo.png`.
