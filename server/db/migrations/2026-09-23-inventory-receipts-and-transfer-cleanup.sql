-- Inventory receipt/batch redesign
-- Every Stock In is a new internal batch/receipt. Supplier lot is stored separately.

SET @schema_name := DATABASE();

SET @has_supplier_lot := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='inventory_batches' AND COLUMN_NAME='supplier_lot_number'
);
SET @sql := IF(@has_supplier_lot=0,
  'ALTER TABLE inventory_batches ADD COLUMN supplier_lot_number VARCHAR(120) NULL AFTER batch_code',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_supplier_lot_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='inventory_batches' AND INDEX_NAME='idx_inventory_batches_supplier_lot'
);
SET @sql := IF(@has_supplier_lot_idx=0,
  'CREATE INDEX idx_inventory_batches_supplier_lot ON inventory_batches (inventory_id, supplier_lot_number)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Rebuild item snapshots from active batch balances so stale inventory.stock values are corrected.
UPDATE inventory i
LEFT JOIN (
  SELECT inventory_id,
         COALESCE(SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END),0) AS total_qty,
         MIN(CASE WHEN quantity > 0 THEN expiration_date ELSE NULL END) AS earliest_expiry
  FROM inventory_batches
  WHERE archived_at IS NULL
  GROUP BY inventory_id
) b ON b.inventory_id=i.id
SET i.stock=COALESCE(b.total_qty,0),
    i.stock_base=COALESCE(b.total_qty,0) * COALESCE(NULLIF(i.unit_size,0),1),
    i.expiration_date=b.earliest_expiry;

-- Rebuild location snapshots from per-batch allocations.
DELETE FROM inventory_location_stock;
INSERT INTO inventory_location_stock (location_id, inventory_id, quantity)
SELECT location_id, inventory_id, SUM(quantity)
FROM inventory_location_batches
WHERE quantity > 0
GROUP BY location_id, inventory_id;

