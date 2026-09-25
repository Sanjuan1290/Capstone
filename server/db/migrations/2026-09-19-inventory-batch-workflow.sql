-- CARAIT Clinic inventory batch workflow hardening.
-- Adds per-item batch/lot uniqueness for searchable stock-in selection.
-- Existing duplicate batch codes are left untouched so the migration stays safe;
-- the application still prevents new duplicates even if the unique key cannot be added.

SET @schema_name = DATABASE();

SET @has_batch_index = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'inventory_batches'
    AND index_name = 'uniq_inventory_batch_code'
);

SET @duplicate_batch_codes = (
  SELECT COUNT(*) FROM (
    SELECT inventory_id, batch_code
    FROM inventory_batches
    WHERE batch_code IS NOT NULL AND TRIM(batch_code) <> ''
    GROUP BY inventory_id, batch_code
    HAVING COUNT(*) > 1
  ) duplicates
);

SET @sql = IF(
  @has_batch_index > 0 OR @duplicate_batch_codes > 0,
  'SELECT 1',
  'ALTER TABLE inventory_batches ADD UNIQUE KEY uniq_inventory_batch_code (inventory_id, batch_code)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

