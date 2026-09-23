const {
  MAIN_LOCATION,
  getInventoryLocationById,
  receiveInventoryBatch,
  consumeInventoryFromLocationByBatches,
  syncInventorySnapshot,
} = require('./inventoryBatches')
const { normalizeStockMovementType } = require('./workflowValidation')
const { writeAuditLog } = require('./audit')

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
const applyManualInventoryMovement = async ({ inventoryId, body = {}, actorRole, actorId, ipAddress, executor }) => {
  const type = String(body.type || '').trim()
  const qty = Number(body.qty)
  if (!['in', 'out'].includes(type) || !Number.isFinite(qty) || qty <= 0) {
    const error = new Error('Choose Stock In or Stock Out and enter a quantity greater than zero.')
    error.statusCode = 400
    throw error
  }
  if (!['admin', 'staff'].includes(actorRole)) throw new Error('Unsupported inventory movement actor.')

  const [rows] = await executor.query('SELECT id, name FROM inventory WHERE id = ?', [inventoryId])
  if (!rows.length) {
    const error = new Error('Item not found.')
    error.statusCode = 404
    throw error
  }
  const item = rows[0]
  const actorColumn = actorRole === 'admin' ? 'admin_id' : 'staff_id'
  const note = String(body.note || '').trim()
  let auditValues

  if (type === 'in') {
    const movementReason = await resolveConfiguredMovementReason('in', body.movement_reason, executor)
    const movementType = movementReason.code
    const received = await receiveInventoryBatch(inventoryId, {
      quantity: qty,
      existing_batch_id: body.existing_batch_id,
      expiration_date: body.expiration_date,
      batch_code: body.batch_code,
      note: note || 'Manual stock-in',
      unit_cost: body.unit_cost,
      location_id: body.storage_location_id,
    }, executor)
    await syncInventorySnapshot(inventoryId, executor)
    await executor.query(
      `INSERT INTO inventory_logs (inventory_id, ${actorColumn}, type, qty, note, movement_type, batch_id, to_location)
       VALUES (?, ?, 'in', ?, ?, ?, ?, ?)`,
      [inventoryId, actorId, qty, note || null, movementType, received.batch_id, received.location]
    )
    auditValues = {
      type: 'in', movement_type: movementType, quantity: qty,
      batch_id: received.batch_id, batch_code: received.batch_code || null,
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
