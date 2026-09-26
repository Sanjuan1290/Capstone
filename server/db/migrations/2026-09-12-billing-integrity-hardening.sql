-- Billing integrity hardening: charge provenance, optimistic concurrency,
-- patient selling prices, approval versioning, QR modes, and cashier reopen history.
-- Safe to run more than once against the current Carait Clinic schema.

SET @schema_name = DATABASE();

-- billing_records.version
SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='billing_records' AND column_name='version'),
  'SELECT 1',
  'ALTER TABLE billing_records ADD COLUMN version INT NOT NULL DEFAULT 1 AFTER status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- Keep required discount references/IDs with the financial record.
SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='billing_records' AND column_name='discount_reference'),
  'SELECT 1',
  'ALTER TABLE billing_records ADD COLUMN discount_reference VARCHAR(160) NULL AFTER discount_label'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- billing_items provenance
SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='billing_items' AND column_name='source_type'),
  'SELECT 1',
  'ALTER TABLE billing_items ADD COLUMN source_type VARCHAR(30) NOT NULL DEFAULT ''staff_custom'' AFTER item_type'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='billing_items' AND column_name='source_reference_id'),
  'SELECT 1',
  'ALTER TABLE billing_items ADD COLUMN source_reference_id INT NULL AFTER source_type'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Existing service lines attached to a consultation are treated as consultation-owned.
UPDATE billing_items bi
JOIN billing_records br ON br.id = bi.billing_id
SET bi.source_type = 'consultation',
    bi.source_reference_id = COALESCE(bi.source_reference_id, br.consultation_id)
WHERE bi.item_type = 'service'
  AND br.consultation_id IS NOT NULL
  AND COALESCE(bi.source_type, 'staff_custom') <> 'consultation';

UPDATE billing_items
SET source_type = CASE
  WHEN item_type = 'supply' THEN 'staff_supply'
  WHEN item_type = 'custom' THEN 'staff_custom'
  ELSE source_type
END
WHERE COALESCE(source_type, '') = '' OR source_type = 'staff_custom';

-- Inventory patient-facing price. Intentionally nullable: missing price must block direct billing.
SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='inventory' AND column_name='selling_price'),
  'SELECT 1',
  'ALTER TABLE inventory ADD COLUMN selling_price DECIMAL(10,2) NULL AFTER price'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Approval requests are tied to the bill revision they reviewed.
SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='billing_adjustment_requests' AND column_name='bill_version'),
  'SELECT 1',
  'ALTER TABLE billing_adjustment_requests ADD COLUMN bill_version INT NOT NULL DEFAULT 1 AFTER billing_id'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE billing_adjustment_requests bar
JOIN billing_records br ON br.id = bar.billing_id
SET bar.bill_version = br.version
WHERE bar.bill_version IS NULL OR bar.bill_version < 1;

-- Digital payment presentation can use an uploaded QR or a physical/external QR at cashier.
SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='clinic_payment_settings' AND column_name='gcash_qr_mode'),
  'SELECT 1',
  'ALTER TABLE clinic_payment_settings ADD COLUMN gcash_qr_mode VARCHAR(20) NOT NULL DEFAULT ''uploaded'' AFTER maya_qr_url'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='clinic_payment_settings' AND column_name='maya_qr_mode'),
  'SELECT 1',
  'ALTER TABLE clinic_payment_settings ADD COLUMN maya_qr_mode VARCHAR(20) NOT NULL DEFAULT ''uploaded'' AFTER gcash_qr_mode'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Preserve cashier closing lifecycle instead of deleting a closing when reopened.
SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='cashier_closings' AND column_name='status'),
  'SELECT 1',
  'ALTER TABLE cashier_closings ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT ''closed'' AFTER notes'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='cashier_closings' AND column_name='reopened_at'),
  'SELECT 1',
  'ALTER TABLE cashier_closings ADD COLUMN reopened_at DATETIME NULL AFTER status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='cashier_closings' AND column_name='reopened_by_admin_id'),
  'SELECT 1',
  'ALTER TABLE cashier_closings ADD COLUMN reopened_by_admin_id INT NULL AFTER reopened_at'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='cashier_closings' AND column_name='reopen_reason'),
  'SELECT 1',
  'ALTER TABLE cashier_closings ADD COLUMN reopen_reason TEXT NULL AFTER reopened_by_admin_id'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS cashier_closing_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  cashier_closing_id BIGINT NOT NULL,
  event_type VARCHAR(20) NOT NULL,
  actor_role VARCHAR(20) NOT NULL,
  actor_id INT NULL,
  expected_cash DECIMAL(10,2) NULL,
  actual_cash DECIMAL(10,2) NULL,
  variance DECIMAL(10,2) NULL,
  reason TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cashier_closing_events_closing (cashier_closing_id, created_at),
  CONSTRAINT fk_cashier_closing_events_closing
    FOREIGN KEY (cashier_closing_id) REFERENCES cashier_closings(id) ON DELETE CASCADE
);

-- Helpful lookup for accidental duplicate digital references.
SET @has_ref_index = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=@schema_name AND table_name='billing_payments' AND index_name='idx_billing_payment_reference'
);
SET @sql = IF(@has_ref_index > 0, 'SELECT 1', 'CREATE INDEX idx_billing_payment_reference ON billing_payments (payment_method, reference_number)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Receipt label is configurable and does not imply a regulated document by default.
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='clinic_settings' AND COLUMN_NAME='receipt_title')=0, 'ALTER TABLE clinic_settings ADD COLUMN receipt_title VARCHAR(120) NOT NULL DEFAULT ''PAYMENT RECEIPT'' AFTER report_footer', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- New payment settings rows default to Cash only; existing configured rows are not changed.
ALTER TABLE clinic_payment_settings
  ALTER COLUMN cash_enabled SET DEFAULT 1,
  ALTER COLUMN gcash_enabled SET DEFAULT 0,
  ALTER COLUMN maya_enabled SET DEFAULT 0,
  ALTER COLUMN bank_transfer_enabled SET DEFAULT 0;
