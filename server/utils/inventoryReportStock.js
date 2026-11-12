const { isUnifiedBillingStockOut } = require('./clinicalInventoryReservations')
// Match the Inventory page's whole available units. Physical valuation remains
// separate: reserving an item does not remove it from the clinic's possession.
function availableStockSql(alias = 'i') {
  if (!/^[a-z_]+$/i.test(alias)) throw new Error('Invalid inventory alias')
  const held = isUnifiedBillingStockOut() ? `COALESCE((SELECT SUM(r.package_quantity)
    FROM clinical_inventory_reservations r JOIN billing_records held_bill ON held_bill.id=r.billing_id
    WHERE r.inventory_id=${alias}.id AND r.status='pending' AND held_bill.branch_id=${alias}.branch_id),0)` : '0'
  return `FLOOR(GREATEST(0,${alias}.stock-${held}))`
}
module.exports = { availableStockSql }
