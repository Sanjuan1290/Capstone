-- CARAIT CLINIC: non-destructive physical-branch foundation.
-- Use on the ACTUAL `carait_clinic_system` DB, after a verified full backup.
-- DO NOT import the dump itself (which contains DROP TABLE statements) to upgrade a live DB.
USE `carait_clinic_system`;

CREATE TABLE IF NOT EXISTS clinic_branches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(180) NOT NULL,
  address VARCHAR(255) NULL,
  phone VARCHAR(80) NULL,
  email VARCHAR(160) NULL,
  offers_medical TINYINT(1) NOT NULL DEFAULT 1,
  offers_derma TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_branch_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Existing records are assigned to a single known, correctly named placeholder,
-- not a fabricated second physical clinic. Edit the name in Super Admin Branches.
INSERT INTO clinic_branches (id, code, name, address, phone, email)
SELECT 1, 'EXISTING', 'Existing Clinic Branch', address, phone, email
FROM clinic_settings WHERE id = 1
ON DUPLICATE KEY UPDATE id = id;

-- All legacy rows are from the current single-clinic application.
DELIMITER $$
DROP PROCEDURE IF EXISTS carait_branch_column$$
CREATE PROCEDURE carait_branch_column(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_definition TEXT)
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=p_table)
     AND NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=p_table AND COLUMN_NAME=p_column) THEN
    SET @stmt = CONCAT('ALTER TABLE `',p_table,'` ADD COLUMN `',p_column,'` ',p_definition);
    PREPARE migration_stmt FROM @stmt;
    EXECUTE migration_stmt;
    DEALLOCATE PREPARE migration_stmt;
  END IF;
END$$
DROP PROCEDURE IF EXISTS carait_branch_index$$
CREATE PROCEDURE carait_branch_index(IN p_table VARCHAR(64), IN p_index VARCHAR(64), IN p_ddl TEXT)
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=p_table)
     AND NOT EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=p_table AND INDEX_NAME=p_index) THEN
    SET @stmt = p_ddl;
    PREPARE migration_stmt FROM @stmt;
    EXECUTE migration_stmt;
    DEALLOCATE PREPARE migration_stmt;
  END IF;
END$$
DROP PROCEDURE IF EXISTS carait_branch_rekey$$
CREATE PROCEDURE carait_branch_rekey(IN p_table VARCHAR(64), IN p_old_index VARCHAR(64), IN p_new_index VARCHAR(64), IN p_columns TEXT)
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=p_table AND INDEX_NAME=p_old_index)
     AND NOT EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=p_table AND INDEX_NAME=p_new_index) THEN
    SET @stmt = CONCAT('ALTER TABLE `',p_table,'` DROP INDEX `',p_old_index,'`, ADD UNIQUE KEY `',p_new_index,'` (',p_columns,')');
    PREPARE migration_stmt FROM @stmt;
    EXECUTE migration_stmt;
    DEALLOCATE PREPARE migration_stmt;
  END IF;
END$$
DELIMITER ;

CALL carait_branch_column('admins', 'account_role', "VARCHAR(20) NOT NULL DEFAULT 'admin'");
CALL carait_branch_column('admins', 'branch_id', 'INT NULL');
CALL carait_branch_column('admins', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1');
-- Preserve the existing Super Admin account and hash; never reset its password.
UPDATE admins SET account_role='superadmin',branch_id=NULL WHERE id=1;

-- Branch-owned operational data. Historical and financial records remain intact.
CALL carait_branch_column('staff','branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('doctors','branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('appointments','branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('queue','branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('consultations','branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('billing_records','branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('billing_service_catalog','branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('billing_service_categories','branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('appointment_cancellation_reasons','branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('appointment_reason_options','branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('clinic_promotions','branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('inventory','branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('inventory_batches','branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('inventory_locations','branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('inventory_location_types','branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('inventory_logs','branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('inventory_transfers','from_branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('inventory_transfers','to_branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('supply_request_groups','branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('supply_requests','branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('cashier_closings','branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('billing_payment_refunds','branch_id','INT NOT NULL DEFAULT 1');
CALL carait_branch_column('audit_logs','branch_id','INT NULL');
CALL carait_branch_column('notifications','branch_id','INT NOT NULL DEFAULT 1');

UPDATE staff SET branch_id=1 WHERE branch_id IS NULL;
UPDATE doctors SET branch_id=1 WHERE branch_id IS NULL;
UPDATE appointments SET branch_id=1 WHERE branch_id IS NULL;
UPDATE queue SET branch_id=1 WHERE branch_id IS NULL;
UPDATE consultations SET branch_id=1 WHERE branch_id IS NULL;
UPDATE billing_records SET branch_id=1 WHERE branch_id IS NULL;
UPDATE billing_service_catalog SET branch_id=1 WHERE branch_id IS NULL;
UPDATE billing_service_categories SET branch_id=1 WHERE branch_id IS NULL;
UPDATE appointment_cancellation_reasons SET branch_id=1 WHERE branch_id IS NULL;
UPDATE appointment_reason_options SET branch_id=1 WHERE branch_id IS NULL;
UPDATE clinic_promotions SET branch_id=1 WHERE branch_id IS NULL;
UPDATE inventory SET branch_id=1 WHERE branch_id IS NULL;
UPDATE inventory_batches SET branch_id=1 WHERE branch_id IS NULL;
UPDATE inventory_locations SET branch_id=1 WHERE branch_id IS NULL;
UPDATE inventory_location_types SET branch_id=1 WHERE branch_id IS NULL;
UPDATE inventory_logs SET branch_id=1 WHERE branch_id IS NULL;
UPDATE inventory_transfers SET from_branch_id=1 WHERE from_branch_id IS NULL;
UPDATE inventory_transfers SET to_branch_id=1 WHERE to_branch_id IS NULL;
UPDATE supply_request_groups SET branch_id=1 WHERE branch_id IS NULL;
UPDATE supply_requests SET branch_id=1 WHERE branch_id IS NULL;
UPDATE cashier_closings SET branch_id=1 WHERE branch_id IS NULL;
UPDATE billing_payment_refunds SET branch_id=1 WHERE branch_id IS NULL;
UPDATE notifications SET branch_id=1 WHERE branch_id IS NULL;
-- Legacy audit rows remain historical and may be global; do not falsely attribute them to a branch.

CALL carait_branch_index('admins','idx_admin_branch','CREATE INDEX idx_admin_branch ON admins (account_role,branch_id,is_active)');
CALL carait_branch_index('appointments','idx_appt_branch_date','CREATE INDEX idx_appt_branch_date ON appointments (branch_id,appointment_date,status)');
CALL carait_branch_index('billing_records','idx_bill_branch_date','CREATE INDEX idx_bill_branch_date ON billing_records (branch_id,created_at)');
CALL carait_branch_index('doctors','idx_doctor_branch','CREATE INDEX idx_doctor_branch ON doctors (branch_id,is_active)');
CALL carait_branch_index('staff','idx_staff_branch','CREATE INDEX idx_staff_branch ON staff (branch_id,status)');
CALL carait_branch_index('inventory','idx_inventory_branch','CREATE INDEX idx_inventory_branch ON inventory (branch_id,id)');
CALL carait_branch_index('inventory_locations','idx_stockroom_branch','CREATE INDEX idx_stockroom_branch ON inventory_locations (branch_id,id)');
CALL carait_branch_index('billing_service_catalog','idx_service_branch','CREATE INDEX idx_service_branch ON billing_service_catalog (branch_id,is_active,clinic_type)');
CALL carait_branch_index('audit_logs','idx_audit_branch','CREATE INDEX idx_audit_branch ON audit_logs (branch_id,created_at)');

-- Allow the same named service/reason/stockroom to be configured at both branches.
CALL carait_branch_rekey('billing_service_catalog','uniq_billing_service_name','uniq_branch_service_name','branch_id,service_name,clinic_type');
CALL carait_branch_rekey('billing_service_categories','uniq_billing_service_category','uniq_branch_category','branch_id,clinic_type,name');
CALL carait_branch_rekey('appointment_cancellation_reasons','uniq_appointment_cancellation_reason_label','uniq_branch_cancel_reason','branch_id,label');
CALL carait_branch_rekey('appointment_reason_options','uniq_appointment_reason_label','uniq_branch_visit_reason','branch_id,label,clinic_type');
CALL carait_branch_rekey('inventory_locations','uniq_inventory_location_name','uniq_branch_inventory_location','branch_id,name');
CALL carait_branch_rekey('inventory','barcode','uniq_branch_inventory_barcode','branch_id,barcode');
CALL carait_branch_rekey('inventory_location_types','uniq_inventory_location_type_name','uniq_branch_location_type_name','branch_id,name');
CALL carait_branch_rekey('inventory_location_types','uniq_inventory_location_type_code','uniq_branch_location_type_code','branch_id,code');

CREATE TABLE IF NOT EXISTS admin_branch_permissions (
  admin_id INT NOT NULL,
  permission_key VARCHAR(48) NOT NULL,
  granted TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (admin_id,permission_key),
  CONSTRAINT fk_admin_permission_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS branch_booking_settings (
  branch_id INT NOT NULL PRIMARY KEY,
  online_min_lead_minutes INT NOT NULL DEFAULT 720,
  pending_confirmation_cutoff_minutes INT NOT NULL DEFAULT 60,
  booking_start_interval_minutes INT NOT NULL DEFAULT 30,
  no_show_grace_minutes INT NOT NULL DEFAULT 15,
  updated_by_admin_id INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES clinic_branches(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO branch_booking_settings
  (branch_id,online_min_lead_minutes,pending_confirmation_cutoff_minutes,booking_start_interval_minutes,no_show_grace_minutes)
SELECT 1,online_min_lead_minutes,pending_confirmation_cutoff_minutes,30,15 FROM booking_settings WHERE id=1;

-- Enforces one owner branch per clinical stockroom. Existing batches remain associated with their locations.
CREATE TABLE IF NOT EXISTS branch_stock_transfer_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  from_branch_id INT NOT NULL,
  to_branch_id INT NOT NULL,
  requested_by_admin_id INT NOT NULL,
  inventory_id INT NOT NULL,
  batch_id INT NULL,
  quantity DECIMAL(12,4) NOT NULL,
  status ENUM('requested','approved','dispatched','received','cancelled') NOT NULL DEFAULT 'requested',
  approved_by_admin_id INT NULL,
  received_by_admin_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (from_branch_id) REFERENCES clinic_branches(id),
  FOREIGN KEY (to_branch_id) REFERENCES clinic_branches(id),
  FOREIGN KEY (inventory_id) REFERENCES inventory(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP PROCEDURE IF EXISTS carait_branch_column;
DROP PROCEDURE IF EXISTS carait_branch_index;
DROP PROCEDURE IF EXISTS carait_branch_rekey;
