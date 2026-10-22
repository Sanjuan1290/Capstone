-- OPTIONAL MANUAL MIGRATION. Run ONLY if these columns do not yet exist.
-- Preferred: npm run migrate (ensureAppSchema adds missing columns idempotently).
-- Non-destructive: existing admins default to zero; only new invitation accounts require a change.
ALTER TABLE admins ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE admins ADD COLUMN password_changed_at DATETIME NULL;

