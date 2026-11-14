ALTER TABLE billing_service_catalog ADD COLUMN doctor_fee_percentage DECIMAL(5,2) NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS billing_financial_snapshots (
 billing_id INT NOT NULL PRIMARY KEY,
 branch_id INT NOT NULL,
 policy_json JSON NULL,
 calculation_json JSON NULL,
 confirmed_at DATETIME NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_financial_snapshot_branch (branch_id,confirmed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
