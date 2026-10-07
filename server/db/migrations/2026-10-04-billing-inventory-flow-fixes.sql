-- CARAIT flow fixes (2026-10-04)
-- The server applies these changes automatically on start (utils/schemaFlowFixes20261004.js,
-- called from ensureAppSchema). This file is the same change as plain SQL for a manual
-- MySQL 8 run. Statements are written to be safe to re-run.
--
-- What it adds:
--   1. inventory_locations.is_main_stockroom / clinic_type  (locations resolved by role, not name)
--   2. inventory_location_batches location FK: ON DELETE RESTRICT (was CASCADE)
--   3. inventory_logs.doctor_id                              (who consumed clinical stock)
--   4. billing_receipt_sequence                              (sequential official receipt numbers)
--   5. billing_payment_refunds + backfill                    (each refund dated on its own day)
--   6. billing_payments.voided_by_admin_id
--   7. billing_records void / reopen audit columns
--   8. billing_item_batch_usage return columns, consultation usage returned_quantity
--   9. cashier_closings: cashier_role and summary columns, unique key per role

SET @db = DATABASE();

DROP PROCEDURE IF EXISTS carait_add_column;
DELIMITER //
CREATE PROCEDURE carait_add_column(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_definition TEXT)
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table)
     AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

-- 1. Role-based locations
CALL carait_add_column('inventory_locations', 'is_main_stockroom', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL carait_add_column('inventory_locations', 'clinic_type', 'VARCHAR(20) NULL');

UPDATE inventory_locations l
JOIN (
  SELECT id FROM inventory_locations
  WHERE COALESCE(is_active,1)=1 AND (name = 'Main Stockroom' OR location_type = 'stockroom')
  ORDER BY (name = 'Main Stockroom') DESC, id ASC LIMIT 1
) pick ON pick.id = l.id
SET l.is_main_stockroom = 1
WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM inventory_locations WHERE is_main_stockroom = 1) flagged);

UPDATE inventory_locations SET clinic_type = 'derma'
WHERE name = 'Dermatology Room' AND clinic_type IS NULL
  AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM inventory_locations WHERE clinic_type = 'derma') x);
UPDATE inventory_locations SET clinic_type = 'medical'
WHERE name = 'General Medicine Room' AND clinic_type IS NULL
  AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM inventory_locations WHERE clinic_type = 'medical') x);

-- 2. Deleting a location must not silently delete its batch balances
SET @rule = (SELECT DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'inventory_location_batches'
               AND CONSTRAINT_NAME = 'fk_inventory_location_batches_location');
SET @ddl = IF(@rule = 'CASCADE', 'ALTER TABLE inventory_location_batches DROP FOREIGN KEY fk_inventory_location_batches_location', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF(@rule = 'CASCADE', 'ALTER TABLE inventory_location_batches ADD CONSTRAINT fk_inventory_location_batches_location FOREIGN KEY (location_id) REFERENCES inventory_locations(id) ON DELETE RESTRICT', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Clinical-use actor
CALL carait_add_column('inventory_logs', 'doctor_id', 'INT NULL');

-- 4. Sequential receipt numbers (set last_number to your last issued OR number if continuing a series)
CREATE TABLE IF NOT EXISTS billing_receipt_sequence (
  id TINYINT NOT NULL PRIMARY KEY,
  last_number BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT IGNORE INTO billing_receipt_sequence (id, last_number) VALUES (1, 0);

-- 5. Refund ledger
CREATE TABLE IF NOT EXISTS billing_payment_refunds (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  payment_id INT NOT NULL,
  billing_id INT NOT NULL,
  payment_method VARCHAR(30) NULL,
  amount DECIMAL(10,2) NOT NULL,
  reason TEXT NULL,
  refunded_by_admin_id INT NULL,
  refunded_at DATETIME NOT NULL,
  is_backfilled TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_billing_refunds_date (refunded_at),
  INDEX idx_billing_refunds_payment (payment_id),
  INDEX idx_billing_refunds_bill (billing_id)
);
INSERT INTO billing_payment_refunds (payment_id, billing_id, payment_method, amount, reason, refunded_by_admin_id, refunded_at, is_backfilled)
SELECT bp.id, bp.billing_id, bp.payment_method, bp.refund_amount, bp.refund_reason, bp.refunded_by_admin_id, COALESCE(bp.refunded_at, bp.paid_at), 1
FROM billing_payments bp
WHERE COALESCE(bp.refund_amount,0) > 0
  AND NOT EXISTS (SELECT 1 FROM billing_payment_refunds r WHERE r.payment_id = bp.id);

-- 6-8. Void / reopen / return tracking
CALL carait_add_column('billing_payments', 'voided_by_admin_id', 'INT NULL');
CALL carait_add_column('billing_records', 'voided_by_admin_id', 'INT NULL');
CALL carait_add_column('billing_records', 'reopened_at', 'DATETIME NULL');
CALL carait_add_column('billing_records', 'reopened_by_admin_id', 'INT NULL');
CALL carait_add_column('billing_records', 'reopen_reason', 'TEXT NULL');
CALL carait_add_column('billing_records', 'reopen_count', 'INT NOT NULL DEFAULT 0');
CALL carait_add_column('billing_item_batch_usage', 'returned_at', 'DATETIME NULL');
CALL carait_add_column('billing_item_batch_usage', 'returned_by_admin_id', 'INT NULL');
CALL carait_add_column('billing_item_batch_usage', 'return_reason', 'VARCHAR(255) NULL');
CALL carait_add_column('consultation_inventory_usage_batches', 'returned_quantity', 'DECIMAL(12,4) NOT NULL DEFAULT 0.0000');
CALL carait_add_column('consultation_inventory_usage_batches', 'last_returned_at', 'DATETIME NULL');

-- 9. Cashier closing per cashier role
CALL carait_add_column('cashier_closings', 'cashier_role', "VARCHAR(10) NOT NULL DEFAULT 'staff'");
CALL carait_add_column('cashier_closings', 'cash_refunds', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00');
CALL carait_add_column('cashier_closings', 'non_cash_collected', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00');
CALL carait_add_column('cashier_closings', 'transaction_count', 'INT NOT NULL DEFAULT 0');
SET @cols = (SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cashier_closings' AND INDEX_NAME = 'uniq_cashier_closing');
SET @ddl = IF(@cols IS NOT NULL AND @cols <> 'cashier_role,staff_id,closing_date',
  'ALTER TABLE cashier_closings DROP INDEX uniq_cashier_closing, ADD UNIQUE KEY uniq_cashier_closing (cashier_role, staff_id, closing_date)',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP PROCEDURE IF EXISTS carait_add_column;
