-- Patient phone-first authentication and profile completion changes.
-- Apply on top of the existing Carait Clinic schema.

ALTER TABLE patients
  MODIFY COLUMN sex ENUM('Male','Female','Other') NULL;

SET @sql = IF(
  (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'patients'
      AND COLUMN_NAME = 'gender'
  ) = 0,
  "ALTER TABLE patients ADD COLUMN gender ENUM('Male','Female','Other') NULL AFTER birthdate",
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'patients'
      AND COLUMN_NAME = 'receive_promotions'
  ) = 0,
  'ALTER TABLE patients ADD COLUMN receive_promotions TINYINT(1) NOT NULL DEFAULT 0 AFTER consent_given_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'patients'
      AND COLUMN_NAME = 'is_profile_complete'
  ) = 0,
  'ALTER TABLE patients ADD COLUMN is_profile_complete TINYINT(1) NOT NULL DEFAULT 0 AFTER receive_promotions',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS patient_phone_verifications (
  id INT NOT NULL AUTO_INCREMENT,
  phone VARCHAR(20) NOT NULL,
  otp_code VARCHAR(6) NOT NULL,
  payload JSON NOT NULL,
  expires_at DATETIME NOT NULL,
  verified_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_patient_phone_verifications_phone (phone)
);

-- Recommended before enforcing a unique patient phone constraint:
-- 1. Review duplicates first:
--    SELECT phone, COUNT(*) FROM patients GROUP BY phone HAVING COUNT(*) > 1;
-- 2. After cleanup, enforce uniqueness:
--    ALTER TABLE patients ADD UNIQUE KEY uniq_patients_phone (phone);
