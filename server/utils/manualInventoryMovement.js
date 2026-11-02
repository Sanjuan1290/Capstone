const {
  MAIN_LOCATION,
  getInventoryLocationById,
  receiveInventoryBatch,
  consumeInventoryFromLocationByBatches,
  syncInventorySnapshot,
  syncLocationSnapshot,
} = require('./inventoryBatches')
const { normalizeStockMovementType } = require('./workflowValidation')
const { writeAuditLog } = require('./audit')
const { normalizeOptionalText, normalizeNumber } = require('./inputValidation')

const { resolveManualStockOutSelection } = require('./manualInventoryPolicy')

const resolveConfiguredMovementReason = async (type, value, executor, branchId) => {
  if (!Number.isSafeInteger(Number(branchId)) || Number(branchId) < 1) throw new Error('Verified clinic branch required for movement reasons.')
  const requested = String(value || '').trim()
  try {
    const params = [type, Number(branchId)]
    let sql = `SELECT id,name,code,movement_type,requires_batch,is_system
               FROM inventory_movement_reasons
               WHERE movement_type=? AND is_active=1 AND (branch_id IS NULL OR branch_id=?)`
    if (requested) {
      sql += ' AND code=?'
      params.push(requested)
    }
    sql += ' ORDER BY is_system DESC,id ASC LIMIT 1'
    const [rows] = await executor.query(sql, params)
    if (!rows.length) {
      const error = new Error(requested
        ? 'The selected movement reason is unavailable. Refresh Inventory and choose an active reason.'
        : `No active Stock ${type === 'in' ? 'In' : 'Out'} movement reason is configured. Add one in Admin > System Setup > Movement Reasons.`)
      error.statusCode = 400
      error.code = 'MOVEMENT_REASON_UNAVAILABLE'
      throw error
    }
    return rows[0]
  } catch (error) {
    // Transitional compatibility for a database that has not run the movement-reason migration yet.
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error
    return {
      code: normalizeStockMovementType(type, requested),
      name: requested || (type === 'in' ? 'Received from Supplier' : 'Inventory Correction (-)'),
      requires_batch: type === 'out' ? 1 : 0,
      is_system: 1,
    }
  }
}
const validateInventoryQuantity = (quantity) => {
  if (!Number.isInteger(Number(quantity))) {
    throw Object.assign(new Error('Inventory quantities must be whole units.'), { statusCode: 400, code: 'INVENTORY_QUANTITY_PRECISION' })
  }
}

const applyManualInventoryMovement = async ({ branchId, inventoryId, body = {}, actorRole, actorId, ipAddress, executor }) => {
  if (!Number.isSafeInteger(Number(branchId)) || Number(branchId) <= 0) {
    throw Object.assign(new Error('A verified branch is required.'), { statusCode: 403, code: 'BRANCH_CONTEXT_REQUIRED' })
  }
  branchId = Number(branchId)
  const type = String(body.type || '').trim()
  const qty = normalizeNumber(body.qty, { field: 'Quantity', required: true, min: 0.0001, max: 9999999999 })
  if (!['in', 'out'].includes(type)) {
    const error = new Error('Choose Stock In or Stock Out and enter a quantity greater than zero.')
    error.statusCode = 400
    throw error
  }
  if (!['admin', 'staff'].includes(actorRole)) throw new Error('Unsupported inventory movement actor.')

  const [rows] = await executor.query('SELECT id, name, category, item_type, uom, base_unit, unit, supplier_id, selling_price, archived_at FROM inventory WHERE id = ? AND branch_id=? FOR UPDATE', [inventoryId, branchId])
  if (!rows.length) {
    const error = new Error('Item not found.')
    error.statusCode = 404
    throw error
  }
  const item = rows[0]
  if (item.archived_at) throw Object.assign(new Error('Archived inventory items cannot receive or issue stock.'), { statusCode: 409, code: 'INVENTORY_ARCHIVED' })
  validateInventoryQuantity(qty)
  const actorColumn = actorRole === 'admin' ? 'admin_id' : 'staff_id'
  const note = normalizeOptionalText(body.note, { field: 'Movement Note', max: 255, multiline: true }) || ''
  let auditValues

  if (type === 'in') {
    const noExpiry = body.no_expiry === true || body.no_expiry === 1 || String(body.no_expiry || '').toLowerCase() === 'true'
    if (item.item_type === 'medicine' && !String(body.expiration_date || '').trim()) {
      const error = new Error('Batch Expiry is required for medicines.')
      error.statusCode = 400
      error.code = 'INVENTORY_EXPIRY_REQUIRED'
      throw error
    }
    if (item.item_type === 'supplies' && !noExpiry && !String(body.expiration_date || '').trim()) {
      const error = new Error('Enter the Batch Expiry or select “No expiry / Not applicable”.')
      error.statusCode = 400
      error.code = 'INVENTORY_EXPIRY_REQUIRED'
      throw error
    }
    const supplierId = Number(body.supplier_id || item.supplier_id || 0)
    if (!supplierId) throw Object.assign(new Error('Select the supplier for this receipt.'), { statusCode: 400, code: 'INVENTORY_SUPPLIER_REQUIRED' })
    const [[supplier]] = await executor.query('SELECT id,name,category FROM inventory_suppliers WHERE id=? AND branch_id=? AND is_active=1 LIMIT 1', [supplierId, branchId])
    if (!supplier || !String(supplier.category || '').split(',').map(v=>v.trim()).includes(item.category)) {
      throw Object.assign(new Error('The selected supplier is not assigned to this item clinic.'), { statusCode: 400, code: 'SUPPLIER_CLINIC_MISMATCH' })
    }
    const sellingPrice = Number(item.selling_price)
    if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
      const error = new Error('Set a Selling Price greater than ₱0.00 before receiving more stock for this item.')
      error.statusCode = 400
      error.code = 'INVENTORY_SELLING_PRICE_REQUIRED'
      throw error
    }
    if (body.storage_location_id) {
      const [[location]] = await executor.query('SELECT id FROM inventory_locations WHERE id=? AND branch_id=? AND is_active=1 LIMIT 1', [body.storage_location_id, branchId])
      if (!location) throw Object.assign(new Error('Storage location not found in this branch.'), { statusCode: 404, code: 'LOCATION_NOT_FOUND' })
    }
    const movementReason = await resolveConfiguredMovementReason('in', body.movement_reason, executor, branchId)
    const movementType = movementReason.code
    const received = await receiveInventoryBatch(inventoryId, {
      quantity: qty,
      expiration_date: noExpiry ? null : body.expiration_date,
      batch_code: body.batch_code,
      supplier_lot_number: null,
      supplier_id: supplierId,
      note: note || 'Manual stock-in',
      // Acquisition cost is intentionally not tracked in the simplified inventory model.
      unit_cost: 0,
      location_id: body.storage_location_id,
    }, executor)
    // inventory.price is a legacy compatibility mirror of Selling Price.
    await executor.query('UPDATE inventory SET price=selling_price WHERE id=?', [inventoryId])
    await syncInventorySnapshot(inventoryId, executor)
    await executor.query(
      `INSERT INTO inventory_logs (inventory_id, ${actorColumn}, type, qty, note, movement_type, batch_id, to_location, branch_id)
       VALUES (?, ?, 'in', ?, ?, ?, ?, ?, ?)`,
      [inventoryId, actorId, qty, note || null, movementType, received.batch_id, received.location, branchId]
    )
    auditValues = {
      type: 'in', movement_type: movementType, quantity: qty,
      batch_id: received.batch_id, batch_code: received.batch_code || null,
      supplier_lot_number: received.supplier_lot_number || null,
      supplier_id: received.supplier_id || supplierId,
      supplier_name: supplier?.name || null,
      expiration_date: received.expiration_date || null, location: received.location,
      existing_batch: received.existing, previous_batch_quantity: received.previous_quantity,
      new_batch_quantity: received.new_quantity, note: note || null,
    }
  } else {
    const { batchId, quantity, locationId } = resolveManualStockOutSelection(body)
    const [[selectedBatch]] = await executor.query('SELECT id FROM inventory_batches WHERE id=? AND inventory_id=? AND branch_id=? AND archived_at IS NULL FOR UPDATE', [batchId, inventoryId, branchId])
    if (!selectedBatch) throw Object.assign(new Error('Batch not found in this branch.'), { statusCode: 404, code: 'BATCH_NOT_FOUND' })
    let selectedLocation = locationId ? await getInventoryLocationById(locationId, executor, branchId) : null
    if (locationId && !selectedLocation) {
      const error = new Error('The selected storage location is unavailable.')
      error.statusCode = 400
      error.code = 'LOCATION_UNAVAILABLE'
      throw error
    }

    if (!selectedLocation) {
      const [locationRows] = await executor.query(
        `SELECT il.id, il.name, ilb.quantity
         FROM inventory_location_batches ilb
         JOIN inventory_locations il ON il.id = ilb.location_id
         WHERE ilb.inventory_id = ? AND ilb.batch_id = ? AND il.branch_id=? AND ilb.quantity > 0 AND COALESCE(il.is_active,1)=1
         ORDER BY il.name, il.id`,
        [inventoryId, batchId, branchId]
      )
      if (locationRows.length === 1) selectedLocation = locationRows[0]
      else if (locationRows.length > 1) {
        const error = new Error('Select the batch location you are stocking out from.')
        error.statusCode = 400
        error.code = 'BATCH_LOCATION_REQUIRED'
        throw error
      }
    }

    const locationName = selectedLocation?.name || MAIN_LOCATION
    const consumption = await consumeInventoryFromLocationByBatches(inventoryId, [{ batch_id: batchId, quantity }], locationName, executor)
    if (!consumption.ok) {
      const error = new Error(consumption.message || 'Could not stock out the selected batch.')
      error.statusCode = 400
      error.code = 'STOCK_OUT_REJECTED'
      throw error
    }
    const batch = consumption.consumed[0]
    await syncInventorySnapshot(inventoryId, executor)
    await syncLocationSnapshot(inventoryId, executor)
    const movementReason = await resolveConfiguredMovementReason('out', body.movement_reason, executor, branchId)
    const movementType = movementReason.code
    await executor.query(
      `INSERT INTO inventory_logs (inventory_id, ${actorColumn}, type, qty, note, movement_type, batch_id, from_location, branch_id)
       VALUES (?, ?, 'out', ?, ?, ?, ?, ?, ?)`,
      [inventoryId, actorId, quantity, note || null, movementType, batch.batch_id || batch.id, batch.location || 'Main Stockroom', branchId]
    )
    auditValues = {
      type: 'out', movement_type: movementType, quantity,
      batch_id: batch.batch_id || batch.id,
      batch_code: batch.batch_code || null,
      expiration_date: batch.expiration_date || null,
      location: batch.location || locationName,
      note: note || null,
    }
  }

  await writeAuditLog({
    userId: actorId,
    userRole: actorRole,
    action: 'inventory.stock_moved',
    entityType: 'inventory_item',
    entityId: inventoryId,
    newValues: { item_name: item.name, ...auditValues },
    ipAddress: ipAddress || null,
    branchId,
  }, executor)

  return { item, movement: auditValues }
}

module.exports = { applyManualInventoryMovement }

# CARAIT — QA remediation and PayMongo Dynamic QR Ph test implementation

**Date:** October 16, 2026  
**Status:** **STAGING / NOT PRODUCTION-READY**. Source implementation and dependency-free tests only. No PayMongo credentials, public webhook, running MySQL, npm dependencies, or browser session were available in this runtime. Do not treat these tests as a live payment or completed five-role end-to-end certification.

## Delivered changes

### Correctness and branch isolation
1. Consultation-generated bills explicitly retain the source appointment's `branch_id`, including safe updates on the already-existing draft. This prevents cross-branch bills silently defaulting to Branch 1.
2. Service and inventory lookups while creating bills are restricted to the current physical branch. Foreign IDs fail instead of contaminating a bill or silently disappearing.
3. Existing clinical-material validation now passes the physical branch when checking catalog service consumables.
4. Eight inventory movement log insertion paths include explicit `branch_id`; manual stock movement audits now include branch attribution.
5. Production origin checks now include the `superadmin_token` cookie.
6. Migration checksum validation allows Windows CRLF versus LF and end-of-file newline variations, while refusing substantive SQL changes.
7. Read-only historical branch-attribution SQL report added under `server/db/reconciliation/`. **It is not an automatic repair migration**. Never execute the commented repairs without backup and manual review of each discrepancy.

### PayMongo TEST mode Dynamic QR Ph
1. After checkout bill confirmation, authorized Staff or branch Admin can generate an exact-outstanding-balance QR Ph through PayMongo Payment Intents / QR Ph Payment Methods / attach.
2. Secrets reside exclusively in `server/.env`; `server/.env.example` has `PAYMONGO_MODE=test`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_PUBLIC_KEY`, `PAYMONGO_WEBHOOK_SECRET`.
3. An active QR attempt is persisted in `payment_gateway_attempts` and prevents concurrent manual payment, duplicated QR creation, editing and reopening of the bill until reconciled.
4. The webhook `/api/webhooks/paymongo` preserves the raw JSON body, checks PayMongo HMAC `Paymongo-Signature` test `te`, enforces a five-minute timestamp tolerance, checks test mode, event amount/currency/QR source/intended branch/bill and **fetches the succeeded Payment Intent independently**.
5. Valid `payment.paid` events use the **existing** atomic billing payment/receipt/checkout dispensing service. This reuses batch/FEFO and double-deduction guards. Webhook replays and request retries must not cause duplicate receipts. QRPh cannot be manually spoofed using the normal payment endpoint.
6. Browser checkout panel appears in **Staff Checkout** and **Admin / Super Admin branch workspace Checkout**. It displays the PayMongo test QR, available simulator link, pending/paid/review status, polling, clear warning that a test QR **must not be scanned with real money**, and UI lock of manual payment while pending.
7. Provider-paid webhook settlement preserves the original human staff/admin bill confirmer rather than overwriting it with the machine actor.
8. Payments are attributed to the branch and have a unique provider payment ID, intent ID and event ID. QR payment data lives in two additive tables.

## New/changed key files

- `server/utils/billing.js`
- `server/controllers/admin.controller.js`
- `server/controllers/doctor.controller.js`
- `server/controllers/staff.controller.js`
- `server/controllers/billingCorrections.controller.js`
- `server/utils/{supplyTransfers,manualInventoryMovement,inventoryReadiness}.js`
- `server/middlewares/httpSecurity.middleware.js`
- `server/utils/paymongoClient.js` (new)
- `server/utils/paymongoWebhookSignature.js` (new)
- `server/routers/paymongoGateway.js` (new)
- `server/routers/{staff,branches}.router.js`
- `server/server.js`
- `server/scripts/{branchMigrations,verifyBranchRouteCoverage}.js`
- `server/db/migrations/2026-10-16-paymongo-test-qr.sql` (new)
- `server/db/reconciliation/2026-10-16-branch-attribution-review.sql` (new, read-only)
- `server/.env.example`
- `server/tests/gateway/` (new)
- `server/tests/checkouts/reopen-editing.node.cjs`
- `client/src/components/billing/QrPhPaymentPanel.jsx` (new)
- `client/src/services/{admin,staff}.service.js`
- `client/src/pages/{adminPage/Admin_CheckoutDetail,staffPage/Staff_CheckoutDetail}.jsx`

## Steps for setting up a PayMongo sandbox (you perform)

1. **Back up your current MySQL database**, restore a disposable test database and verify it, and keep copies of the current application source. Do not run tests against clinical production data.
2. Apply the attached **patch ZIP** to the *corresponding* current `AllCodes(9)` source tree. Prefer patching your existing repository so it retains its real images and other binary assets (the text export stores public image URLs, not the binary images).
3. In your terminal:
   ```sh
   cd server
   npm ci
   npm run migrate
   npm run verify:reports-sql
   npm run verify:deploy
   npm run test:node
   npm test
   ```
4. In `server/.env`, use **TEST** credentials from the PayMongo Dashboard (do not put them in React or chat):
   ```dotenv
   PAYMONGO_MODE=test
   PAYMONGO_SECRET_KEY=sk_test_REPLACE_ME
   PAYMONGO_PUBLIC_KEY=pk_test_REPLACE_ME
   PAYMONGO_WEBHOOK_SECRET=whsk_REPLACE_ME
   ```
   Retain all required existing DB, JWT, SMTP/SMS (if needed) and client config variables. Restart Express after changing `.env`.
5. You must expose the Express server through a publicly reachable **HTTPS** domain or temporary tunnel (e.g. Cloudflare Tunnel) and create a **test-mode** webhook in PayMongo Dashboard → Developers / Webhooks pointing to:
   `https://YOUR_HTTPS_BACKEND/api/webhooks/paymongo`
   Subscribe at least to `payment.paid`, `payment.failed`, and `qrph.expired`. Copy the exact webhook **signing secret** for that endpoint into the server `.env`. It is *not* your API secret key.
6. Run the React client, sign in as Staff or an Admin assigned to a branch; create/confirm a bill with a positive outstanding amount, open Checkout / Collect Payment, and click **Generate Test QR Ph**. You should see a QR and (when supplied by PayMongo) a simulation link. **Do not scan a TEST QR using any real bank or wallet app or transfer real funds.** Use PayMongo's test/simulation flow.
7. Watch PayMongo webhook deliveries and server logs; verified `payment.paid` should atomically create a receipt, deduct separately sold stock **once** when paid in full, update bill status, and refresh the page. Retry the same event and refresh to verify no duplicate receipt.
8. Run `cd client && npm ci && npm run lint && npm run build`, then perform five-role browser QA with a copy of your test database and test users.

## Test and release-gate results from THIS runtime

| Gate | Result | What it establishes |
|---|---|---|
| Dependency-free Node regression suite | **131/131 PASS** | Pure/source mocked tests including HMAC tamper/replay, non-QR payload, amount, intent, webhook replay, branch-scoped SQL patterns, pending QR locks and Windows migration hashes |
| Admin branch route checker | **124 known calls, 0 unmatched** | Admin client static routes only; *not* runtime authorization or Staff/Doctor/Patient coverage |
| Relative import graph | **372 source files / 958 imports PASS** | Every analyzed relative source import resolves |
| Server JavaScript syntax | **212 files PASS** | Node syntax only |
| Complete server Vitest suite | **BLOCKED** | `npm ci --offline` dependencies missing in this container |
| Client ESLint and Vite build | **BLOCKED** | Dependencies unavailable; previous report listed 22 lint errors, not revalidated here |
| Real two-branch MySQL workflow | **BLOCKED** | No local MySQL instance / integration harness from the earlier 38/38 progress report |
| Live PayMongo test environment | **BLOCKED** | No test keys, test webhook secret or public HTTPS endpoint supplied |
| Playwright real browser five-role walkthrough | **BLOCKED** | No running frontend/backend/MySQL environment here |

The earlier report's **38/38 MySQL integration tests are NOT re-runnable from `AllCodes(9).txt`**: the `clinicWorkflow.int.cjs` harness and October 16 historical repair migration described there were absent in this baseline. The added QR test files are **mock/source-level** safeguards, not substituted proof of real bank or inventory settlement.

## Critical remaining QA items before production

1. Restore or recreate the original two-branch API integration test using a **disposable** MySQL schema; exercise all five roles from creation to payment, negative cross-branch accesses, and the 35 → 32 → 30 stock reconciliation with exact batch/location logs.
2. Confirm the real PayMongo test QR API responses, status transitions, signed test webhook and simulator with your account. Verify actual server/webhook process crashes, timeouts, duplicate deliveries and delayed events.
3. Add a safe admin **Reconcile PayMongo Attempt** workflow for QR attempts stuck in `review`, provider timeouts, or missing expiry events. Currently the application intentionally blocks conflicting payments rather than auto-unlocking money that may have been charged. Do not bypass this lock manually without provider verification.
4. Handle late provider-paid webhooks after a provider-declared expiry as explicit reconciliation; a lost webhook must not silently allow a second manual payment.
5. Reconcile historical bill and inventory branch data using the read-only SQL report. Decide and review every proposed repair before an idempotent data migration. The historical repair migration mentioned in the previous AI's progress log was NOT found in this upload.
6. Extend static route verification to Staff/Doctor/Patient AND execute endpoint ownership tests. Fix frontend lint warnings/errors and full build failures rather than weakening tests.
7. Real Playwright tests: Admin & Super Admin setup, staff permissions, Doctor schedules, Patient booking, queue, consultation, actual materials consumption, cashier/QR, receipt, refund, partial payments, mobile/tablet/desktop screenshots and inaccessible controls.
8. Review refund policy, clinic-approved mandatory clinical fields, local BIR-compliant receipt text/numbering, reconciliation reports and reporting of QR Ph transaction fees. The QR gateway code is test-only by design; never drop live keys into the test configuration to collect real money.
9. Implement UX redesign after correctness is verified: consultation patient context + autosave/review checklist, inventory batch/location trace + before/after stock, checkout sticky amounts/paid/balance, clear test status and reconciliation alerts.
10. Only after all gates: implement inventory bulk import/export from the earlier plan, with safe batch stock-in, no stock overwrites, scoped spreadsheet validation, tokenized dry run and audited confirmation.

## Caution about this package

The **patch archive** is intended for your current repository. The **full reconstructed source** is provided for code review and testing but should not overwrite binary assets from your real repository. Neither ZIP includes `.env`, API keys, database contents or credentials. Only additive, non-destructive migration included. **Use staging only.**

