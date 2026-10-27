-- CARAIT Billing follow-up: discount proof images.
-- Extra consultation consumables use existing billing_items source_type='consultation_extra'
-- and therefore require no new billing-items schema columns.

SET @schema_name := DATABASE();

SET @sql := IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='billing_records' AND COLUMN_NAME='discount_reference_image_url'
  ),
  'SELECT 1',
  'ALTER TABLE billing_records ADD COLUMN discount_reference_image_url VARCHAR(500) NULL AFTER discount_reference'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='billing_adjustment_requests' AND COLUMN_NAME='reference_image_url'
  ),
  'SELECT 1',
  'ALTER TABLE billing_adjustment_requests ADD COLUMN reference_image_url VARCHAR(500) NULL AFTER reference_text'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

