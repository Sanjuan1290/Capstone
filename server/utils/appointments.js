const db = require('../db/connect')
const { syncInventorySnapshot } = require('./inventoryBatches')

const syncInventoryBaseStock = async (inventoryId) => syncInventorySnapshot(inventoryId, db)

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
