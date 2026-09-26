-- CARAIT QA Hardening — Batch 1: Core Integrity
-- Apply to an existing CARAIT database after taking a backup.
-- Covers archive-safe inventory, verified contact state, UOM precision,
-- supplier-per-batch traceability, exact source location IDs, and legacy price review.

SET @schema_name = DATABASE();

-- Inventory archival: history-bearing items are archived, not hard-deleted.
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='inventory' AND column_name='archived_at'), 'SELECT 1', 'ALTER TABLE inventory ADD COLUMN archived_at DATETIME NULL AFTER updated_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='inventory' AND column_name='archived_by_admin_id'), 'SELECT 1', 'ALTER TABLE inventory ADD COLUMN archived_by_admin_id INT NULL AFTER archived_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='inventory' AND column_name='archive_reason'), 'SELECT 1', 'ALTER TABLE inventory ADD COLUMN archive_reason VARCHAR(255) NULL AFTER archived_by_admin_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Explicit contact verification state. Email-only signup must not implicitly trust phone ownership.
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='patients' AND column_name='email_verified_at'), 'SELECT 1', 'ALTER TABLE patients ADD COLUMN email_verified_at DATETIME NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='patients' AND column_name='phone_verified_at'), 'SELECT 1', 'ALTER TABLE patients ADD COLUMN phone_verified_at DATETIME NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE patients
SET email_verified_at = COALESCE(email_verified_at, created_at, NOW())
WHERE COALESCE(is_walk_in,0)=0 AND email IS NOT NULL AND TRIM(email) <> '';

-- UOM quantity precision policy. Whole units are the safe default.
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='inventory_uoms' AND column_name='allow_decimal_quantity'), 'SELECT 1', 'ALTER TABLE inventory_uoms ADD COLUMN allow_decimal_quantity TINYINT(1) NOT NULL DEFAULT 0 AFTER abbreviation');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='inventory_uoms' AND column_name='decimal_precision'), 'SELECT 1', 'ALTER TABLE inventory_uoms ADD COLUMN decimal_precision TINYINT NOT NULL DEFAULT 0 AFTER allow_decimal_quantity');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Actual supplier belongs to each received batch; inventory supplier remains the preferred/default supplier.
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='inventory_batches' AND column_name='supplier_id'), 'SELECT 1', 'ALTER TABLE inventory_batches ADD COLUMN supplier_id INT NULL AFTER supplier_lot_number');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE inventory_batches b JOIN inventory i ON i.id=b.inventory_id SET b.supplier_id=i.supplier_id WHERE b.supplier_id IS NULL AND i.supplier_id IS NOT NULL;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=@schema_name AND table_name='inventory_batches' AND index_name='idx_inventory_batches_supplier'), 'SELECT 1', 'CREATE INDEX idx_inventory_batches_supplier ON inventory_batches(supplier_id)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=@schema_name AND table_name='inventory_batches' AND constraint_name='fk_inventory_batches_supplier'), 'SELECT 1', 'ALTER TABLE inventory_batches ADD CONSTRAINT fk_inventory_batches_supplier FOREIGN KEY (supplier_id) REFERENCES inventory_suppliers(id) ON DELETE SET NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Persist exact physical source location IDs for billing/clinical stock usage.
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='billing_item_batch_usage' AND column_name='source_location_id'), 'SELECT 1', 'ALTER TABLE billing_item_batch_usage ADD COLUMN source_location_id INT NULL AFTER source_location');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='consultation_inventory_usage_batches' AND column_name='source_location_id'), 'SELECT 1', 'ALTER TABLE consultation_inventory_usage_batches ADD COLUMN source_location_id INT NULL AFTER source_location');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE billing_item_batch_usage u JOIN inventory_locations l ON l.name=u.source_location SET u.source_location_id=l.id WHERE u.source_location_id IS NULL AND u.source_location IS NOT NULL;
UPDATE consultation_inventory_usage_batches u JOIN inventory_locations l ON l.name=u.source_location SET u.source_location_id=l.id WHERE u.source_location_id IS NULL AND u.source_location IS NOT NULL;

-- Undo unsafe legacy cost -> Selling Price inference when audit history proves
-- the item was created without an approved patient selling price.
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
UPDATE inventory SET price=selling_price WHERE selling_price IS NOT NULL AND selling_price > 0;

-- Helpful indexes for archive and duplicate stock-transfer request checks.
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=@schema_name AND table_name='inventory' AND index_name='idx_inventory_archived'), 'SELECT 1', 'CREATE INDEX idx_inventory_archived ON inventory(archived_at)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=@schema_name AND table_name='supply_requests' AND index_name='idx_supply_request_pending_dedupe'), 'SELECT 1', 'CREATE INDEX idx_supply_request_pending_dedupe ON supply_requests(doctor_id, inventory_id, destination_location_id, status)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
