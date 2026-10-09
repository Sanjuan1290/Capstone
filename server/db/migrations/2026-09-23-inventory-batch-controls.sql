-- CARAIT Clinic - protected inventory batch correction/archive controls
-- Run after backing up the database. The runtime schema verifier applies the same columns idempotently.
USE `carait_clinic_system`;

DELIMITER $$
DROP PROCEDURE IF EXISTS carait_add_column_if_missing$$
CREATE PROCEDURE carait_add_column_if_missing(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DROP PROCEDURE IF EXISTS carait_add_index_if_missing$$
CREATE PROCEDURE carait_add_index_if_missing(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64),
  IN p_columns TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND INDEX_NAME = p_index
  ) THEN
    SET @sql = CONCAT('CREATE INDEX `', p_index, '` ON `', p_table, '` (', p_columns, ')');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

CALL carait_add_column_if_missing('inventory_batches','unit_cost','DECIMAL(10,2) NOT NULL DEFAULT 0.00');
CALL carait_add_column_if_missing('inventory_batches','archived_at','DATETIME NULL');
CALL carait_add_column_if_missing('inventory_batches','archived_by_admin_id','INT NULL');
CALL carait_add_column_if_missing('inventory_batches','archive_reason','VARCHAR(255) NULL');
CALL carait_add_index_if_missing('inventory_batches','idx_inventory_batches_archived','`inventory_id`,`archived_at`');

DROP PROCEDURE IF EXISTS carait_add_column_if_missing$$
DROP PROCEDURE IF EXISTS carait_add_index_if_missing$$
DELIMITER ;

-- Verification
SELECT id, inventory_id, batch_code, quantity, expiration_date, unit_cost,
       archived_at, archived_by_admin_id, archive_reason
FROM inventory_batches
ORDER BY inventory_id, id;

