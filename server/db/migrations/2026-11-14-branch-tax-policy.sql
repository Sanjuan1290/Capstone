-- Disabled until an authorized administrator explicitly configures this branch.
CREATE TABLE IF NOT EXISTS branch_billing_settings (
 branch_id INT NOT NULL PRIMARY KEY,
 policy_json JSON NOT NULL,
 version INT NOT NULL DEFAULT 1,
 updated_by_admin_id INT NOT NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
