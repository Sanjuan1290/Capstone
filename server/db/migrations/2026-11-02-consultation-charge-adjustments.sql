-- Run after a verified backup on TiDB staging, then production.
-- Patient-specific monetary adjustments never alter inventory movement rows.
CREATE TABLE IF NOT EXISTS billing_charge_adjustments (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  billing_id INT NOT NULL,
  bill_version INT NOT NULL,
  target_type VARCHAR(24) NOT NULL,
  catalog_service_id INT NOT NULL,
  inventory_id INT NULL,
  requested_amount DECIMAL(10,2) NOT NULL,
  original_charge_snapshot DECIMAL(10,2) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  requester_role VARCHAR(20) NOT NULL,
  requester_user_id INT NOT NULL,
  approved_by_admin_id INT NULL,
  admin_note VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  INDEX idx_charge_adj_bill (branch_id,billing_id,status),
  INDEX idx_charge_adj_target (billing_id,target_type,catalog_service_id,inventory_id),
  CONSTRAINT fk_charge_adjust_bill FOREIGN KEY (billing_id) REFERENCES billing_records(id) ON DELETE RESTRICT
);
