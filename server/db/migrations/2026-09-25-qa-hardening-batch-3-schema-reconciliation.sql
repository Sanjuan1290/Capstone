-- CARAIT QA Hardening — Batch 3: Schema Reconciliation
-- Reconciles a database restored from Dump20260925.sql with the 2026-09-25 code.
-- Safe to rerun. Back up the database first.

SET @schema_name = DATABASE();

-- QA-001: archive-safe inventory.
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='inventory' AND column_name='archived_at'), 'SELECT 1', 'ALTER TABLE inventory ADD COLUMN archived_at DATETIME NULL AFTER updated_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='inventory' AND column_name='archived_by_admin_id'), 'SELECT 1', 'ALTER TABLE inventory ADD COLUMN archived_by_admin_id INT NULL AFTER archived_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='inventory' AND column_name='archive_reason'), 'SELECT 1', 'ALTER TABLE inventory ADD COLUMN archive_reason VARCHAR(255) NULL AFTER archived_by_admin_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=@schema_name AND table_name='inventory' AND index_name='idx_inventory_archived'), 'SELECT 1', 'CREATE INDEX idx_inventory_archived ON inventory(archived_at)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- QA-011: verified contact channels are independent.
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='patients' AND column_name='email_verified_at'), 'SELECT 1', 'ALTER TABLE patients ADD COLUMN email_verified_at DATETIME NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='patients' AND column_name='phone_verified_at'), 'SELECT 1', 'ALTER TABLE patients ADD COLUMN phone_verified_at DATETIME NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE patients
SET email_verified_at = COALESCE(email_verified_at, created_at, NOW())
WHERE COALESCE(is_walk_in,0)=0 AND email IS NOT NULL AND TRIM(email)<>'' AND email_verified_at IS NULL;

-- QA-019: UOM decimal policy.
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='inventory_uoms' AND column_name='allow_decimal_quantity'), 'SELECT 1', 'ALTER TABLE inventory_uoms ADD COLUMN allow_decimal_quantity TINYINT(1) NOT NULL DEFAULT 0 AFTER abbreviation');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='inventory_uoms' AND column_name='decimal_precision'), 'SELECT 1', 'ALTER TABLE inventory_uoms ADD COLUMN decimal_precision TINYINT NOT NULL DEFAULT 0 AFTER allow_decimal_quantity');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- QA-007: actual supplier belongs to each received batch.
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='inventory_batches' AND column_name='supplier_id'), 'SELECT 1', 'ALTER TABLE inventory_batches ADD COLUMN supplier_id INT NULL AFTER supplier_lot_number');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE inventory_batches b JOIN inventory i ON i.id=b.inventory_id
SET b.supplier_id=i.supplier_id
WHERE b.supplier_id IS NULL AND i.supplier_id IS NOT NULL;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=@schema_name AND table_name='inventory_batches' AND index_name='idx_inventory_batches_supplier'), 'SELECT 1', 'CREATE INDEX idx_inventory_batches_supplier ON inventory_batches(supplier_id)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=@schema_name AND table_name='inventory_batches' AND constraint_name='fk_inventory_batches_supplier'), 'SELECT 1', 'ALTER TABLE inventory_batches ADD CONSTRAINT fk_inventory_batches_supplier FOREIGN KEY (supplier_id) REFERENCES inventory_suppliers(id) ON DELETE SET NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- QA-009/010/022: persist canonical source location IDs.
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='billing_item_batch_usage' AND column_name='source_location_id'), 'SELECT 1', 'ALTER TABLE billing_item_batch_usage ADD COLUMN source_location_id INT NULL AFTER source_location');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='consultation_inventory_usage_batches' AND column_name='source_location_id'), 'SELECT 1', 'ALTER TABLE consultation_inventory_usage_batches ADD COLUMN source_location_id INT NULL AFTER source_location');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE billing_item_batch_usage u JOIN inventory_locations l ON l.name=u.source_location
SET u.source_location_id=l.id WHERE u.source_location_id IS NULL AND u.source_location IS NOT NULL;
UPDATE consultation_inventory_usage_batches u JOIN inventory_locations l ON l.name=u.source_location
SET u.source_location_id=l.id WHERE u.source_location_id IS NULL AND u.source_location IS NOT NULL;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=@schema_name AND table_name='billing_item_batch_usage' AND index_name='idx_billing_usage_source_location'), 'SELECT 1', 'CREATE INDEX idx_billing_usage_source_location ON billing_item_batch_usage(source_location_id)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=@schema_name AND table_name='consultation_inventory_usage_batches' AND index_name='idx_consultation_usage_source_location'), 'SELECT 1', 'CREATE INDEX idx_consultation_usage_source_location ON consultation_inventory_usage_batches(source_location_id)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=@schema_name AND table_name='billing_item_batch_usage' AND constraint_name='fk_billing_usage_source_location'), 'SELECT 1', 'ALTER TABLE billing_item_batch_usage ADD CONSTRAINT fk_billing_usage_source_location FOREIGN KEY (source_location_id) REFERENCES inventory_locations(id) ON DELETE SET NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=@schema_name AND table_name='consultation_inventory_usage_batches' AND constraint_name='fk_consultation_usage_source_location'), 'SELECT 1', 'ALTER TABLE consultation_inventory_usage_batches ADD CONSTRAINT fk_consultation_usage_source_location FOREIGN KEY (source_location_id) REFERENCES inventory_locations(id) ON DELETE SET NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- QA-015: one security code per account + purpose, not one code per account globally.
DELETE FROM account_security_codes WHERE expires_at <= NOW();
SET @has_old_security_unique = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=@schema_name AND table_name='account_security_codes' AND index_name='uniq_account_security_code');
SET @sql = IF(@has_old_security_unique > 0, 'ALTER TABLE account_security_codes DROP INDEX uniq_account_security_code', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has_purpose_security_unique = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=@schema_name AND table_name='account_security_codes' AND index_name='uniq_account_security_code_purpose');
SET @sql = IF(@has_purpose_security_unique = 0, 'ALTER TABLE account_security_codes ADD UNIQUE KEY uniq_account_security_code_purpose (role, account_id, purpose)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- QA-016: duplicate pending stock-request lookup index.
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=@schema_name AND table_name='supply_requests' AND index_name='idx_supply_request_pending_dedupe'), 'SELECT 1', 'CREATE INDEX idx_supply_request_pending_dedupe ON supply_requests(doctor_id, inventory_id, destination_location_id, status)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- QA-004: undo unsafe legacy cost -> Selling Price inference only when audit history
-- proves no explicit patient price was approved on creation or later update.
UPDATE inventory i
JOIN audit_logs created
  ON created.action='inventory.item_created'
 AND created.entity_type='inventory_item'
 AND CAST(created.entity_id AS UNSIGNED)=i.id
SET i.selling_price=NULL
WHERE JSON_VALID(created.new_values)
  AND NOT (
    COALESCE(CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(created.new_values,'$.selling_price')), 'null') AS DECIMAL(10,2)), 0) > 0
    OR COALESCE(CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(created.new_values,'$.patient_selling_price')), 'null') AS DECIMAL(10,2)), 0) > 0
  )
  AND i.selling_price IS NOT NULL
  AND i.price IS NOT NULL
  AND ABS(i.selling_price-i.price) < 0.0001
  AND NOT EXISTS (
    SELECT 1 FROM audit_logs changed
    WHERE changed.entity_type='inventory_item'
      AND CAST(changed.entity_id AS UNSIGNED)=i.id
      AND changed.action IN ('inventory.item_updated','inventory.item_created')
      AND changed.id > created.id
      AND JSON_VALID(changed.new_values)
      AND CAST(JSON_UNQUOTE(JSON_EXTRACT(changed.new_values,'$.selling_price')) AS DECIMAL(10,2)) > 0
  );

-- Legacy price is only a compatibility mirror of an explicitly reviewed Selling Price.
UPDATE inventory
SET price=selling_price
WHERE selling_price IS NOT NULL AND selling_price > 0
  AND (price IS NULL OR ABS(price-selling_price)>0.0001);

-- Intentionally do not overwrite inventory_batches.unit_cost. It remains receipt/acquisition history.
