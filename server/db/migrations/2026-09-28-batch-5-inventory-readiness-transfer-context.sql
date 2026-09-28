-- CARAIT Batch 5 - inventory readiness and appointment-linked stock transfers
USE `carait_clinic_system`;

SET @schema_name = DATABASE();

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='supply_request_groups' AND COLUMN_NAME='appointment_id'),
  'SELECT 1',
  'ALTER TABLE supply_request_groups ADD COLUMN appointment_id INT NULL AFTER doctor_id'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='supply_request_groups' AND COLUMN_NAME='consultation_id'),
  'SELECT 1',
  'ALTER TABLE supply_request_groups ADD COLUMN consultation_id INT NULL AFTER appointment_id'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='supply_request_groups' AND INDEX_NAME='idx_supply_request_groups_appointment'),
  'SELECT 1',
  'ALTER TABLE supply_request_groups ADD INDEX idx_supply_request_groups_appointment (appointment_id, status, requested_at)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=@schema_name AND TABLE_NAME='supply_request_groups' AND CONSTRAINT_NAME='fk_supply_request_groups_appointment'),
  'SELECT 1',
  'ALTER TABLE supply_request_groups ADD CONSTRAINT fk_supply_request_groups_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=@schema_name AND TABLE_NAME='supply_request_groups' AND CONSTRAINT_NAME='fk_supply_request_groups_consultation'),
  'SELECT 1',
  'ALTER TABLE supply_request_groups ADD CONSTRAINT fk_supply_request_groups_consultation FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE SET NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
