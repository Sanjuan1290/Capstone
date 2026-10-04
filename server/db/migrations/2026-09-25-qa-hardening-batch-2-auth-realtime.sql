-- CARAIT QA Hardening Batch 2: Auth / OTP / Realtime Security
-- Safe to run after Batch 1. Back up the database before production deployment.

SET @schema_name = DATABASE();

-- Expired security codes do not need to survive this migration.
DELETE FROM account_security_codes WHERE expires_at <= NOW();

-- Older schema allowed only one security code per account, which meant a password
-- OTP could invalidate an unrelated batch/settings OTP. Replace that uniqueness
-- rule with one active code per account + purpose.
SET @has_old_security_unique = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'account_security_codes'
    AND index_name = 'uniq_account_security_code'
);
SET @sql = IF(
  @has_old_security_unique > 0,
  'ALTER TABLE account_security_codes DROP INDEX uniq_account_security_code',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_purpose_security_unique = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'account_security_codes'
    AND index_name = 'uniq_account_security_code_purpose'
);
SET @sql = IF(
  @has_purpose_security_unique = 0,
  'ALTER TABLE account_security_codes ADD UNIQUE KEY uniq_account_security_code_purpose (role, account_id, purpose)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Ensure the verified-channel fields used by secure patient login/recovery exist
-- even if Batch 1 was partially applied.
SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='patients' AND column_name='email_verified_at'),
  'SELECT 1',
  'ALTER TABLE patients ADD COLUMN email_verified_at DATETIME NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='patients' AND column_name='phone_verified_at'),
  'SELECT 1',
  'ALTER TABLE patients ADD COLUMN phone_verified_at DATETIME NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
