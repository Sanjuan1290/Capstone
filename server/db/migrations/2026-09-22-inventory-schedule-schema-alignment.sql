-- CARAIT inventory simplification + 24-hour doctor scheduling + schema alignment
-- 2026-09-22
-- Safe to run on the supplied Dump20260922 database. Back up first.

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

CALL carait_add_column_if_missing('doctor_schedules','spans_next_day','TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active')$$
CALL carait_add_column_if_missing('doctor_schedules','is_24_hours','TINYINT(1) NOT NULL DEFAULT 0 AFTER spans_next_day')$$
CALL carait_add_column_if_missing('audit_logs','archive_id','BIGINT NULL AFTER created_at')$$
CALL carait_add_column_if_missing('audit_logs','archived_at','DATETIME NULL AFTER archive_id')$$
CALL carait_add_index_if_missing('audit_logs','idx_audit_archive_created','`archive_id`,`created_at`')$$

DROP PROCEDURE IF EXISTS carait_add_column_if_missing$$
DROP PROCEDURE IF EXISTS carait_add_index_if_missing$$
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

