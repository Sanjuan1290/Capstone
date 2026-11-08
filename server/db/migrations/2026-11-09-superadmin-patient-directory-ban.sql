-- Super Admin patient directory and account-ban support.
-- Run before deploying the matching server code.
-- Existing patient accounts remain active by default.
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS is_banned TINYINT(1) NOT NULL DEFAULT 0 AFTER is_walk_in;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS banned_at DATETIME NULL DEFAULT NULL AFTER is_banned;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS banned_by_admin_id INT NULL DEFAULT NULL AFTER banned_at;

ALTER TABLE patients
  ADD INDEX IF NOT EXISTS idx_patients_directory_status (is_walk_in, is_banned, created_at);
