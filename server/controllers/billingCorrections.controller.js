// Billing corrections, stock returns and cashier closing (2026-10-04).
//
// Bill lifecycle additions
//   ready / partially_paid / paid  --reopen-->  draft   (admin, only when no money is held)
//   any non-voided bill            --void---->  voided  (admin, only when no money is held)
// "No money is held" means every payment on the bill was voided or fully refunded first
// (those actions already require the admin's email verification code).
//
// Stock rule: Checkout medicines dispensed at full payment are put back into the exact
// batch and location they came from when a bill is voided or reopened, so a re-payment
// never deducts twice. Consultation consumables were physically used, so they are only
// returned when an admin explicitly returns an unused quantity.
const db = require('../db/connect')
const { writeAuditLog } = require('../utils/audit')
const { broadcast } = require('../utils/sse')
const { getBillingRecordWithItems } = require('../utils/billing')
const { getTodayDateOnly } = require('../utils/date')
const { normalizeText, normalizeOptionalText } = require('../utils/inputValidation')
const { returnQuantityToBatch, moveBatchBetweenLocations } = require('../utils/inventoryBatches')
const { resolveMainStockroom } = require('../utils/inventoryLocations')

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100
const isAdmin = (req) => req.user?.role === 'admin'
const actorRoleOf = (req) => (isAdmin(req) ? 'admin' : 'staff')

const sendError = (res, error) => res.status(error.statusCode || 500).json({
  message: error.message || 'Request failed.',
  code: error.code || undefined,
  ...(error.available !== undefined ? { available: error.available } : {}),
})

const httpError = (statusCode, message, code) => Object.assign(new Error(message), { statusCode, code })

const parseWholeQuantity = (value, field = 'Quantity') => {
  const qty = Number(value)
  if (!Number.isFinite(qty) || qty <= 0) throw httpError(400, `${field} must be greater than zero.`, 'INVALID_QUANTITY')
  if (Math.abs(qty - Math.round(qty)) > 0.0000001) throw httpError(400, `${field} must be a whole number.`, 'WHOLE_UNIT_QUANTITY_REQUIRED')
  return Math.round(qty)
}

// ── Stock usage attached to a bill ───────────────────────────────────────────

const loadBillStockUsage = async (billingId, executor = db) => {
  const [consultation] = await executor.query(
    `SELECT ciub.id AS usage_batch_id, ciu.id AS usage_id, ciu.consultation_id, ciu.inventory_id,
            i.name AS item_name, COALESCE(i.uom, i.base_unit, i.unit, 'unit') AS unit,
            ciub.batch_id, ib.batch_code, ib.expiration_date,
            ciub.package_quantity AS used_quantity, COALESCE(ciub.returned_quantity,0) AS returned_quantity,
            ciub.source_location, ciub.source_location_id, ciub.recorded_at, ciub.last_returned_at
     FROM consultation_inventory_usage ciu
     JOIN consultation_inventory_usage_batches ciub ON ciub.consultation_usage_id = ciu.id
     JOIN inventory i ON i.id = ciu.inventory_id
     LEFT JOIN inventory_batches ib ON ib.id = ciub.batch_id
     WHERE ciu.billing_id = ?
     ORDER BY i.name, ciub.id`,
    [billingId]
  )
  const [checkout] = await executor.query(
    `SELECT u.id AS usage_id, u.billing_item_id, u.inventory_id, i.name AS item_name,
            COALESCE(i.uom, i.base_unit, i.unit, 'unit') AS unit,
            u.batch_id, ib.batch_code, ib.expiration_date, u.package_quantity AS quantity,
            u.movement_type, u.source_location, u.source_location_id, u.recorded_at,
            u.returned_at, u.return_reason
     FROM billing_item_batch_usage u
     JOIN inventory i ON i.id = u.inventory_id
     LEFT JOIN inventory_batches ib ON ib.id = u.batch_id
     WHERE u.billing_id = ?
     ORDER BY u.id`,
    [billingId]
  )
  return {
    consultation: consultation.map((row) => ({
      ...row,
      used_quantity: Number(row.used_quantity || 0),
      returned_quantity: Number(row.returned_quantity || 0),
      returnable_quantity: Math.max(0, Number(row.used_quantity || 0) - Number(row.returned_quantity || 0)),
    })),
    checkout: checkout.map((row) => ({ ...row, quantity: Number(row.quantity || 0), returned: Boolean(row.returned_at) })),
  }
}

const getBillStockUsage = async (req, res) => {
  const billingId = Number(req.params.id)
  if (!billingId) return res.status(400).json({ message: 'A valid billing record is required.' })
  const [[bill]] = await db.query('SELECT id FROM billing_records WHERE id = ? LIMIT 1', [billingId])
  if (!bill) return res.status(404).json({ message: 'Billing record not found.' })
  res.json(await loadBillStockUsage(billingId))
}

// Puts every not-yet-returned Checkout dispense back into its original batch/location.
const reverseCheckoutDispensing = async ({ billingId, adminId, reason, executor }) => {
  const [rows] = await executor.query(
    `SELECT id, billing_item_id, inventory_id, batch_id, package_quantity, source_location_id, source_location
     FROM billing_item_batch_usage
     WHERE billing_id = ? AND movement_type = 'dispensed' AND returned_at IS NULL
     FOR UPDATE`,
    [billingId]
  )
  const returned = []
  for (const row of rows) {
    const qty = Number(row.package_quantity || 0)
    if (qty <= 0) continue
    const result = await returnQuantityToBatch(row.inventory_id, row.batch_id, row.source_location_id, qty, executor)
    await executor.query(
      `UPDATE billing_item_batch_usage
       SET movement_type = 'dispense_returned', returned_at = NOW(), returned_by_admin_id = ?, return_reason = ?
       WHERE id = ?`,
      [adminId || null, String(reason || '').slice(0, 255) || null, row.id]
    )
    await executor.query(
      `INSERT INTO inventory_logs (inventory_id, admin_id, type, qty, note, movement_type, reference_type, reference_id, batch_id, to_location)
       VALUES (?, ?, 'in', ?, ?, 'dispense_return', 'billing_record', ?, ?, ?)`,
      [row.inventory_id, adminId || null, qty, `${result.batch_code || `Batch #${row.batch_id}`} returned from billing record ${billingId}: ${reason}`, billingId, row.batch_id, result.location]
    )
    returned.push({ usage_id: row.id, inventory_id: row.inventory_id, batch_id: row.batch_id, quantity: qty, location: result.location })
  }
  return returned
}

const assertNoMoneyHeld = (bill) => {
  const held = roundMoney(bill.paid_amount)
  if (held > 0.004) {
    throw httpError(409, `This bill still holds ₱${held.toFixed(2)} in payments. Void or refund those payments first, then try again.`, 'BILL_HAS_ACTIVE_PAYMENTS')
  }
}

const voidBill = async (req, res) => {
  const billingId = Number(req.params.id)
  let reason
  try { reason = normalizeText(req.body?.reason, { field: 'Void reason', required: true, max: 500, multiline: true }) }
  catch (error) { return sendError(res, error) }
  if (String(reason).length < 5) return res.status(400).json({ message: 'Void reason must be at least 5 characters.' })

  const conn = await db.getConnection()
  let returned = []
  try {
    await conn.beginTransaction()
    const [[locked]] = await conn.query('SELECT * FROM billing_records WHERE id = ? FOR UPDATE', [billingId])
    if (!locked) throw httpError(404, 'Billing record not found.')
    if (locked.status === 'voided') throw httpError(409, 'This bill is already voided.', 'BILL_ALREADY_VOIDED')
    const bill = await getBillingRecordWithItems(billingId, conn)
    assertNoMoneyHeld(bill)

    // return_stock=false is for waived bills where the patient keeps the medicine:
    // dispensed stock then stays deducted (written off) and only the charge is voided.
    const returnStock = req.body?.return_stock !== false && req.body?.return_stock !== 'false'
    returned = returnStock
      ? await reverseCheckoutDispensing({ billingId, adminId: req.user.id, reason: `Bill voided: ${reason}`, executor: conn })
      : []
    await conn.query(
      `UPDATE billing_records
       SET status = 'voided', voided_at = NOW(), void_reason = ?, voided_by_admin_id = ?, version = version + 1
       WHERE id = ?`,
      [reason, req.user.id, billingId]
    )
    await conn.query(
      "UPDATE billing_adjustment_requests SET status='expired', resolved_at=NOW(), admin_note=COALESCE(admin_note,'Bill was voided.') WHERE billing_id=? AND status='pending'",
      [billingId]
    )
    await writeAuditLog({
      userId: req.user.id, userRole: 'admin', action: 'billing.bill_voided', entityType: 'billing_record', entityId: billingId,
      oldValues: { status: locked.status, total_amount: locked.total_amount, version: locked.version },
      newValues: { status: 'voided', reason, checkout_stock_returned: returned },
      ipAddress: req.ip || null,
    }, conn)
    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    if (error.statusCode) return sendError(res, error)
    throw error
  } finally {
    conn.release()
  }
  broadcast(['admin', 'staff'], 'billing_voided', { billingId })
  res.json({
    ...(await getBillingRecordWithItems(billingId)),
    stock_returned: returned,
    message: returned.length
      ? `Bill voided. ${returned.length} dispensed batch line${returned.length === 1 ? ' was' : 's were'} returned to stock. Consultation consumables were not returned.`
      : 'Bill voided. Consultation consumables were not returned to stock.',
  })
}

const reopenBill = async (req, res) => {
  const billingId = Number(req.params.id)
  let reason
  try { reason = normalizeText(req.body?.reason, { field: 'Reopen reason', required: true, max: 500, multiline: true }) }
  catch (error) { return sendError(res, error) }
  if (String(reason).length < 5) return res.status(400).json({ message: 'Reopen reason must be at least 5 characters.' })

  const conn = await db.getConnection()
  let returned = []
  try {
    await conn.beginTransaction()
    const [[locked]] = await conn.query('SELECT * FROM billing_records WHERE id = ? FOR UPDATE', [billingId])
    if (!locked) throw httpError(404, 'Billing record not found.')
    if (['draft', 'pending'].includes(locked.status)) throw httpError(409, 'This bill is already a draft.', 'BILL_ALREADY_DRAFT')
    if (locked.status === 'voided') throw httpError(409, 'A voided bill cannot be reopened.', 'BILL_VOIDED')
    const bill = await getBillingRecordWithItems(billingId, conn)
    assertNoMoneyHeld(bill)

    returned = await reverseCheckoutDispensing({ billingId, adminId: req.user.id, reason: `Bill reopened: ${reason}`, executor: conn })
    await conn.query(
      `UPDATE billing_records
       SET status = 'draft', finalized_at = NULL, finalized_by_staff_id = NULL, finalized_by_admin_id = NULL,
           paid_at = NULL, reopened_at = NOW(), reopened_by_admin_id = ?, reopen_reason = ?,
           reopen_count = COALESCE(reopen_count,0) + 1, version = version + 1
       WHERE id = ?`,
      [req.user.id, reason, billingId]
    )
    await writeAuditLog({
      userId: req.user.id, userRole: 'admin', action: 'billing.bill_reopened', entityType: 'billing_record', entityId: billingId,
      oldValues: { status: locked.status, version: locked.version },
      newValues: { status: 'draft', reason, checkout_stock_returned: returned },
      ipAddress: req.ip || null,
    }, conn)
    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    if (error.statusCode) return sendError(res, error)
    throw error
  } finally {
    conn.release()
  }
  broadcast(['admin', 'staff'], 'billing_reopened', { billingId })
  res.json({
    ...(await getBillingRecordWithItems(billingId)),
    stock_returned: returned,
    message: 'Bill reopened as a draft. Checkout can now correct it, confirm it and take payment again.',
  })
}

// ── Unused consultation consumables ──────────────────────────────────────────

const returnConsultationConsumable = async (req, res) => {
  const billingId = Number(req.params.id)
  const usageBatchId = Number(req.params.usageBatchId)
  let quantity, reason
  try {
    quantity = parseWholeQuantity(req.body?.quantity, 'Return quantity')
    reason = normalizeText(req.body?.reason, { field: 'Return reason', required: true, max: 255, multiline: true })
  } catch (error) { return sendError(res, error) }

  const conn = await db.getConnection()
  let result
  try {
    await conn.beginTransaction()
    const [[row]] = await conn.query(
      `SELECT ciub.*, ciu.inventory_id, ciu.consultation_id, ciu.billing_id
       FROM consultation_inventory_usage_batches ciub
       JOIN consultation_inventory_usage ciu ON ciu.id = ciub.consultation_usage_id
       WHERE ciub.id = ? AND ciu.billing_id = ?
       FOR UPDATE`,
      [usageBatchId, billingId]
    )
    if (!row) throw httpError(404, 'Consumable usage record not found on this bill.')
    const remaining = Math.max(0, Number(row.package_quantity || 0) - Number(row.returned_quantity || 0))
    if (quantity > remaining + 0.0001) throw httpError(409, `Only ${remaining} can still be returned for this batch.`, 'RETURN_EXCEEDS_USAGE')

    result = await returnQuantityToBatch(row.inventory_id, row.batch_id, row.source_location_id, quantity, conn)
    await conn.query(
      'UPDATE consultation_inventory_usage_batches SET returned_quantity = returned_quantity + ?, last_returned_at = NOW() WHERE id = ?',
      [quantity, row.id]
    )
    await conn.query(
      `INSERT INTO inventory_logs (inventory_id, admin_id, type, qty, note, movement_type, reference_type, reference_id, batch_id, to_location)
       VALUES (?, ?, 'in', ?, ?, 'clinical_return', 'consultation', ?, ?, ?)`,
      [row.inventory_id, req.user.id, quantity, `${result.batch_code || `Batch #${row.batch_id}`} unused consumable returned (billing record ${billingId}): ${reason}`, row.consultation_id, row.batch_id, result.location]
    )
    await writeAuditLog({
      userId: req.user.id, userRole: 'admin', action: 'inventory.consultation_consumable_returned', entityType: 'billing_record', entityId: billingId,
      newValues: { usage_batch_id: row.id, consultation_id: row.consultation_id, inventory_id: row.inventory_id, batch_id: row.batch_id, quantity, location: result.location, reason },
      ipAddress: req.ip || null,
    }, conn)
    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    if (error.statusCode) return sendError(res, error)
    throw error
  } finally {
    conn.release()
  }
  broadcast(['admin', 'staff'], 'inventory_updated', { inventoryId: result.batch_id })
  res.json({
    message: `${quantity} returned to ${result.location}. The bill amount did not change; use a discount or reopen the bill if the charge must change.`,
    returned: result,
    usage: await loadBillStockUsage(billingId),
  })
}

// ── Move stock between locations (e.g. treatment room back to Main Stockroom) ─

const moveStockBetweenLocations = async (req, res) => {
  const inventoryId = Number(req.params.id)
  const batchId = Number(req.body?.batch_id)
  const fromLocationId = Number(req.body?.from_location_id)
  let quantity, note
  try {
    quantity = parseWholeQuantity(req.body?.quantity)
    note = normalizeOptionalText(req.body?.note, { field: 'Note', max: 255, multiline: true })
  } catch (error) { return sendError(res, error) }
  if (!inventoryId || !batchId || !fromLocationId) return res.status(400).json({ message: 'Select the item, batch and current location.' })

  const actorRole = actorRoleOf(req)
  const conn = await db.getConnection()
  let moved
  try {
    await conn.beginTransaction()
    let toLocationId = Number(req.body?.to_location_id) || null
    if (!toLocationId) {
      const main = await resolveMainStockroom(conn)
      if (!main) throw httpError(409, 'No Main Stockroom is configured.', 'LOCATION_UNAVAILABLE')
      toLocationId = main.id
    }
    moved = await moveBatchBetweenLocations(inventoryId, batchId, fromLocationId, toLocationId, quantity, conn)
    const actorColumn = actorRole === 'admin' ? 'admin_id' : 'staff_id'
    const label = moved.batch_code || `Batch #${batchId}`
    const [transfer] = await conn.query(
      `INSERT INTO inventory_transfers (inventory_id, supply_request_id, from_location, to_location, quantity, transferred_by_role, transferred_by_user_id, notes)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
      [inventoryId, moved.from.name, moved.to.name, quantity, actorRole, req.user.id, note || 'Location move']
    )
    await conn.query(
      'INSERT INTO inventory_transfer_batches (transfer_id, batch_id, quantity, expiration_date) VALUES (?, ?, ?, ?)',
      [transfer.insertId, batchId, quantity, moved.expiration_date || null]
    )
    await conn.query(
      `INSERT INTO inventory_logs (inventory_id, ${actorColumn}, type, qty, note, movement_type, from_location, to_location, reference_type, reference_id, batch_id)
       VALUES (?, ?, 'out', ?, ?, 'transfer_out', ?, ?, 'inventory_transfer', ?, ?)`,
      [inventoryId, req.user.id, quantity, `${label} moved from ${moved.from.name} to ${moved.to.name}${note ? `: ${note}` : ''}`, moved.from.name, moved.to.name, transfer.insertId, batchId]
    )
    await writeAuditLog({
      userId: req.user.id, userRole: actorRole, action: 'inventory.location_move', entityType: 'inventory_item', entityId: inventoryId,
      newValues: { batch_id: batchId, quantity, from: moved.from.name, to: moved.to.name, note: note || null },
      ipAddress: req.ip || null,
    }, conn)
    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    if (error.statusCode) return sendError(res, error)
    throw error
  } finally {
    conn.release()
  }
  broadcast(['admin', 'staff'], 'inventory_updated', { inventoryId })
  res.json({ message: `Moved ${quantity} from ${moved.from.name} to ${moved.to.name}.`, moved: { ...moved, from: moved.from.name, to: moved.to.name } })
}

// ── Cashier closing (end-of-day cash count) ──────────────────────────────────

const computeCashierExpectations = async ({ cashierRole, cashierId, date }, executor = db) => {
  const receivedColumn = cashierRole === 'admin' ? 'received_by_admin_id' : 'received_by_staff_id'
  const [[payments]] = await executor.query(
    `SELECT COUNT(*) AS transactions,
            COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END),0) AS cash_received,
            COALESCE(SUM(CASE WHEN payment_method <> 'cash' THEN amount ELSE 0 END),0) AS non_cash_received
     FROM billing_payments
     WHERE status = 'completed' AND ${receivedColumn} = ? AND DATE(paid_at) = ?`,
    [cashierId, date]
  )
  // Cash refunds handed out today against payments this cashier received.
  const [[refunds]] = await executor.query(
    `SELECT COALESCE(SUM(r.amount),0) AS cash_refunds
     FROM billing_payment_refunds r
     JOIN billing_payments bp ON bp.id = r.payment_id
     WHERE COALESCE(r.payment_method, bp.payment_method) = 'cash' AND bp.${receivedColumn} = ? AND DATE(r.refunded_at) = ?`,
    [cashierId, date]
  )
  const cashReceived = roundMoney(payments?.cash_received)
  const cashRefunds = roundMoney(refunds?.cash_refunds)
  return {
    date,
    transactions: Number(payments?.transactions || 0),
    cash_received: cashReceived,
    cash_refunds: cashRefunds,
    expected_cash: roundMoney(cashReceived - cashRefunds),
    non_cash_collected: roundMoney(payments?.non_cash_received),
  }
}

const loadClosing = async ({ cashierRole, cashierId, date }, executor = db, forUpdate = false) => {
  const [[row]] = await executor.query(
    `SELECT * FROM cashier_closings WHERE cashier_role = ? AND staff_id = ? AND closing_date = ? LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [cashierRole, cashierId, date]
  )
  return row || null
}

// Used by payBill: a cashier whose drawer is closed for today cannot take more payments.
const assertCashierOpen = async ({ cashierRole, cashierId }, executor = db) => {
  const closing = await loadClosing({ cashierRole, cashierId, date: getTodayDateOnly() }, executor).catch((error) => {
    if (error.code === 'ER_BAD_FIELD_ERROR' || error.code === 'ER_NO_SUCH_TABLE') return null
    throw error
  })
  if (closing && closing.status === 'closed') {
    throw httpError(409, 'Your cash drawer for today is already closed. Ask an administrator to reopen it before accepting another payment.', 'CASHIER_CLOSED')
  }
}

const resolveClosingDate = (value) => {
  const today = getTodayDateOnly()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : today
  if (date > today) throw httpError(400, 'A cash count cannot be recorded for a future date.')
  return date
}

const getMyCashierClosing = async (req, res) => {
  let date
  try { date = resolveClosingDate(req.query.date) } catch (error) { return sendError(res, error) }
  const cashierRole = actorRoleOf(req)
  const expectations = await computeCashierExpectations({ cashierRole, cashierId: req.user.id, date })
  const closing = await loadClosing({ cashierRole, cashierId: req.user.id, date })
  res.json({ ...expectations, closing })
}

const closeMyCashier = async (req, res) => {
  let date, notes
  const actualCash = Number(req.body?.actual_cash)
  try {
    date = resolveClosingDate(req.body?.date)
    notes = normalizeOptionalText(req.body?.notes, { field: 'Notes', max: 500, multiline: true })
  } catch (error) { return sendError(res, error) }
  if (!Number.isFinite(actualCash) || actualCash < 0) return res.status(400).json({ message: 'Enter the counted cash amount (₱0.00 or more).' })

  const cashierRole = actorRoleOf(req)
  const cashierId = req.user.id
  const conn = await db.getConnection()
  let closingId
  try {
    await conn.beginTransaction()
    const existing = await loadClosing({ cashierRole, cashierId, date }, conn, true)
    if (existing && existing.status === 'closed') throw httpError(409, 'This cash drawer is already closed for that date. Ask an administrator to reopen it to recount.', 'CASHIER_ALREADY_CLOSED')
    const expectations = await computeCashierExpectations({ cashierRole, cashierId, date }, conn)
    const counted = roundMoney(actualCash)
    const variance = roundMoney(counted - expectations.expected_cash)
    if (Math.abs(variance) >= 0.01 && !notes) {
      const amount = Math.abs(variance).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      throw httpError(400, `The drawer is ${variance < 0 ? 'short' : 'over'} by ₱${amount}. Add a note explaining the difference.`, 'CASHIER_VARIANCE_NOTE_REQUIRED')
    }

    if (existing) {
      await conn.query(
        `UPDATE cashier_closings
         SET expected_cash=?, actual_cash=?, variance=?, notes=?, status='closed', is_locked=1, closed_at=NOW(),
             cash_refunds=?, non_cash_collected=?, transaction_count=?
         WHERE id=?`,
        [expectations.expected_cash, counted, variance, notes || null, expectations.cash_refunds, expectations.non_cash_collected, expectations.transactions, existing.id]
      )
      closingId = existing.id
    } else {
      const [result] = await conn.query(
        `INSERT INTO cashier_closings (cashier_role, staff_id, closing_date, expected_cash, actual_cash, variance, notes, status, is_locked, closed_at, cash_refunds, non_cash_collected, transaction_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'closed', 1, NOW(), ?, ?, ?)`,
        [cashierRole, cashierId, date, expectations.expected_cash, counted, variance, notes || null, expectations.cash_refunds, expectations.non_cash_collected, expectations.transactions]
      )
      closingId = result.insertId
    }
    await conn.query(
      `INSERT INTO cashier_closing_events (cashier_closing_id, event_type, actor_role, actor_id, expected_cash, actual_cash, variance, reason)
       VALUES (?, 'closed', ?, ?, ?, ?, ?, ?)`,
      [closingId, cashierRole, cashierId, expectations.expected_cash, counted, variance, notes || null]
    )
    await writeAuditLog({
      userId: cashierId, userRole: cashierRole, action: 'billing.cashier_closed', entityType: 'cashier_closing', entityId: closingId,
      newValues: { date, expected_cash: expectations.expected_cash, actual_cash: counted, variance, transactions: expectations.transactions },
      ipAddress: req.ip || null,
    }, conn)
    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    if (error.statusCode) return sendError(res, error)
    throw error
  } finally {
    conn.release()
  }
  broadcast(['admin'], 'cashier_closed', { closingId })
  const [[closing]] = await db.query('SELECT * FROM cashier_closings WHERE id = ?', [closingId])
  res.json({ message: 'Cash drawer closed.', closing, ...(await computeCashierExpectations({ cashierRole, cashierId, date })) })
}

const reopenCashierClosing = async (req, res) => {
  const closingId = Number(req.params.closingId)
  let reason
  try { reason = normalizeText(req.body?.reason, { field: 'Reopen reason', required: true, max: 500, multiline: true }) }
  catch (error) { return sendError(res, error) }
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [[closing]] = await conn.query('SELECT * FROM cashier_closings WHERE id = ? FOR UPDATE', [closingId])
    if (!closing) throw httpError(404, 'Cash closing not found.')
    if (closing.status !== 'closed') throw httpError(409, 'This cash drawer is already open.')
    await conn.query(
      "UPDATE cashier_closings SET status='reopened', is_locked=0, reopened_at=NOW(), reopened_by_admin_id=?, reopen_reason=? WHERE id=?",
      [req.user.id, reason, closingId]
    )
    await conn.query(
      `INSERT INTO cashier_closing_events (cashier_closing_id, event_type, actor_role, actor_id, expected_cash, actual_cash, variance, reason)
       VALUES (?, 'reopened', 'admin', ?, ?, ?, ?, ?)`,
      [closingId, req.user.id, closing.expected_cash, closing.actual_cash, closing.variance, reason]
    )
    await writeAuditLog({
      userId: req.user.id, userRole: 'admin', action: 'billing.cashier_reopened', entityType: 'cashier_closing', entityId: closingId,
      oldValues: { status: 'closed' }, newValues: { status: 'reopened', reason }, ipAddress: req.ip || null,
    }, conn)
    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    if (error.statusCode) return sendError(res, error)
    throw error
  } finally {
    conn.release()
  }
  broadcast(['admin', 'staff'], 'cashier_reopened', { closingId })
  const [[closing]] = await db.query('SELECT * FROM cashier_closings WHERE id = ?', [closingId])
  res.json({ message: 'Cash drawer reopened.', closing })
}

module.exports = {
  loadBillStockUsage,
  getBillStockUsage,
  reverseCheckoutDispensing,
  voidBill,
  reopenBill,
  returnConsultationConsumable,
  moveStockBetweenLocations,
  computeCashierExpectations,
  assertCashierOpen,
  getMyCashierClosing,
  closeMyCashier,
  reopenCashierClosing,
}

