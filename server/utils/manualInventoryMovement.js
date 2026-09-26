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

const resolveConfiguredMovementReason = async (type, value, executor) => {
  const requested = String(value || '').trim()
  try {
    const params = [type]
    let sql = `SELECT id,name,code,movement_type,requires_batch,is_system
               FROM inventory_movement_reasons
               WHERE movement_type=? AND is_active=1`
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
const validateQuantityByUom = async (item, quantity, executor) => {
  const [[policy]] = await executor.query(
    `SELECT COALESCE(allow_decimal_quantity,0) AS allow_decimal_quantity
     FROM inventory_uoms WHERE LOWER(name)=LOWER(?) LIMIT 1`,
    [item.uom || item.base_unit || item.unit || '']
  ).catch(() => [[null]])
  const allowDecimal = Number(policy?.allow_decimal_quantity || 0) === 1
  const precision = allowDecimal ? 2 : 0
  const scale = 10 ** precision
  if (!allowDecimal && Math.abs(quantity - Math.round(quantity)) > 0.000001) {
    throw Object.assign(new Error(`${item.uom || item.unit || 'This unit'} only allows whole-number quantities.`), { statusCode: 400, code: 'INVENTORY_QUANTITY_PRECISION' })
  }
  if (allowDecimal && Math.abs(quantity * scale - Math.round(quantity * scale)) > 0.000001) {
    throw Object.assign(new Error(`Quantity supports up to ${precision} decimal place${precision === 1 ? '' : 's'} for ${item.uom || item.unit || 'this unit'}.`), { statusCode: 400, code: 'INVENTORY_QUANTITY_PRECISION' })
  }
}

const applyManualInventoryMovement = async ({ inventoryId, body = {}, actorRole, actorId, ipAddress, executor }) => {
  const type = String(body.type || '').trim()
  const qty = normalizeNumber(body.qty, { field: 'Quantity', required: true, min: 0.0001, max: 9999999999 })
  if (!['in', 'out'].includes(type)) {
    const error = new Error('Choose Stock In or Stock Out and enter a quantity greater than zero.')
    error.statusCode = 400
    throw error
  }
  if (!['admin', 'staff'].includes(actorRole)) throw new Error('Unsupported inventory movement actor.')

  const [rows] = await executor.query('SELECT id, name, category, item_type, uom, base_unit, unit, supplier_id, selling_price, archived_at FROM inventory WHERE id = ?', [inventoryId])
  if (!rows.length) {
    const error = new Error('Item not found.')
    error.statusCode = 404
    throw error
  }
  const item = rows[0]
  if (item.archived_at) throw Object.assign(new Error('Archived inventory items cannot receive or issue stock.'), { statusCode: 409, code: 'INVENTORY_ARCHIVED' })
  await validateQuantityByUom(item, qty, executor)
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
    const lotMissing = body.supplier_lot_missing === true || body.supplier_lot_missing === 1 || String(body.supplier_lot_missing || '').toLowerCase() === 'true'
    const supplierLotNumber = normalizeOptionalText(body.supplier_lot_number, { field: 'Supplier Lot Number', max: 120 }) || ''
    if (!lotMissing && !supplierLotNumber) {
      throw Object.assign(new Error('Supplier Lot Number is required unless the supplier did not provide one.'), { statusCode: 400, code: 'INVENTORY_SUPPLIER_LOT_REQUIRED' })
    }
    const supplierId = Number(body.supplier_id || item.supplier_id || 0)
    if (!supplierId) throw Object.assign(new Error('Select the supplier for this receipt.'), { statusCode: 400, code: 'INVENTORY_SUPPLIER_REQUIRED' })
    const [[supplier]] = await executor.query('SELECT id,name,category FROM inventory_suppliers WHERE id=? AND is_active=1 LIMIT 1', [supplierId])
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
    const movementReason = await resolveConfiguredMovementReason('in', body.movement_reason, executor)
    const movementType = movementReason.code
    const received = await receiveInventoryBatch(inventoryId, {
      quantity: qty,
      expiration_date: noExpiry ? null : body.expiration_date,
      batch_code: body.batch_code,
      supplier_lot_number: lotMissing ? null : supplierLotNumber,
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
      `INSERT INTO inventory_logs (inventory_id, ${actorColumn}, type, qty, note, movement_type, batch_id, to_location)
       VALUES (?, ?, 'in', ?, ?, ?, ?, ?)`,
      [inventoryId, actorId, qty, note || null, movementType, received.batch_id, received.location]
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
    let selectedLocation = locationId ? await getInventoryLocationById(locationId, executor) : null
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
         WHERE ilb.inventory_id = ? AND ilb.batch_id = ? AND ilb.quantity > 0 AND COALESCE(il.is_active,1)=1
         ORDER BY il.name, il.id`,
        [inventoryId, batchId]
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
    const movementReason = await resolveConfiguredMovementReason('out', body.movement_reason, executor)
    const movementType = movementReason.code
    await executor.query(
      `INSERT INTO inventory_logs (inventory_id, ${actorColumn}, type, qty, note, movement_type, batch_id, from_location)
       VALUES (?, ?, 'out', ?, ?, ?, ?, ?)`,
      [inventoryId, actorId, quantity, note || null, movementType, batch.batch_id || batch.id, batch.location || 'Main Stockroom']
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
  }, executor)

  return { item, movement: auditValues }
}

module.exports = { applyManualInventoryMovement }
