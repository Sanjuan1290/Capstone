const db = require('../db/connect')
const { syncInventorySnapshot } = require('./inventoryBatches')
const { getClinicDateTimeSql } = require('./date')

const syncInventoryBaseStock = async (inventoryId) => syncInventorySnapshot(inventoryId, db)

const markOverdueAppointments = async () => {
  const clinicNow = getClinicDateTimeSql()
  await db.query(
    `UPDATE appointments
     SET status = 'no_show'
     WHERE status IN ('pending', 'confirmed')
       AND TIMESTAMP(
         appointment_date,
         DATE_FORMAT(STR_TO_DATE(appointment_time, '%h:%i %p'), '%H:%i:%s')
       ) < ?`,
    [clinicNow]
  )
}

module.exports = {
  syncInventoryBaseStock,
  markOverdueAppointments,
}
