// Deferred clinical stock-out.  No live data is changed by importing this file.
// Requires the 2026-11-11-billing-stock-reservations.sql migration and feature flag.
const {
  loadLocationBatches,
  syncInventorySnapshot,
  syncLocationSnapshot,
} = require('./inventoryBatches')

const isUnifiedBillingStockOut = () => process.env.UNIFIED_BILLING_STOCKOUT === '1'

const insufficientStock = (itemName) => Object.assign(
  new Error(`Not enough available stock for ${itemName}. Choose another item or restock before finishing this consultation.`),
  { statusCode: 409, code: 'INVENTORY_INSUFFICIENT' }
)

// Read/lock physical stock rows and select an exact receipt/stockroom for the pending usage.
// The reservation is inserted by the caller in the SAME transaction before locks release.
const planClinicalInventoryReservation = async ({ inventoryId, packageQuantity, preferredLocation, fallbackLocation, itemName }, conn) => {
  let remaining = Number(packageQuantity)
  if (!Number.isFinite(remaining) || remaining <= 0) return []
  const chosen = []
  for (const locationName of [preferredLocation, fallbackLocation].filter(Boolean)) {
    if (remaining <= 0.000001) break
    const { locationId, locationName: resolvedName, rows } = await loadLocationBatches(inventoryId, locationName, conn)
    if (!locationId) continue
    for (const batch of rows) {
      if (remaining <= 0.000001) break
      const available = Math.min(Number(batch.location_quantity || 0), Number(batch.clinic_quantity || 0))
      if (available <= 0) continue
      const picked = Math.min(available, remaining)
      chosen.push({
        batch_id: Number(batch.id), batch_code: batch.batch_code || null,
        location_id: Number(locationId), location: resolvedName,
        quantity: Math.round(picked * 10000) / 10000,
      })
      remaining = Math.round((remaining - picked) * 10000) / 10000
    }
  }
  if (remaining > 0.000001) throw insufficientStock(itemName)
  return chosen
}

// This function is shared by manual cash, QR Ph webhook reconciliation and other
// payments routed through payBill. All movements and payment rows commit together.
const postClinicalReservations = async ({ billId, branchId, actorRole, actorId, executor, status = 'posted' }) => {
  if (!['posted', 'unpaid_posted'].includes(status)) throw new Error('Invalid clinical inventory completion status.')
  const [rows] = await executor.query(
    `SELECT r.id,r.inventory_id,r.batch_id,r.location_id,r.package_quantity,r.usage_quantity,
            r.consultation_usage_id,u.unit_label,u.recorded_by_doctor_id,ib.batch_code,
            il.name AS source_location
     FROM clinical_inventory_reservations r
     JOIN consultation_inventory_usage u ON u.id=r.consultation_usage_id AND u.billing_id=r.billing_id
     JOIN inventory i ON i.id=r.inventory_id AND i.branch_id=?
     JOIN inventory_batches ib ON ib.id=r.batch_id AND ib.inventory_id=r.inventory_id
     JOIN inventory_locations il ON il.id=r.location_id AND il.branch_id=?
     WHERE r.billing_id=? AND r.status='pending'
     ORDER BY r.inventory_id,r.location_id,r.batch_id,r.id FOR UPDATE`,
    [branchId, branchId, billId]
  )
  const inventoryIds = new Set()
  for (const entry of rows) {
    const quantity = Number(entry.package_quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) throw Object.assign(new Error('Stored pending usage is invalid.'), {statusCode:409,code:'CLINICAL_USAGE_INVALID'})
    // The posted quantities are already held. They must be removed once from
    // physical stock, even if another available-stock check excludes the hold.
    const [locationResult] = await executor.query(
      `UPDATE inventory_location_batches SET quantity=quantity-?
       WHERE location_id=? AND inventory_id=? AND batch_id=? AND quantity>=?`,
      [quantity,entry.location_id,entry.inventory_id,entry.batch_id,quantity]
    )
    if (Number(locationResult.affectedRows) !== 1) throw Object.assign(new Error('Pending stock changed. Payment was not recorded; review the inventory.'), {statusCode:409,code:'CLINICAL_RESERVED_STOCK_CHANGED'})
    const [batchResult] = await executor.query(
      'UPDATE inventory_batches SET quantity=quantity-? WHERE id=? AND inventory_id=? AND quantity>=?',
      [quantity,entry.batch_id,entry.inventory_id,quantity]
    )
    if (Number(batchResult.affectedRows) !== 1) throw Object.assign(new Error('Pending batch stock changed. Payment was not recorded; review the inventory.'), {statusCode:409,code:'CLINICAL_RESERVED_STOCK_CHANGED'})
    await executor.query(
      `INSERT INTO consultation_inventory_usage_batches
       (consultation_usage_id,batch_id,package_quantity,usage_quantity,usage_unit_label,source_location,source_location_id)
       VALUES (?,?,?,?,?,?,?)`,
      [entry.consultation_usage_id,entry.batch_id,quantity,entry.usage_quantity,entry.unit_label,entry.source_location,entry.location_id]
    )
    await executor.query(
      `INSERT INTO inventory_logs
       (inventory_id,doctor_id,staff_id,admin_id,type,qty,note,movement_type,reference_type,reference_id,batch_id,from_location,branch_id)
       VALUES (?,?,?,?, 'out',?,?,'clinical_use','billing_record',?,?,?,?)`,
      [entry.inventory_id,entry.recorded_by_doctor_id || null,actorRole === 'staff' ? actorId : null,actorRole === 'admin' ? actorId : null,quantity,
        `${entry.batch_code || `Batch #${entry.batch_id}`} clinic use settled ${status === 'unpaid_posted' ? 'without payment' : 'after full payment'}`,
        billId,entry.batch_id,entry.source_location,branchId]
    )
    await executor.query(
      `UPDATE clinical_inventory_reservations
       SET status=?,posted_at=NOW(),posted_by_role=?,posted_by_user_id=?
       WHERE id=? AND status='pending'`,
      [status,actorRole,actorId || null,entry.id]
    )
    inventoryIds.add(entry.inventory_id)
  }
  for (const inventoryId of inventoryIds) {
    await syncInventorySnapshot(inventoryId, executor)
    await syncLocationSnapshot(inventoryId, executor)
  }
  if (rows.length) await executor.query('UPDATE billing_records SET clinical_inventory_consumed_at=COALESCE(clinical_inventory_consumed_at,NOW()) WHERE id=? AND branch_id=?', [billId,branchId])
  return rows.length
}

// If this feature was previously enabled, disabling the flag must never allow
// payment to bypass outstanding reservations. Missing table is tolerated only
// for older installations where no reservation could have been created.
const assertNoUnpostedStockWithFeatureOff = async (billId, executor) => {
  if (isUnifiedBillingStockOut()) return
  let rows
  try {
    ;[rows] = await executor.query("SELECT id FROM clinical_inventory_reservations WHERE billing_id=? AND status='pending' LIMIT 1", [billId])
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') return
    throw error
  }
  if (rows.length) throw Object.assign(new Error('This bill has pending clinical stock. Re-enable the unified billing stock workflow before payment.'),{statusCode:409,code:'PENDING_STOCK_NEEDS_SETTLEMENT'})
}

module.exports = {
  isUnifiedBillingStockOut,
  planClinicalInventoryReservation,
  postClinicalReservations,
  assertNoUnpostedStockWithFeatureOff,
}
