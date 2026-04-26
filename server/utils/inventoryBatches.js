const db = require('../db/connect')

const normalizeExpiryDate = (value) => {
  const normalized = String(value || '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

const toPositiveNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : 0
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

const addInventoryBatch = async (inventoryId, { quantity, expiration_date, note = null }, executor = db) => {
  const batchQty = toPositiveNumber(quantity)
  if (batchQty <= 0) return null

  const [result] = await executor.query(
    `INSERT INTO inventory_batches (inventory_id, quantity, expiration_date, note)
     VALUES (?,?,?,?)`,
    [inventoryId, batchQty, normalizeExpiryDate(expiration_date), note || null]
  )

  return result.insertId
}

const consumeInventoryFEFO = async (inventoryId, quantity, executor = db) => {
  const requestedQty = toPositiveNumber(quantity)
  if (requestedQty <= 0) {
    return { ok: false, message: 'Quantity must be greater than zero.', shortage: 0, consumed: [] }
  }

  const [batches] = await executor.query(
    `SELECT id, quantity, expiration_date, received_at
     FROM inventory_batches
     WHERE inventory_id = ?
       AND quantity > 0
     ORDER BY
       CASE WHEN expiration_date IS NULL THEN 1 ELSE 0 END,
       expiration_date ASC,
       received_at ASC,
       id ASC`,
    [inventoryId]
  )

  let remaining = requestedQty
  const consumed = []

  for (const batch of batches) {
    if (remaining <= 0) break

    const available = Number(batch.quantity || 0)
    if (available <= 0) continue

    const used = Math.min(available, remaining)
    await executor.query(
      'UPDATE inventory_batches SET quantity = ? WHERE id = ?',
      [available - used, batch.id]
    )

    consumed.push({
      id: batch.id,
      quantity: used,
      expiration_date: batch.expiration_date || null,
    })
    remaining -= used
  }

  if (remaining > 0) {
    return {
      ok: false,
      message: 'Not enough stock available in inventory batches.',
      shortage: remaining,
      consumed,
    }
  }

  await syncInventorySnapshot(inventoryId, executor)

  return {
    ok: true,
    shortage: 0,
    consumed,
    requested: requestedQty,
  }
}

const attachBatchesToInventory = async (items, executor = db) => {
  if (!Array.isArray(items) || items.length === 0) return []

  const ids = items.map(item => item.id)
  const placeholders = ids.map(() => '?').join(', ')
  const [rows] = await executor.query(
    `SELECT id, inventory_id, quantity, expiration_date, received_at, note
     FROM inventory_batches
     WHERE inventory_id IN (${placeholders})
       AND quantity > 0
     ORDER BY
       inventory_id ASC,
       CASE WHEN expiration_date IS NULL THEN 1 ELSE 0 END,
       expiration_date ASC,
       received_at ASC,
       id ASC`,
    ids
  )

  const grouped = rows.reduce((acc, row) => {
    const inventoryId = Number(row.inventory_id)
    if (!acc[inventoryId]) acc[inventoryId] = []
    acc[inventoryId].push({
      ...row,
      quantity: Number(row.quantity || 0),
    })
    return acc
  }, {})

  return items.map(item => ({
    ...item,
    batches: grouped[item.id] || [],
    batch_count: (grouped[item.id] || []).length,
  }))
}

module.exports = {
  normalizeExpiryDate,
  syncInventorySnapshot,
  addInventoryBatch,
  consumeInventoryFEFO,
  attachBatchesToInventory,
}
