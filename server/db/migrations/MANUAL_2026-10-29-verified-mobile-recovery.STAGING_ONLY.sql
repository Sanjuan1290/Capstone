-- First apply to staging. Existing numbers MUST NOT be marked verified automatically.
ALTER TABLE `admins` ADD COLUMN `phone_verified_at` DATETIME NULL DEFAULT NULL;
ALTER TABLE `staff` ADD COLUMN `phone_verified_at` DATETIME NULL DEFAULT NULL;
ALTER TABLE `doctors` ADD COLUMN `phone_verified_at` DATETIME NULL DEFAULT NULL;
-- All three roles must verify their own registered number under Account Security
-- before mobile password recovery will deliver an SMS.
