-- CARAIT Batch 2 (2026-09-28)
-- Separate inventory stock quantity/unit from the strength or size of one stock unit.
-- Example: 100 capsules in stock, each capsule = 500 mg.

SET @schema_name = DATABASE();

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name
      AND TABLE_NAME = 'inventory'
      AND COLUMN_NAME = 'measurement_value'
  ),
  'ALTER TABLE inventory MODIFY COLUMN measurement_value DECIMAL(12,4) NULL',
  'ALTER TABLE inventory ADD COLUMN measurement_value DECIMAL(12,4) NULL AFTER strength'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name
      AND TABLE_NAME = 'inventory'
      AND COLUMN_NAME = 'measurement_unit'
  ),
  'ALTER TABLE inventory MODIFY COLUMN measurement_unit VARCHAR(30) NULL',
  'ALTER TABLE inventory ADD COLUMN measurement_unit VARCHAR(30) NULL AFTER measurement_value'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Existing legacy `strength` text is deliberately preserved. It is not parsed
-- automatically because values such as "500mg/5mL" are not safely reversible
-- into one numeric measurement_value + measurement_unit pair.
