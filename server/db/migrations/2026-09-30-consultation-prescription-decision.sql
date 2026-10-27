-- Consultation prescription decision + compatibility backfill.
-- Safe to run after the appointment-scheduling migrations.

SET @schema_name = DATABASE();

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@schema_name
      AND TABLE_NAME='consultations'
      AND COLUMN_NAME='prescription_status'
  ),
  'SELECT 1',
  "ALTER TABLE consultations ADD COLUMN prescription_status VARCHAR(20) NOT NULL DEFAULT 'not_recorded' AFTER prescription"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE consultations
SET prescription_status = CASE
  WHEN prescription IS NOT NULL
   AND TRIM(prescription) <> ''
   AND (CASE WHEN JSON_VALID(prescription) THEN JSON_LENGTH(prescription) ELSE 0 END) > 0 THEN 'prescribed'
  WHEN status = 'finalized' THEN 'none'
  ELSE 'not_recorded'
END
WHERE prescription_status IS NULL
   OR prescription_status = ''
   OR prescription_status = 'not_recorded'
   OR prescription_status NOT IN ('not_recorded','prescribed','none');

