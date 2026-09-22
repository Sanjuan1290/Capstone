-- CARAIT current-codebase reconciliation (2026-09-22)
-- Idempotent MySQL 8 migration for the 2026-09-22 source + database snapshot.
-- Back up the database before applying. `npm run migrate` applies the same runtime
-- schema through server/utils/schema.js; this SQL exists for explicit/manual deployment.

DELIMITER $$

DROP PROCEDURE IF EXISTS carait_add_column_if_missing$$
CREATE PROCEDURE carait_add_column_if_missing(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_definition TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$

DROP PROCEDURE IF EXISTS carait_add_index_if_missing$$
CREATE PROCEDURE carait_add_index_if_missing(IN p_table VARCHAR(64), IN p_index VARCHAR(64), IN p_columns TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_index
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` (', p_columns, ')');
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$

DROP PROCEDURE IF EXISTS carait_add_fk_if_missing$$
CREATE PROCEDURE carait_add_fk_if_missing(IN p_table VARCHAR(64), IN p_constraint VARCHAR(64), IN p_definition TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND CONSTRAINT_NAME = p_constraint
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD CONSTRAINT `', p_constraint, '` ', p_definition);
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$


-- Supplier directory fields used by System Setup and inventory selection.
CREATE TABLE IF NOT EXISTS inventory_suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  contact_person VARCHAR(160) NULL,
  contact_number VARCHAR(80) NULL,
  address VARCHAR(255) NULL,
  category VARCHAR(20) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_inventory_supplier_category_name (category, name),
  INDEX idx_inventory_suppliers_active (category, is_active, name)
)$$
CALL carait_add_column_if_missing('inventory_suppliers','contact_person','VARCHAR(160) NULL')$$
CALL carait_add_column_if_missing('inventory_suppliers','contact_number','VARCHAR(80) NULL')$$
CALL carait_add_column_if_missing('inventory_suppliers','address','VARCHAR(255) NULL')$$

-- Doctor schedule: normal hours, overnight hours, or a full 24-hour day.
CALL carait_add_column_if_missing('doctor_schedules','spans_next_day','TINYINT(1) NOT NULL DEFAULT 0')$$
CALL carait_add_column_if_missing('doctor_schedules','is_24_hours','TINYINT(1) NOT NULL DEFAULT 0')$$

-- Audit archive/runtime support used by Admin Audit Logs.
CALL carait_add_column_if_missing('audit_logs','archive_id','BIGINT NULL')$$
CALL carait_add_column_if_missing('audit_logs','archived_at','DATETIME NULL')$$
CALL carait_add_index_if_missing('audit_logs','idx_audit_archive_created','`archive_id`,`created_at`')$$

-- Billing/cost fields expected by the current billing implementation.
CALL carait_add_column_if_missing('billing_service_materials','bundled_in_service_price','TINYINT(1) NOT NULL DEFAULT 1')$$
CALL carait_add_column_if_missing('billing_service_materials','cost_snapshot','DECIMAL(10,2) NULL')$$
CALL carait_add_column_if_missing('billing_items','unit_cost_snapshot','DECIMAL(10,2) NOT NULL DEFAULT 0.00')$$
CALL carait_add_column_if_missing('billing_items','cost_total_snapshot','DECIMAL(10,2) NOT NULL DEFAULT 0.00')$$
CALL carait_add_column_if_missing('inventory_batches','unit_cost','DECIMAL(10,2) NOT NULL DEFAULT 0.00')$$
CALL carait_add_column_if_missing('billing_records','finalized_by_admin_id','INT NULL')$$
CALL carait_add_column_if_missing('billing_records','confirmed_by_admin_id','INT NULL')$$
CALL carait_add_column_if_missing('billing_payments','received_by_admin_id','INT NULL')$$

DROP PROCEDURE IF EXISTS carait_add_column_if_missing$$
DROP PROCEDURE IF EXISTS carait_add_index_if_missing$$
DROP PROCEDURE IF EXISTS carait_add_fk_if_missing$$
DELIMITER ;

CREATE TABLE IF NOT EXISTS audit_log_archives (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  archive_code VARCHAR(40) NOT NULL,
  cutoff_at DATETIME NOT NULL,
  log_count INT NOT NULL DEFAULT 0,
  archived_by_admin_id INT NULL,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  delete_reason VARCHAR(255) NULL,
  UNIQUE KEY uniq_audit_archive_code (archive_code),
  INDEX idx_audit_archive_created (archived_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS inventory_location_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  code VARCHAR(40) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_inventory_location_type_name (name),
  UNIQUE KEY uniq_inventory_location_type_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO inventory_location_types (name,code,sort_order) VALUES
  ('Main Stockroom','stockroom',10),
  ('Treatment Room','room',20),
  ('Dispensing Area','dispensing',30),
  ('General Storage','storage',40);

-- Repair the known legacy duplicate-location allocation only when it is safe to infer
-- the original location from stock-in history and the batch has no transfer history.
DROP TEMPORARY TABLE IF EXISTS carait_legacy_batch_allocation_repair;
CREATE TEMPORARY TABLE carait_legacy_batch_allocation_repair AS
SELECT b.id AS batch_id, b.inventory_id, b.quantity,
       dest.target_location_id
FROM inventory_batches b
JOIN (
  SELECT batch_id, SUM(quantity) AS allocated_quantity
  FROM inventory_location_batches
  GROUP BY batch_id
) alloc ON alloc.batch_id = b.id
JOIN (
  SELECT l.batch_id,
         MIN(il.id) AS target_location_id,
         COUNT(DISTINCT il.id) AS destination_count
  FROM inventory_logs l
  JOIN inventory_locations il ON il.name = l.to_location
  WHERE l.type = 'in'
    AND l.batch_id IS NOT NULL
    AND l.to_location IS NOT NULL
  GROUP BY l.batch_id
) dest ON dest.batch_id = b.id AND dest.destination_count = 1
LEFT JOIN (
  SELECT batch_id, COUNT(*) AS transfer_count
  FROM inventory_transfer_batches
  GROUP BY batch_id
) transferred ON transferred.batch_id = b.id
WHERE alloc.allocated_quantity > b.quantity + 0.0001
  AND COALESCE(transferred.transfer_count, 0) = 0;

UPDATE inventory_location_batches ilb
JOIN carait_legacy_batch_allocation_repair repair ON repair.batch_id = ilb.batch_id
SET ilb.quantity = CASE WHEN ilb.location_id = repair.target_location_id THEN repair.quantity ELSE 0 END;

DELETE ilb
FROM inventory_location_batches ilb
JOIN carait_legacy_batch_allocation_repair repair ON repair.batch_id = ilb.batch_id
WHERE ilb.quantity <= 0;

DROP TEMPORARY TABLE IF EXISTS carait_legacy_batch_allocation_repair;

-- Rebuild the compatibility location totals from the authoritative per-batch balances.
DELETE FROM inventory_location_stock;
INSERT INTO inventory_location_stock (location_id, inventory_id, quantity)
SELECT location_id, inventory_id, SUM(quantity)
FROM inventory_location_batches
WHERE quantity > 0
GROUP BY location_id, inventory_id;

CREATE TABLE IF NOT EXISTS billing_service_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  clinic_type ENUM('medical','derma') NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_billing_service_category (clinic_type, name),
  INDEX idx_billing_service_category_active (clinic_type, is_active, sort_order, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO billing_service_categories (name, clinic_type, sort_order) VALUES
  ('Consultation', 'medical', 10),
  ('Vaccination & Immunization', 'medical', 20),
  ('Minor Procedures', 'medical', 30),
  ('Diagnostic / Assessment', 'medical', 40),
  ('Other Medical Services', 'medical', 50),
  ('Dermatology Consultation', 'derma', 10),
  ('Dermatologic Procedures', 'derma', 20),
  ('Laser & Light Treatments', 'derma', 30),
  ('Aesthetic Treatments', 'derma', 40),
  ('Skin Tests / Biopsy', 'derma', 50);

-- category_id is part of the current Service Catalog model.
DELIMITER $$
DROP PROCEDURE IF EXISTS carait_add_column_if_missing$$
CREATE PROCEDURE carait_add_column_if_missing(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_definition TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
DROP PROCEDURE IF EXISTS carait_add_index_if_missing$$
CREATE PROCEDURE carait_add_index_if_missing(IN p_table VARCHAR(64), IN p_index VARCHAR(64), IN p_columns TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_index
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` (', p_columns, ')');
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
DROP PROCEDURE IF EXISTS carait_add_fk_if_missing$$
CREATE PROCEDURE carait_add_fk_if_missing(IN p_table VARCHAR(64), IN p_constraint VARCHAR(64), IN p_definition TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND CONSTRAINT_NAME = p_constraint AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD CONSTRAINT `', p_constraint, '` ', p_definition);
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$

CALL carait_add_column_if_missing('billing_service_catalog','category_id','INT NULL AFTER id')$$
CALL carait_add_index_if_missing('billing_service_catalog','idx_billing_service_category_id','`category_id`')$$
CALL carait_add_fk_if_missing('billing_service_catalog','fk_billing_service_category','FOREIGN KEY (`category_id`) REFERENCES `billing_service_categories` (`id`) ON DELETE SET NULL')$$

DROP PROCEDURE IF EXISTS carait_add_column_if_missing$$
DROP PROCEDURE IF EXISTS carait_add_index_if_missing$$
DROP PROCEDURE IF EXISTS carait_add_fk_if_missing$$
DELIMITER ;

-- Preserve any category names that already existed before editable categories.
INSERT IGNORE INTO billing_service_categories (name, clinic_type, sort_order)
SELECT DISTINCT TRIM(category), clinic_type, 100
FROM billing_service_catalog
WHERE TRIM(COALESCE(category,'')) <> ''
  AND clinic_type IN ('medical','derma');

UPDATE billing_service_catalog bsc
JOIN billing_service_categories bcat
  ON bcat.clinic_type = bsc.clinic_type
 AND bcat.name = bsc.category
SET bsc.category_id = bcat.id
WHERE bsc.category_id IS NULL;
