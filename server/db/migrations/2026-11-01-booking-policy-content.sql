-- Branch-specific patient-facing appointment policy content.
-- Numeric booking limits remain in branch_booking_settings and are not changed here.
CREATE TABLE IF NOT EXISTS branch_booking_policy_documents (
  branch_id INT NOT NULL PRIMARY KEY,
  draft_document LONGTEXT NULL,
  published_document LONGTEXT NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  published_at DATETIME NULL,
  updated_by_admin_id INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_branch_booking_policy_public (is_published, branch_id),
  CONSTRAINT fk_branch_booking_policy_documents_branch
    FOREIGN KEY (branch_id) REFERENCES clinic_branches(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
