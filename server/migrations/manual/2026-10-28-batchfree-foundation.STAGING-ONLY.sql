-- CARAIT batch-free inventory: ADDITIVE FOUNDATION. STAGING ONLY.
-- DO NOT RUN ON PRODUCTION. Requires backup, inventory reconciliation,
-- documented medicine expiry mapping, full workflow rewiring, and approval.
-- Apply using controlled TiDB staging only. No batch table is dropped/rewritten.
-- Run each ALTER independently (TiDB DDL incompatibility with grouped changes).
CREATE TABLE IF NOT EXISTS inventory_stock_mode (
  id TINYINT NOT NULL PRIMARY KEY,
  mode VARCHAR(20) NOT NULL DEFAULT 'batch',
  cutover_verified_at DATETIME NULL,
  reconciliation_reference VARCHAR(120) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT IGNORE INTO inventory_stock_mode (id, mode) VALUES (1, 'batch');
CREATE TABLE IF NOT EXISTS inventory_stock_movements (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  inventory_id INT NOT NULL,
  movement_type VARCHAR(32) NOT NULL,
  source_location_id INT NULL,
  destination_location_id INT NULL,
  quantity_stock DECIMAL(16,4) NOT NULL,
  quantity_base DECIMAL(16,4) NOT NULL,
  reason_code VARCHAR(255) NOT NULL,
  reference_type VARCHAR(80) NULL,
  reference_id VARCHAR(120) NULL,
  actor_role VARCHAR(32) NOT NULL,
  actor_id INT NOT NULL,
  idempotency_key VARCHAR(120) NOT NULL,
  before_source DECIMAL(16,4) NULL,
  after_source DECIMAL(16,4) NULL,
  before_destination DECIMAL(16,4) NULL,
  after_destination DECIMAL(16,4) NULL,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_stock_movement_idempotency (idempotency_key),
  KEY idx_stock_movement_item (branch_id,inventory_id,created_at),
  KEY idx_stock_movement_reference (reference_type,reference_id)
);
-- Staging-only precision upgrade. Run each statement separately in TiDB SQL Editor
-- after backup and preflight. Skip if already equivalent, do not combine ALTERs.
ALTER TABLE inventory_location_stock MODIFY COLUMN quantity DECIMAL(16,4) NOT NULL DEFAULT 0.0000;
ALTER TABLE inventory MODIFY COLUMN stock DECIMAL(16,4) NOT NULL DEFAULT 0.0000;
ALTER TABLE inventory MODIFY COLUMN stock_base DECIMAL(16,4) NOT NULL DEFAULT 0.0000;
-- DO NOT set mode='location' yet. An independent cutover script must verify
-- physical balances, all clinical/billing writers, expiry, and ledger opening.

-- Medicine per-location eligibility: NONE are automatically marked available.
-- After physically verified stock/expiry reconciliation, explicitly approve
-- eligibility='available', verified_expiry=future date for each location.
CREATE TABLE IF NOT EXISTS inventory_stock_eligibility (
  inventory_id INT NOT NULL,
  location_id INT NOT NULL,
  eligibility VARCHAR(20) NOT NULL DEFAULT 'blocked',
  verified_expiry DATE NULL,
  verified_by_role VARCHAR(20) NULL,
  verified_by_id INT NULL,
  verification_ref VARCHAR(120) NULL,
  verified_at DATETIME NULL,
  PRIMARY KEY (inventory_id,location_id)
);
