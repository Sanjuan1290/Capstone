const db = require('../db/connect')

const MAIN_LOCATION = 'Main Stockroom'

const normalizeExpiryDate = (value) => {
  const normalized = String(value || '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

const normalizeBatchCode = (value) => String(value || '').trim() || null

const toPositiveNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : 0
}

const getLocationId = async (name = MAIN_LOCATION, executor = db, options = {}) => {
  const locationName = String(name || MAIN_LOCATION).trim() || MAIN_LOCATION
  if (options.createIfMissing !== false) {
    await executor.query(
      `INSERT INTO inventory_locations (name, location_type, is_active)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [locationName, locationName === MAIN_LOCATION ? 'stockroom' : 'room']
    )
  }
  const [[row]] = await executor.query('SELECT id FROM inventory_locations WHERE name = ? AND COALESCE(is_active,1)=1 LIMIT 1', [locationName])
  return row?.id || null
}

const getInventoryLocationById = async (id, executor = db) => {
  const locationId = Number(id)
  if (!locationId) return null
  const [[row]] = await executor.query(
    'SELECT id, name, location_type FROM inventory_locations WHERE id = ? AND COALESCE(is_active,1)=1 LIMIT 1',
    [locationId]
  )
  return row || null
}

const syncLocationSnapshot = async (inventoryId, executor = db) => {
  // Kept for backward compatibility with existing report/UI queries.
  await executor.query('DELETE FROM inventory_location_stock WHERE inventory_id = ?', [inventoryId])
  await executor.query(
    `INSERT INTO inventory_location_stock (location_id, inventory_id, quantity)
     SELECT ilb.location_id, ilb.inventory_id, COALESCE(SUM(ilb.quantity), 0)
     FROM inventory_location_batches ilb
     WHERE ilb.inventory_id = ? AND ilb.quantity > 0
     GROUP BY ilb.location_id, ilb.inventory_id`,
    [inventoryId]
  )
}

const ensureInventoryLocationAllocations = async (inventoryId, executor = db) => {
  const mainLocationId = await getLocationId(MAIN_LOCATION, executor)
  const [batches] = await executor.query(
    `SELECT b.id, b.quantity,
            COALESCE(SUM(ilb.quantity), 0) AS allocated_quantity
     FROM inventory_batches b
     LEFT JOIN inventory_location_batches ilb ON ilb.batch_id = b.id
     WHERE b.inventory_id = ? AND b.quantity > 0
     GROUP BY b.id, b.quantity`,
    [inventoryId]
  )

  for (const batch of batches) {
    const missing = Math.max(0, Number(batch.quantity || 0) - Number(batch.allocated_quantity || 0))
    if (missing <= 0) continue
    await executor.query(
      `INSERT INTO inventory_location_batches (location_id, inventory_id, batch_id, quantity)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
      [mainLocationId, inventoryId, batch.id, missing]
    )
  }
  await syncLocationSnapshot(inventoryId, executor)
}

const syncInventorySnapshot = async (inventoryId, executor = db) => {
  const [[item]] = await executor.query(
    `SELECT id, unit, base_unit, unit_size
     FROM inventory
     WHERE id = ?`,
    [inventoryId]
  )

  if (!item) return null

  const unitSize = Number(item.unit_size) > 0 ? Number(item.unit_size) : 1
  const [[summary]] = await executor.query(
    `SELECT
       COALESCE(SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END), 0) AS stock,
       MIN(CASE WHEN quantity > 0 THEN expiration_date ELSE NULL END) AS expiration_date
     FROM inventory_batches
     WHERE inventory_id = ?`,
    [inventoryId]
  )

  const stock = Number(summary?.stock || 0)
  const stockBase = stock * unitSize
  const expirationDate = summary?.expiration_date || null

  await executor.query(
    `UPDATE inventory
     SET stock = ?,
         stock_base = ?,
         expiration_date = ?,
         base_unit = COALESCE(base_unit, ?)
     WHERE id = ?`,
    [stock, stockBase, expirationDate, item.unit || 'piece', inventoryId]
  )

  return {
    id: Number(inventoryId),
    stock,
    stock_base: stockBase,
    expiration_date: expirationDate,
  }
}

const addInventoryBatch = async (
  inventoryId,
  { quantity, expiration_date, note = null, batch_code = null, location = MAIN_LOCATION },
  executor = db
) => {
  const batchQty = toPositiveNumber(quantity)
  if (batchQty <= 0) return null

  const [result] = await executor.query(
    `INSERT INTO inventory_batches (inventory_id, quantity, expiration_date, note, batch_code)
     VALUES (?,?,?,?,?)`,
    [inventoryId, batchQty, normalizeExpiryDate(expiration_date), note || null, normalizeBatchCode(batch_code)]
  )

  // Location tables are created later during first schema migration. Ignore only that
  // bootstrap case; normal runtime stock-in always receives a per-batch location balance.
  try {
    const locationId = await getLocationId(location, executor)
    await executor.query(
      `INSERT INTO inventory_location_batches (location_id, inventory_id, batch_id, quantity)
       VALUES (?, ?, ?, ?)`,
      [locationId, inventoryId, result.insertId, batchQty]
    )
    await syncLocationSnapshot(inventoryId, executor)
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error
  }

  return result.insertId
}

const loadLocationBatches = async (inventoryId, locationName, executor = db) => {
  await ensureInventoryLocationAllocations(inventoryId, executor)
  const locationId = await getLocationId(locationName, executor)
  const [rows] = await executor.query(
    `SELECT b.id, b.batch_code, b.expiration_date, b.received_at,
            b.quantity AS clinic_quantity, ilb.quantity AS location_quantity
     FROM inventory_location_batches ilb
     JOIN inventory_batches b ON b.id = ilb.batch_id
     WHERE ilb.location_id = ?
       AND ilb.inventory_id = ?
       AND ilb.quantity > 0
       AND b.quantity > 0
       AND (b.expiration_date IS NULL OR b.expiration_date >= CURDATE())
     ORDER BY
       CASE WHEN b.expiration_date IS NULL THEN 1 ELSE 0 END,
       b.expiration_date ASC,
       b.received_at ASC,
       b.id ASC
     FOR UPDATE`,
    [locationId, inventoryId]
  )
  return { locationId, rows }
}

const consumeInventoryFromLocationFEFO = async (
  inventoryId,
  quantity,
  locationName = MAIN_LOCATION,
  executor = db,
  options = {}
) => {
  const requestedQty = toPositiveNumber(quantity)
  if (requestedQty <= 0) {
    return { ok: false, message: 'Quantity must be greater than zero.', shortage: 0, consumed: [] }
  }

  let remaining = requestedQty
  const consumed = []
  const candidateLocations = [locationName]
  if (options.fallbackLocation && options.fallbackLocation !== locationName) candidateLocations.push(options.fallbackLocation)

  for (const candidate of candidateLocations) {
    if (remaining <= 0) break
    const { locationId, rows } = await loadLocationBatches(inventoryId, candidate, executor)
    for (const batch of rows) {
      if (remaining <= 0) break
      const availableAtLocation = Number(batch.location_quantity || 0)
      const availableClinic = Number(batch.clinic_quantity || 0)
      const available = Math.min(availableAtLocation, availableClinic)
      if (available <= 0) continue
      const used = Math.min(available, remaining)

      const [locationUpdate] = await executor.query(
        'UPDATE inventory_location_batches SET quantity = quantity - ? WHERE location_id = ? AND batch_id = ? AND quantity >= ?',
        [used, locationId, batch.id, used]
      )
      if (Number(locationUpdate.affectedRows || 0) !== 1) {
        throw Object.assign(new Error('Inventory changed while this transaction was processing. Please retry.'), { statusCode: 409 })
      }
      const [batchUpdate] = await executor.query(
        'UPDATE inventory_batches SET quantity = quantity - ? WHERE id = ? AND quantity >= ?',
        [used, batch.id, used]
      )
      if (Number(batchUpdate.affectedRows || 0) !== 1) {
        throw Object.assign(new Error('Batch stock changed while this transaction was processing. Please retry.'), { statusCode: 409 })
      }

      consumed.push({
        id: batch.id,
        batch_id: batch.id,
        batch_code: batch.batch_code || null,
        quantity: used,
        expiration_date: batch.expiration_date || null,
        location: candidate,
      })
      remaining -= used
    }
  }

  if (remaining > 0) {
    return {
      ok: false,
      message: `Not enough stock available in ${candidateLocations.join(' or ')} batches.`,
      shortage: remaining,
      consumed,
    }
  }

  await syncInventorySnapshot(inventoryId, executor)
  await syncLocationSnapshot(inventoryId, executor)
  return { ok: true, shortage: 0, consumed, requested: requestedQty }
}

const consumeInventoryFromLocationByBatches = async (
  inventoryId,
  selections = [],
  locationName = MAIN_LOCATION,
  executor = db
) => {
  const normalizedSelections = Array.isArray(selections)
    ? selections
      .map((entry) => ({ batch_id: Number(entry?.batch_id), quantity: toPositiveNumber(entry?.quantity) }))
      .filter((entry) => entry.batch_id > 0 && entry.quantity > 0)
    : []
  if (!normalizedSelections.length) {
    return { ok: false, message: 'Select at least one batch.', shortage: 0, consumed: [] }
  }

  await ensureInventoryLocationAllocations(inventoryId, executor)
  const locationId = await getLocationId(locationName, executor)
  const batchIds = normalizedSelections.map((entry) => entry.batch_id)
  const [rows] = await executor.query(
    `SELECT b.id, b.batch_code, b.quantity AS clinic_quantity, b.expiration_date,
            COALESCE(ilb.quantity, 0) AS location_quantity
     FROM inventory_batches b
     LEFT JOIN inventory_location_batches ilb
       ON ilb.batch_id = b.id AND ilb.location_id = ?
     WHERE b.inventory_id = ? AND b.id IN (${batchIds.map(() => '?').join(',')})
     FOR UPDATE`,
    [locationId, inventoryId, ...batchIds]
  )
  const batchMap = new Map(rows.map((row) => [Number(row.id), row]))
  const consumed = []

  for (const selection of normalizedSelections) {
    const batch = batchMap.get(selection.batch_id)
    if (!batch) return { ok: false, message: `Batch ${selection.batch_id} is not available for this item.`, shortage: selection.quantity, consumed }
    const available = Math.min(Number(batch.location_quantity || 0), Number(batch.clinic_quantity || 0))
    if (available < selection.quantity) {
      return { ok: false, message: `Batch ${batch.batch_code || `#${batch.id}`} only has ${available} remaining at ${locationName}.`, shortage: selection.quantity - available, consumed }
    }
    const [locationUpdate] = await executor.query('UPDATE inventory_location_batches SET quantity = quantity - ? WHERE location_id = ? AND batch_id = ? AND quantity >= ?', [selection.quantity, locationId, batch.id, selection.quantity])
    if (Number(locationUpdate.affectedRows || 0) !== 1) throw Object.assign(new Error('Selected batch stock changed. Please reload and retry.'), { statusCode: 409 })
    const [batchUpdate] = await executor.query('UPDATE inventory_batches SET quantity = quantity - ? WHERE id = ? AND quantity >= ?', [selection.quantity, batch.id, selection.quantity])
    if (Number(batchUpdate.affectedRows || 0) !== 1) throw Object.assign(new Error('Selected batch stock changed. Please reload and retry.'), { statusCode: 409 })
    consumed.push({ id: batch.id, batch_id: batch.id, batch_code: batch.batch_code || null, quantity: selection.quantity, expiration_date: batch.expiration_date || null, location: locationName })
  }

  await syncInventorySnapshot(inventoryId, executor)
  await syncLocationSnapshot(inventoryId, executor)
  return { ok: true, shortage: 0, consumed, requested: normalizedSelections.reduce((sum, entry) => sum + entry.quantity, 0) }
}

// Backward-compatible wrappers. Manual inventory operations are Main Stockroom
// operations; clinical/dispensing code should call the explicit location helpers.
const consumeInventoryFEFO = async (inventoryId, quantity, executor = db) => (
  consumeInventoryFromLocationFEFO(inventoryId, quantity, MAIN_LOCATION, executor)
)

const consumeInventoryByBatches = async (inventoryId, selections = [], executor = db) => (
  consumeInventoryFromLocationByBatches(inventoryId, selections, MAIN_LOCATION, executor)
)

const transferInventoryBatchesFEFO = async (
  inventoryId,
  quantity,
  fromLocation = MAIN_LOCATION,
  toLocation,
  executor = db
) => {
  const requestedQty = toPositiveNumber(quantity)
  if (requestedQty <= 0 || !String(toLocation || '').trim()) {
    return { ok: false, message: 'A positive quantity and destination are required.', transferred: [] }
  }

  await ensureInventoryLocationAllocations(inventoryId, executor)
  const { locationId: fromId, rows } = await loadLocationBatches(inventoryId, fromLocation, executor)
  const toId = await getLocationId(toLocation, executor)
  let remaining = requestedQty
  const transferred = []

  for (const batch of rows) {
    if (remaining <= 0) break
    const available = Number(batch.location_quantity || 0)
    if (available <= 0) continue
    const moved = Math.min(available, remaining)
    const [sourceUpdate] = await executor.query('UPDATE inventory_location_batches SET quantity = quantity - ? WHERE location_id = ? AND batch_id = ? AND quantity >= ?', [moved, fromId, batch.id, moved])
    if (Number(sourceUpdate.affectedRows || 0) !== 1) throw Object.assign(new Error('Transfer source stock changed. Please retry.'), { statusCode: 409 })
    await executor.query(
      `INSERT INTO inventory_location_batches (location_id, inventory_id, batch_id, quantity)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
      [toId, inventoryId, batch.id, moved]
    )
    transferred.push({ batch_id: batch.id, batch_code: batch.batch_code || null, quantity: moved, expiration_date: batch.expiration_date || null })
    remaining -= moved
  }

  if (remaining > 0) {
    return { ok: false, message: `Not enough transferable stock in ${fromLocation}.`, shortage: remaining, transferred }
  }
  await syncLocationSnapshot(inventoryId, executor)
  return { ok: true, shortage: 0, requested: requestedQty, transferred }
}

const attachBatchesToInventory = async (items, executor = db) => {
  if (!Array.isArray(items) || items.length === 0) return []

  const ids = items.map((item) => item.id)
  const placeholders = ids.map(() => '?').join(', ')
  const [rows] = await executor.query(
    `SELECT b.id, b.inventory_id, b.batch_code, b.quantity, b.expiration_date, b.received_at, b.note,
            il.name AS location_name, ilb.quantity AS location_quantity
     FROM inventory_batches b
     LEFT JOIN inventory_location_batches ilb ON ilb.batch_id = b.id AND ilb.quantity > 0
     LEFT JOIN inventory_locations il ON il.id = ilb.location_id
     WHERE b.inventory_id IN (${placeholders})
       AND b.quantity > 0
     ORDER BY
       b.inventory_id ASC,
       CASE WHEN b.expiration_date IS NULL THEN 1 ELSE 0 END,
       b.expiration_date ASC,
       b.received_at ASC,
       b.id ASC`,
    ids
  ).catch(async (error) => {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error
    return executor.query(
      `SELECT id, inventory_id, NULL AS batch_code, quantity, expiration_date, received_at, note,
              NULL AS location_name, NULL AS location_quantity
       FROM inventory_batches
       WHERE inventory_id IN (${placeholders}) AND quantity > 0
       ORDER BY inventory_id ASC, CASE WHEN expiration_date IS NULL THEN 1 ELSE 0 END, expiration_date ASC, received_at ASC, id ASC`,
      ids
    )
  })

  const batchMap = new Map()
  for (const row of rows) {
    const key = Number(row.id)
    if (!batchMap.has(key)) {
      batchMap.set(key, {
        id: row.id,
        inventory_id: row.inventory_id,
        batch_code: row.batch_code || null,
        quantity: Number(row.quantity || 0),
        expiration_date: row.expiration_date || null,
        received_at: row.received_at,
        note: row.note || null,
        locations: [],
      })
    }
    if (row.location_name && Number(row.location_quantity || 0) > 0) {
      batchMap.get(key).locations.push({ name: row.location_name, quantity: Number(row.location_quantity || 0) })
    }
  }

  const grouped = {}
  for (const batch of batchMap.values()) {
    const inventoryId = Number(batch.inventory_id)
    if (!grouped[inventoryId]) grouped[inventoryId] = []
    grouped[inventoryId].push(batch)
  }

  return items.map((item) => ({
    ...item,
    batches: grouped[item.id] || [],
    batch_count: (grouped[item.id] || []).length,
  }))
}

module.exports = {
  getInventoryLocationById,
  MAIN_LOCATION,
  normalizeExpiryDate,
  normalizeBatchCode,
  syncInventorySnapshot,
  syncLocationSnapshot,
  ensureInventoryLocationAllocations,
  addInventoryBatch,
  consumeInventoryFEFO,
  consumeInventoryByBatches,
  consumeInventoryFromLocationFEFO,
  consumeInventoryFromLocationByBatches,
  transferInventoryBatchesFEFO,
  attachBatchesToInventory,
}
