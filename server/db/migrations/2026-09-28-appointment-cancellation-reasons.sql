-- CARAIT Batch 3 (2026-09-28)
-- Appointment cancellation reasons and historical cancellation snapshots.
USE `carait_clinic_system`;

CREATE TABLE IF NOT EXISTS appointment_cancellation_reasons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(120) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_appointment_cancellation_reason_label (label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO appointment_cancellation_reasons (label, is_active, sort_order) VALUES
  ('Schedule conflict', 1, 10),
  ('Feeling better / consultation no longer needed', 1, 20),
  ('Transportation issue', 1, 30),
  ('Financial reason', 1, 40),
  ('Booked another schedule', 1, 50);

SET @schema_name = DATABASE();

SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='appointments' AND COLUMN_NAME='cancellation_reason_id'), 'SELECT 1', 'ALTER TABLE appointments ADD COLUMN cancellation_reason_id INT NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='appointments' AND COLUMN_NAME='cancellation_reason_snapshot'), 'SELECT 1', 'ALTER TABLE appointments ADD COLUMN cancellation_reason_snapshot VARCHAR(120) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='appointments' AND COLUMN_NAME='cancellation_details'), 'SELECT 1', 'ALTER TABLE appointments ADD COLUMN cancellation_details VARCHAR(500) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='appointments' AND COLUMN_NAME='cancelled_by_role'), 'SELECT 1', 'ALTER TABLE appointments ADD COLUMN cancelled_by_role VARCHAR(20) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='appointments' AND COLUMN_NAME='cancelled_by_user_id'), 'SELECT 1', 'ALTER TABLE appointments ADD COLUMN cancelled_by_user_id INT NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='appointments' AND COLUMN_NAME='cancelled_at'), 'SELECT 1', 'ALTER TABLE appointments ADD COLUMN cancelled_at DATETIME NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=@schema_name AND TABLE_NAME='appointments' AND CONSTRAINT_NAME='fk_appointments_cancellation_reason' AND CONSTRAINT_TYPE='FOREIGN KEY'),
  'SELECT 1',
  'ALTER TABLE appointments ADD CONSTRAINT fk_appointments_cancellation_reason FOREIGN KEY (cancellation_reason_id) REFERENCES appointment_cancellation_reasons(id) ON DELETE SET NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
