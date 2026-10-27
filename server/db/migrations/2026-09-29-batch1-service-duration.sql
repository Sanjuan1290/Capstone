-- Batch 1: Service duration foundation
-- Safe to run against the current CARAIT schema.
SET @schema_name = DATABASE();

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name
      AND TABLE_NAME = 'billing_service_catalog'
      AND COLUMN_NAME = 'average_duration_minutes'
  ),
  'SELECT 1',
  'ALTER TABLE billing_service_catalog ADD COLUMN average_duration_minutes INT NOT NULL DEFAULT 60 AFTER consultation_fee'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE billing_service_catalog
SET average_duration_minutes = 60
WHERE average_duration_minutes IS NULL
   OR average_duration_minutes < 15
   OR average_duration_minutes > 480
   OR MOD(average_duration_minutes, 15) <> 0;

