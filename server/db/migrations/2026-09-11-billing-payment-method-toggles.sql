-- Billing payment-method availability controls.
-- Safe to run more than once on the current database.

SET @schema_name = DATABASE();

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='clinic_payment_settings' AND column_name='cash_enabled'),
  'SELECT 1',
  'ALTER TABLE clinic_payment_settings ADD COLUMN cash_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER id'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='clinic_payment_settings' AND column_name='gcash_enabled'),
  'SELECT 1',
  'ALTER TABLE clinic_payment_settings ADD COLUMN gcash_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER cash_enabled'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='clinic_payment_settings' AND column_name='maya_enabled'),
  'SELECT 1',
  'ALTER TABLE clinic_payment_settings ADD COLUMN maya_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER gcash_enabled'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='clinic_payment_settings' AND column_name='bank_transfer_enabled'),
  'SELECT 1',
  'ALTER TABLE clinic_payment_settings ADD COLUMN bank_transfer_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER maya_enabled'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
