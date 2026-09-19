-- Account security + patient onboarding upgrade (MySQL 8.0, run once).
-- For partially migrated databases, prefer `npm run migrate`, which is idempotent.

ALTER TABLE staff
  ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN password_changed_at DATETIME NULL,
  ADD COLUMN session_version INT NOT NULL DEFAULT 1;

ALTER TABLE doctors
  ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN password_changed_at DATETIME NULL,
  ADD COLUMN session_version INT NOT NULL DEFAULT 1;

ALTER TABLE patients
  ADD COLUMN onboarding_completed_at DATETIME NULL,
  ADD COLUMN session_version INT NOT NULL DEFAULT 1;

ALTER TABLE admins
  ADD COLUMN session_version INT NOT NULL DEFAULT 1;

CREATE TABLE account_security_codes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  role VARCHAR(20) NOT NULL,
  account_id INT NOT NULL,
  purpose VARCHAR(40) NOT NULL DEFAULT 'password_change',
  code VARCHAR(128) NOT NULL,
  payload TEXT NULL,
  expires_at DATETIME NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  last_sent_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_account_security_code (role, account_id),
  INDEX idx_security_code_lookup (role, account_id, purpose, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE patient_phone_verifications
  ADD COLUMN attempt_count INT NOT NULL DEFAULT 0,
  ADD COLUMN last_sent_at DATETIME NULL;

ALTER TABLE password_resets
  ADD COLUMN attempt_count INT NOT NULL DEFAULT 0,
  ADD COLUMN last_sent_at DATETIME NULL,
  ADD COLUMN verified_at DATETIME NULL;
