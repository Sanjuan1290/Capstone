-- Fix 7: an audit-safe record of each Excel upload, used for guarded Undo.
-- Existing inventory, payments, consultations and migration history are untouched.
CREATE TABLE IF NOT EXISTS inventory_excel_uploads (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  upload_type VARCHAR(30) NOT NULL,
  changes_json LONGTEXT NOT NULL,
  created_by_admin_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  undone_at DATETIME NULL,
  undone_by_admin_id INT NULL,
  undo_reason VARCHAR(255) NULL,
  KEY idx_excel_uploads_branch (branch_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
