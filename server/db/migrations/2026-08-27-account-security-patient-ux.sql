-- Account security + patient onboarding upgrade
ALTER TABLE staff ADD COLUMN IF NOT EXISTS must_change_password TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS password_changed_at DATETIME NULL;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS must_change_password TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS password_changed_at DATETIME NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS onboarding_completed_at DATETIME NULL;

CREATE TABLE IF NOT EXISTS account_security_codes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  role VARCHAR(20) NOT NULL,
  account_id INT NOT NULL,
  code VARCHAR(10) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_account_security_code (role, account_id),
  INDEX idx_security_code_lookup (role, account_id, code, expires_at)
);
