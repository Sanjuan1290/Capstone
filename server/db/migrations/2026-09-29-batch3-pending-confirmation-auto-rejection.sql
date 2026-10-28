-- CARAIT Clinic — Batch 3
-- Pending online appointment confirmation deadline + automatic rejection.
-- Safe to run more than once on MySQL 8.0.
--
-- Defaults:
--   Minimum Patient online booking notice: 120 minutes
--   Staff confirmation cutoff: 60 minutes before appointment
--   Booking start interval: 30 minutes
--
-- Existing pending appointments are NOT assigned a deadline automatically.
-- Only new Patient online bookings and Patient reschedules receive a deadline,
-- which prevents deployment from unexpectedly rejecting legacy pending requests.

SET @schema_name = DATABASE();

-- Add 'rejected' without keeping appointment status trapped in the old ENUM.
ALTER TABLE appointments MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'pending';

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='appointments' AND COLUMN_NAME='confirmation_deadline_at'),
  'SELECT 1',
  'ALTER TABLE appointments ADD COLUMN confirmation_deadline_at DATETIME NULL AFTER reserved_duration_minutes_snapshot'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='appointments' AND COLUMN_NAME='rejected_at'),
  'SELECT 1',
  'ALTER TABLE appointments ADD COLUMN rejected_at DATETIME NULL AFTER confirmation_deadline_at'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='appointments' AND COLUMN_NAME='rejected_by_role'),
  'SELECT 1',
  'ALTER TABLE appointments ADD COLUMN rejected_by_role VARCHAR(20) NULL AFTER rejected_at'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='appointments' AND COLUMN_NAME='rejection_reason'),
  'SELECT 1',
  'ALTER TABLE appointments ADD COLUMN rejection_reason VARCHAR(120) NULL AFTER rejected_by_role'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS booking_settings (
  id TINYINT NOT NULL PRIMARY KEY,
  online_min_lead_minutes INT NOT NULL DEFAULT 120,
  pending_confirmation_cutoff_minutes INT NOT NULL DEFAULT 60,
  booking_start_interval_minutes INT NOT NULL DEFAULT 30,
  updated_by_role VARCHAR(20) NULL,
  updated_by_user_id INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO booking_settings
  (id, online_min_lead_minutes, pending_confirmation_cutoff_minutes, booking_start_interval_minutes)
VALUES (1, 120, 60, 30)
ON DUPLICATE KEY UPDATE id = id;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='appointments' AND INDEX_NAME='idx_appointments_confirmation_deadline'),
  'SELECT 1',
  'ALTER TABLE appointments ADD INDEX idx_appointments_confirmation_deadline (status, appointment_source, confirmation_deadline_at)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
