-- CARAIT Clinic — Appointment Scheduling All Batches
-- Cumulative migration for Batches 1-4/5.
-- Safe to run on MySQL 8.0 against the current CARAIT schema.
--
-- Includes:
-- 1) Service Average Duration (15-minute increments, max 8 hours)
-- 2) Appointment duration snapshots
-- 3) Pending online confirmation deadlines / rejected status
-- 4) Booking policy settings (120-minute notice, 60-minute cutoff, 30-minute starts)

SET @schema_name = DATABASE();

-- Batch 1: Service duration foundation.
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
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE billing_service_catalog
SET average_duration_minutes = 60
WHERE average_duration_minutes IS NULL
   OR average_duration_minutes < 15
   OR average_duration_minutes > 480
   OR MOD(average_duration_minutes, 15) <> 0;

-- Batch 2: Duration snapshots.
SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='appointments' AND COLUMN_NAME='requested_service_duration_minutes_snapshot'),
  'SELECT 1',
  'ALTER TABLE appointments ADD COLUMN requested_service_duration_minutes_snapshot INT NULL AFTER requested_service_price_snapshot'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='appointments' AND COLUMN_NAME='reserved_duration_minutes_snapshot'),
  'SELECT 1',
  'ALTER TABLE appointments ADD COLUMN reserved_duration_minutes_snapshot INT NULL AFTER requested_service_duration_minutes_snapshot'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE appointments a
LEFT JOIN billing_service_catalog bsc ON bsc.id = a.requested_service_id
SET a.requested_service_duration_minutes_snapshot = COALESCE(NULLIF(a.requested_service_duration_minutes_snapshot,0), bsc.average_duration_minutes, 60),
    a.reserved_duration_minutes_snapshot = COALESCE(NULLIF(a.reserved_duration_minutes_snapshot,0), CEIL(COALESCE(NULLIF(a.requested_service_duration_minutes_snapshot,0), bsc.average_duration_minutes, 60) / 30) * 30)
WHERE a.requested_service_duration_minutes_snapshot IS NULL
   OR a.requested_service_duration_minutes_snapshot <= 0
   OR a.reserved_duration_minutes_snapshot IS NULL
   OR a.reserved_duration_minutes_snapshot <= 0;

-- Batch 3: Pending confirmation deadline + rejection lifecycle.
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

