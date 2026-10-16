-- CARAIT non-destructive branch ledger additions. Run only after a verified backup.
-- Existing single-clinic payment configuration and counters are preserved.
CREATE TABLE IF NOT EXISTS branch_payment_settings (
 branch_id INT NOT NULL PRIMARY KEY,
 cash_enabled TINYINT(1) NOT NULL DEFAULT 1,
 gcash_enabled TINYINT(1) NOT NULL DEFAULT 0,
 maya_enabled TINYINT(1) NOT NULL DEFAULT 0,
 bank_transfer_enabled TINYINT(1) NOT NULL DEFAULT 0,
 gcash_qr_url TEXT NULL,
 maya_qr_url TEXT NULL,
 gcash_qr_mode VARCHAR(20) NOT NULL DEFAULT 'uploaded',
 maya_qr_mode VARCHAR(20) NOT NULL DEFAULT 'uploaded',
 gcash_qr_scan_status VARCHAR(20) NOT NULL DEFAULT 'legacy',
 maya_qr_scan_status VARCHAR(20) NOT NULL DEFAULT 'legacy',
 bank_name VARCHAR(120) NULL,
 bank_account_name VARCHAR(180) NULL,
 bank_account_number VARCHAR(120) NULL,
 updated_by_admin_id INT NULL,
 updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_branch_payment_branch FOREIGN KEY (branch_id) REFERENCES clinic_branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO branch_payment_settings
 (branch_id,cash_enabled,gcash_enabled,maya_enabled,bank_transfer_enabled,gcash_qr_url,maya_qr_url,gcash_qr_mode,maya_qr_mode,gcash_qr_scan_status,maya_qr_scan_status,bank_name,bank_account_name,bank_account_number,updated_by_admin_id)
 SELECT 1,cash_enabled,gcash_enabled,maya_enabled,bank_transfer_enabled,gcash_qr_url,maya_qr_url,gcash_qr_mode,maya_qr_mode,gcash_qr_scan_status,maya_qr_scan_status,bank_name,bank_account_name,bank_account_number,updated_by_admin_id FROM clinic_payment_settings WHERE id=1;
CREATE TABLE IF NOT EXISTS branch_receipt_sequences (
 branch_id INT NOT NULL PRIMARY KEY,
 last_number BIGINT NOT NULL DEFAULT 0,
 updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_branch_receipt_branch FOREIGN KEY (branch_id) REFERENCES clinic_branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO branch_receipt_sequences (branch_id,last_number)
 SELECT 1,last_number FROM billing_receipt_sequence WHERE id=1;
-- The indexed column changes use information_schema so this script can run twice.
DELIMITER $$
DROP PROCEDURE IF EXISTS carait_ensure_branch_ledger_column$$
CREATE PROCEDURE carait_ensure_branch_ledger_column(IN t VARCHAR(64))
BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=t AND column_name='branch_id') THEN
  SET @ddl=CONCAT('ALTER TABLE `',t,'` ADD COLUMN branch_id INT NOT NULL DEFAULT 1');
  PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
 END IF;
END$$
DROP PROCEDURE IF EXISTS carait_ensure_branch_ledger_index$$
CREATE PROCEDURE carait_ensure_branch_ledger_index(IN t VARCHAR(64), IN old_key VARCHAR(64), IN new_key VARCHAR(64), IN cols VARCHAR(120))
BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=t AND index_name=new_key) THEN
  IF EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=t AND index_name=old_key) THEN
   SET @ddl=CONCAT('ALTER TABLE `',t,'` DROP INDEX `',old_key,'`, ADD UNIQUE KEY `',new_key,'` (',cols,')');
  ELSE
   SET @ddl=CONCAT('ALTER TABLE `',t,'` ADD UNIQUE KEY `',new_key,'` (',cols,')');
  END IF;
  PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
 END IF;
END$$
DELIMITER ;
CALL carait_ensure_branch_ledger_column('inventory_barcode_sequences');
CALL carait_ensure_branch_ledger_column('inventory_suppliers');
CALL carait_ensure_branch_ledger_column('discount_presets');
-- Primary key is category alone in the old schema; add branch identity once.
DELIMITER $$
DROP PROCEDURE IF EXISTS carait_ensure_barcode_pk$$
CREATE PROCEDURE carait_ensure_barcode_pk()
BEGIN
 IF (SELECT COUNT(*) FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name='inventory_barcode_sequences' AND constraint_name='PRIMARY')=1 THEN
  ALTER TABLE inventory_barcode_sequences DROP PRIMARY KEY, ADD PRIMARY KEY (category,branch_id);
 END IF;
END$$
DELIMITER ;
CALL carait_ensure_barcode_pk();
CALL carait_ensure_branch_ledger_index('inventory_suppliers','uniq_inventory_supplier_category_name','uniq_branch_supplier_category_name','branch_id,category,name');
CALL carait_ensure_branch_ledger_index('discount_presets','uniq_discount_preset_label','uniq_branch_discount_label','branch_id,label');
DROP PROCEDURE IF EXISTS carait_ensure_branch_ledger_column;
DROP PROCEDURE IF EXISTS carait_ensure_branch_ledger_index;
DROP PROCEDURE IF EXISTS carait_ensure_barcode_pk;

