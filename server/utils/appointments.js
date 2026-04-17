const db = require('../db/connect')

const syncInventoryBaseStock = async (inventoryId) => {
  const [rows] = await db.query(
    `SELECT id, stock, unit_size
     FROM inventory
     WHERE id = ?`,
    [inventoryId]
  )

  if (!rows.length) return null

  const item = rows[0]
  const unitSize = Number(item.unit_size) > 0 ? Number(item.unit_size) : 1
  const stockBase = Number(item.stock) * unitSize

  await db.query(
    'UPDATE inventory SET stock_base = ?, base_unit = COALESCE(base_unit, unit) WHERE id = ?',
    [stockBase, inventoryId]
  )

  return { ...item, unit_size: unitSize, stock_base: stockBase }
}

const markOverdueAppointments = async () => {
  await db.query(
    `UPDATE appointments
     SET status = 'no_show'
     WHERE status IN ('pending', 'confirmed')
       AND TIMESTAMP(
         appointment_date,
         DATE_FORMAT(STR_TO_DATE(appointment_time, '%h:%i %p'), '%H:%i:%s')
       ) < NOW()`
  )
}

module.exports = {
  syncInventoryBaseStock,
  markOverdueAppointments,
}
