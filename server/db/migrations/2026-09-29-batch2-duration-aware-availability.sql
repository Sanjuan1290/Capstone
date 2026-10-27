-- CARAIT Clinic — Batch 2
-- Duration-aware appointment availability, 30-minute booking starts,
-- and a 2-hour minimum notice for Patient Portal bookings.
-- Safe to run more than once on MySQL 8.0.

SET @schema_name = DATABASE();

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

-- Preserve the service duration at booking time. Legacy appointments use their
-- linked service duration when available, otherwise fall back to 60 minutes.
UPDATE appointments a
LEFT JOIN billing_service_catalog bsc ON bsc.id = a.requested_service_id
SET a.requested_service_duration_minutes_snapshot = COALESCE(NULLIF(a.requested_service_duration_minutes_snapshot,0), bsc.average_duration_minutes, 60),
    a.reserved_duration_minutes_snapshot = COALESCE(NULLIF(a.reserved_duration_minutes_snapshot,0), CEIL(COALESCE(NULLIF(a.requested_service_duration_minutes_snapshot,0), bsc.average_duration_minutes, 60) / 30) * 30)
WHERE a.requested_service_duration_minutes_snapshot IS NULL
   OR a.requested_service_duration_minutes_snapshot <= 0
   OR a.reserved_duration_minutes_snapshot IS NULL
   OR a.reserved_duration_minutes_snapshot <= 0;
