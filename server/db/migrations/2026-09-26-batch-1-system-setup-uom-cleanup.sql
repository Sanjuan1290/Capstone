-- CARAIT Batch 1 (2026-09-26)
-- System Setup / UOM cleanup
-- 1) Decimal-enabled UOMs always use two decimal places.
-- 2) UOM abbreviation is retired; the UOM name is the canonical display label.

SET @schema_name = DATABASE();

UPDATE inventory_uoms
SET decimal_precision = CASE
  WHEN COALESCE(allow_decimal_quantity, 0) = 1 THEN 2
  ELSE 0
END;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name
      AND TABLE_NAME = 'inventory_uoms'
      AND COLUMN_NAME = 'abbreviation'
  ),
  'ALTER TABLE inventory_uoms DROP COLUMN abbreviation',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
