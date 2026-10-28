-- CARAIT Clinic — administrator contact number (safe on the existing multi-branch DB).
-- Run once on existing databases before using the new Admin creation form.
USE `carait_clinic_system`;
SET @add_phone = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='admins' AND COLUMN_NAME='phone'),
  'SELECT 1',
  'ALTER TABLE `admins` ADD COLUMN `phone` VARCHAR(30) NULL'
);
PREPARE stmt FROM @add_phone;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
