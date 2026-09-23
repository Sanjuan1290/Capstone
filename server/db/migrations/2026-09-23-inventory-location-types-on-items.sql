-- CARAIT Clinic - assign a configured Location Type directly to each inventory item.
-- This migration is idempotent when applied through server/utils/schema.js.
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
    SELECT 1
    FROM information_schema.COLUMNS
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
    SELECT 1
    FROM information_schema.STATISTICS
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

DROP PROCEDURE IF EXISTS carait_add_fk_if_missing$$
CREATE PROCEDURE carait_add_fk_if_missing(
  IN p_table VARCHAR(64),
  IN p_constraint VARCHAR(64),
  IN p_sql TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND CONSTRAINT_NAME = p_constraint
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ) THEN
    SET @sql = p_sql;
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

CALL carait_add_column_if_missing('inventory', 'location_type_id', 'INT NULL AFTER storage_location')$$
CALL carait_add_index_if_missing('inventory', 'idx_inventory_location_type_id', '`location_type_id`')$$
CALL carait_add_fk_if_missing(
  'inventory',
  'fk_inventory_location_type',
  'ALTER TABLE `inventory` ADD CONSTRAINT `fk_inventory_location_type` FOREIGN KEY (`location_type_id`) REFERENCES `inventory_location_types` (`id`) ON DELETE SET NULL ON UPDATE CASCADE'
)$$

DROP PROCEDURE IF EXISTS carait_add_column_if_missing$$
DROP PROCEDURE IF EXISTS carait_add_index_if_missing$$
DROP PROCEDURE IF EXISTS carait_add_fk_if_missing$$

DELIMITER ;

-- No default Location Types or Units of Measure are inserted here.
-- Administrators must configure them before creating new inventory items.
