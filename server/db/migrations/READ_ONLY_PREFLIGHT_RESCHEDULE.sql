-- Choose staging schema intentionally and confirm current connection.
SELECT DATABASE() AS connected_database;
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='appointments'
  AND COLUMN_NAME IN ('reschedule_requested_at','reschedule_reason',
    'reschedule_details','reschedule_previous_date','reschedule_previous_time')
ORDER BY COLUMN_NAME;
-- Verify whether pending appointments already exist; do not rewrite them.
SELECT status, COUNT(*) AS total
FROM appointments
GROUP BY status ORDER BY status;
