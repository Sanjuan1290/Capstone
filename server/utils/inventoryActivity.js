const { writeAuditLog } = require('./audit')

// Call within the stock transaction, before changing batches. Lock the product
// first, then read physical quantities; pending reservations do not change these.
async function readPhysicalInventoryQuantity(inventoryId, executor) {
  const [[item]] = await executor.query('SELECT id FROM inventory WHERE id=? FOR UPDATE', [inventoryId])
  if (!item) throw new Error('Inventory item not found while recording movement')
  const [rows] = await executor.query('SELECT quantity FROM inventory_batches WHERE inventory_id=? AND archived_at IS NULL FOR UPDATE', [inventoryId])
  return rows.reduce((total, row) => total + Math.max(0, Number(row.quantity || 0)), 0)
}

// Preserve the existing movement INSERTs while adding one transactional audit
// event for each exact item/batch movement. Only our simple VALUES templates are
// accepted; identifiers and SQL are application constants, never client input.
async function writeInventoryActivity(executor, sql, params, bounds) {
  const match = /^\s*INSERT INTO inventory_logs\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)\s*$/i.exec(sql)
  if (!match) throw new Error('Unsupported inventory activity statement')
  const columns = match[1].split(',').map(value => value.trim())
  const tokens = match[2].split(',').map(value => value.trim())
  if (tokens.length !== columns.length) throw new Error('Invalid inventory activity values')
  let index = 0
  const row = Object.fromEntries(columns.map((key, i) => {
    const token = tokens[i]
    if (!/^[a-z_]+$/i.test(key) || !/^(?:\?|NULL|'(?:''|[^'])*')$/i.test(token)) throw new Error('Invalid inventory activity template')
    return [key, token === '?' ? params[index++] : token.toUpperCase() === 'NULL' ? null : token.slice(1, -1)]
  }))
  if (index !== params.length || !Number.isSafeInteger(Number(row.branch_id)) || Number(row.branch_id) <= 0) throw new Error('Verified branch required for inventory activity')
  const before = Number(bounds?.quantityBefore), after = Number(bounds?.quantityAfter)
  if (!bounds || bounds.quantityBefore == null || bounds.quantityAfter == null || !Number.isFinite(before) || !Number.isFinite(after) || before < 0 || after < 0) throw new Error('Inventory movement requires recorded before/after quantities')
  const statement = sql.replace(/\)\s*VALUES/i, ', quantity_before, quantity_after) VALUES').replace(/\)\s*$/, ', ?, ?)')
  const result = await executor.query(statement, [...params, before, after])
  const role = row.admin_id ? 'admin' : row.staff_id ? 'staff' : row.doctor_id ? 'doctor' : 'system'
  await writeAuditLog({
    userId: row.admin_id || row.staff_id || row.doctor_id || null, userRole: role,
    action: 'inventory.movement_recorded', entityType: 'inventory_item', entityId: row.inventory_id,
    branchId: Number(row.branch_id),
    oldValues: { quantity: before },
    newValues: { quantity: after, movement_type: row.movement_type, moved_quantity: Number(row.qty), batch_id: row.batch_id || null,
      inventory_log_id: result[0].insertId, from_location: row.from_location || null, to_location: row.to_location || null,
      reference_type: row.reference_type || null, reference_id: row.reference_id || null },
  }, executor)
  return result
}
async function ensureInventoryActivityColumns(executor, apply = false) {
  for (const column of ['quantity_before', 'quantity_after']) {
    const [[row]] = await executor.query('SELECT COLUMN_TYPE,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', ['inventory_logs', column])
    if (row) {
      if (String(row.COLUMN_TYPE).toLowerCase() !== 'decimal(12,2)' || row.IS_NULLABLE !== 'YES') throw new Error('Incompatible inventory movement column: ' + column)
    } else if (apply) await executor.query(`ALTER TABLE inventory_logs ADD COLUMN ${column} DECIMAL(12,2) NULL`)
    else throw new Error('Inventory movement migration required: ' + column)
  }
}
module.exports = { readPhysicalInventoryQuantity, writeInventoryActivity, ensureInventoryActivityColumns }
