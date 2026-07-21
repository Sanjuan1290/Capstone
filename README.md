# Carait Clinic Management System

Full-stack clinic management project restored from the supplied code export and updated for billing, inventory, reporting, responsive layouts, dark mode, notifications, pagination, and server tests.

## Main fixes in this version

- Rebuilt the broken Admin Billing Catalog around React Query mutations.
- Added visible loading, saving, deleting, validation, empty, error, and success states.
- Added bottom-right toast notifications with automatic fade and progress timing.
- Added shared modal, confirmation, form-field, page-state, and pagination components.
- Reworked dark mode with semantic page, surface, border, text, modal, input, table, and status colours.
- Centred the patient, admin, staff, and doctor work areas with a shared maximum content width.
- Added pagination to the main operational lists, including billing, catalog, staff, doctors, booking reasons, patients, appointments, history, inventory, audit logs, queues, and supply requests.
- Repaired bill-item editing and replaced the two-request payment flow with one atomic server transaction.
- Added payment history, receipt numbers, payment references, amount received, change calculation, stock rollback, audit logging, and billing row locking.
- Added Admin payment setup for GCash, Maya, and bank details.
- Added custom report start/end dates, presets, billing metrics, payment-method totals, service revenue, and A4 print/save-as-PDF output.
- Improved the inventory barcode scanner for phones with camera selection, rear-camera preference, torch support, image upload, manual entry, retry messages, and duplicate-scan protection.
- Added a server test folder with feature-level test files and a working `npm test` command.
- Disabled demo seed insertion unless `SEED_DEMO_DATA=true`.

## Project structure

```text
carait-clinic-fixed/
├── client/                    React + Vite + Tailwind
├── server/                    Express + MySQL
├── Dump20260721.sql           supplied current database dump
├── currentSQLDB.sql           same current dump for compatibility
└── README.md
```

## Requirements

- Node.js 20 or newer
- npm
- MySQL 8
- A modern browser
- HTTPS when testing the phone camera from another device

## Database setup

1. Create a MySQL database.
2. Import `Dump20260721.sql`.
3. The server runs `ensureAppSchema()` on startup and creates missing support tables.
4. For a manual upgrade, run:

```text
server/db/migrations/2026-07-21-billing-hardening.sql
```

The migration adds:

- `billing_payments`
- `clinic_payment_settings`
- `audit_logs`

## Server setup

```bash
cd server
npm install
```

Copy the environment template:

```bash
copy .env.example .env
```

On macOS or Linux:

```bash
cp .env.example .env
```

Fill in:

```env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_USER=root
DB_PASS=your_mysql_password
DB_NAME=your_database_name
JWT_SECRET=replace_with_a_long_random_secret
CLIENT_URL=http://localhost:5173
SEED_DEMO_DATA=false
```

Start the API:

```bash
npm run dev
```

## Client setup

Open another terminal:

```bash
cd client
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

## Tests

From the `server` folder:

```bash
npm test
```

Other commands:

```bash
npm run test:watch
npm run test:coverage
```

The included tests cover:

- Authentication tokens
- Appointment rules
- Patient phone and profile rules
- Doctor date validation
- Billing catalog calculations
- Bill-item totals and inventory usage
- Payment methods, receipts, received amounts, and change
- Inventory expiry handling
- Report ranges
- Queue statuses
- Supply-request resolution
- Payment-setting URL validation
- API health endpoint

## Production build

```bash
cd client
npm run build
```

The built client is written to `client/dist`.

## Phone barcode scanning

A phone browser normally needs a secure context for camera access.

For phone testing:

- Serve the client over HTTPS.
- Allow camera permission.
- Select the rear camera when multiple cameras are listed.
- Use manual entry or image upload when the camera cannot start.

Opening a plain `http://192.168.x.x:5173` address on a phone may prevent camera access. Use an HTTPS local tunnel or a deployed HTTPS test site.

## Billing payment flow

The staff payment action now performs these operations in one database transaction:

1. Locks the billing record.
2. Rechecks that it is unpaid.
3. Normalizes and saves the bill items.
4. Recalculates subtotal, discount, and total.
5. Checks inventory requirements.
6. Deducts stock using FEFO.
7. Writes inventory logs.
8. Creates a payment record and receipt number.
9. Marks the bill paid.
10. Writes an audit entry.
11. Commits all changes together.

Any failure rolls the transaction back.

## Payment QR setup

Open the Admin Billing Catalog and select **Payment Setup**. Add HTTPS image URLs or app-relative paths for GCash and Maya QR images, plus the bank account details. The Staff Billing payment panel reads these settings from the server.

## Reports and PDF

Reports accept a real start and end date. Presets only fill those dates. The **Print / Save PDF** action opens a clean A4 print frame. In the browser print dialog, select **Save as PDF**.

## Asset note

The supplied flattened source export contained URL strings in place of the original PNG bytes. Valid local clinic-branded replacement images are included so the project builds and renders without corrupt files. Replace them with the clinic's final approved photos and logo when available.

## Validation completed

- Client production build: passed
- Server syntax checks: passed
- Server tests: 13 test files, 22 tests passed

A live MySQL end-to-end test still requires your local database credentials and imported dump.
