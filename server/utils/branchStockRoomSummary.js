'use strict'
// The room item count is based on positive, non-archived per-batch allocations,
// not the inventory default room. This is READ ONLY: it never repairs/moves stock.
const BRANCH_STOCK_ROOMS_SQL = `
SELECT l.*,
  COALESCE(assigned.item_count, 0) AS item_count,
  COALESCE(assigned.batch_count, 0) AS batch_count,
  COALESCE(assigned.total_quantity, 0) AS total_quantity,
  (SELECT COUNT(*) FROM inventory i
   WHERE i.default_location_id=l.id AND i.branch_id=l.branch_id AND i.archived_at IS NULL) AS default_item_count,
  ((SELECT COUNT(*) FROM inventory_location_batches x WHERE x.location_id=l.id) +
   (SELECT COUNT(*) FROM inventory_location_stock x WHERE x.location_id=l.id) +
   (SELECT COUNT(*) FROM inventory x WHERE x.default_location_id=l.id AND x.branch_id=l.branch_id) +
   (SELECT COUNT(*) FROM billing_item_batch_usage x WHERE x.source_location_id=l.id) +
   (SELECT COUNT(*) FROM consultation_inventory_usage_batches x WHERE x.source_location_id=l.id) +
   (SELECT COUNT(*) FROM supply_requests x WHERE x.destination_location_id=l.id) +
   (SELECT COUNT(*) FROM supply_request_groups x WHERE x.destination_location_id=l.id) +
   (SELECT COUNT(*) FROM inventory_transfers x WHERE (x.from_branch_id=l.branch_id AND x.from_location=l.name)
                                                 OR (x.to_branch_id=l.branch_id AND x.to_location=l.name)) +
   (SELECT COUNT(*) FROM inventory_logs x WHERE x.branch_id=l.branch_id
     AND (x.from_location=l.name OR x.to_location=l.name))) AS usage_count
FROM inventory_locations l
LEFT JOIN (
  SELECT ilb.location_id,
         COUNT(DISTINCT ilb.inventory_id) AS item_count,
         COUNT(DISTINCT ilb.batch_id) AS batch_count,
         SUM(ilb.quantity) AS total_quantity
  FROM inventory_location_batches ilb
  JOIN inventory i ON i.id=ilb.inventory_id AND i.branch_id=? AND i.archived_at IS NULL
  JOIN inventory_batches ib ON ib.id=ilb.batch_id AND ib.inventory_id=i.id
      AND ib.branch_id=i.branch_id AND ib.archived_at IS NULL
  JOIN inventory_locations room ON room.id=ilb.location_id AND room.branch_id=i.branch_id
  WHERE ilb.quantity > 0
  GROUP BY ilb.location_id
) assigned ON assigned.location_id=l.id
WHERE l.branch_id=?
ORDER BY l.name`

async function getBranchStockRooms(executor, branchId) {
  const id=Number(branchId)
  if (!Number.isSafeInteger(id) || id<=0) {
    throw Object.assign(new Error('A clinic branch is required to view stock rooms.'), {statusCode:403})
  }
  const [rows] = await executor.query(BRANCH_STOCK_ROOMS_SQL,[id,id])
  return rows.map(row=>({
    ...row,
    item_count:Number(row.item_count||0),
    batch_count:Number(row.batch_count||0),
    total_quantity:Number(row.total_quantity||0),
    default_item_count:Number(row.default_item_count||0),
    usage_count:Number(row.usage_count||0),
  }))
}
module.exports = { getBranchStockRooms, BRANCH_STOCK_ROOMS_SQL }
