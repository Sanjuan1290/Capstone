-- CARAIT Clinic workflow refactor: patient registration, inventory master data,
-- category/type split, generated barcodes, suppliers and storage locations.
-- Safe to re-run against the current schema.

SET @schema_name = DATABASE();

-- -----------------------------------------------------------------------------
-- Patient data: email is now part of the required registration/profile workflow.
-- Keep civil_status column for historical compatibility, but the app no longer
-- collects or requires it.
-- -----------------------------------------------------------------------------

-- No destructive patient schema changes are required.

-- -----------------------------------------------------------------------------
-- Inventory classification
-- category_key: medical | derma
-- item_type: medicine | supplies
-- uom: single unit of measure used for inventory balances and dispensing.
-- -----------------------------------------------------------------------------

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='inventory' AND column_name='item_type'),
  'SELECT 1',
  'ALTER TABLE inventory ADD COLUMN item_type VARCHAR(20) NOT NULL DEFAULT ''supplies'' AFTER category'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='inventory' AND column_name='uom'),
  'SELECT 1',
  'ALTER TABLE inventory ADD COLUMN uom VARCHAR(50) NULL AFTER item_type'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='inventory' AND column_name='dosage_form'),
  'SELECT 1',
  'ALTER TABLE inventory ADD COLUMN dosage_form VARCHAR(80) NULL AFTER uom'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='inventory' AND column_name='strength'),
  'SELECT 1',
  'ALTER TABLE inventory ADD COLUMN strength VARCHAR(80) NULL AFTER dosage_form'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema_name AND table_name='inventory' AND column_name='supplier_id'),
  'SELECT 1',
  'ALTER TABLE inventory ADD COLUMN supplier_id INT NULL AFTER supplier'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill legacy categories conservatively.
-- Old "Derma" becomes Dermatology. Old "Medicine" becomes General Medicine.
-- Old "Supplies" did not identify a clinic, so it defaults to General Medicine
-- and should be reviewed by Admin after deployment.
UPDATE inventory
SET item_type = CASE
  WHEN LOWER(category) = 'supplies' THEN 'supplies'
  ELSE 'medicine'
END
WHERE item_type IS NULL OR item_type = '' OR item_type = 'supplies';

UPDATE inventory
SET category = CASE
  WHEN LOWER(category) IN ('derma','dermatology') THEN 'derma'
  ELSE 'medical'
END
WHERE LOWER(category) IN ('medicine','medical','general medicine','gen med','derma','dermatology','supplies');

UPDATE inventory
SET uom = COALESCE(NULLIF(base_unit,''), NULLIF(unit,''), 'piece')
WHERE uom IS NULL OR uom = '';

-- Legacy conversion fields stay temporarily for backwards compatibility.
-- New code treats each inventory item as a single-UOM item and writes unit_size=1.
UPDATE inventory SET unit_size = 1, unit = uom, base_unit = uom WHERE uom IS NOT NULL AND uom <> '';

-- -----------------------------------------------------------------------------
-- UOM master data
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_uoms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  abbreviation VARCHAR(30) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_inventory_uom_name (name)
);

-- No default UOM values are inserted. Configure Units of Measure in System Setup first.

-- -----------------------------------------------------------------------------
-- Suppliers (category-specific master list)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(20) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_inventory_supplier_category_name (category, name)
);

INSERT IGNORE INTO inventory_suppliers (name, category) VALUES
('General Medicine Supplier 01','medical'),
('General Medicine Supplier 02','medical'),
('General Medicine Supplier 03','medical'),
('General Medicine Supplier 04','medical'),
('General Medicine Supplier 05','medical'),
('Dermatology Supplier 01','derma'),
('Dermatology Supplier 02','derma'),
('Dermatology Supplier 03','derma'),
('Dermatology Supplier 04','derma'),
('Dermatology Supplier 05','derma');

-- -----------------------------------------------------------------------------
-- Atomic category barcode sequences
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_barcode_sequences (
  category VARCHAR(20) PRIMARY KEY,
  last_number INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO inventory_barcode_sequences (category, last_number) VALUES ('medical',0),('derma',0);

-- Seed the sequence from already-generated codes when present.
UPDATE inventory_barcode_sequences
SET last_number = GREATEST(last_number, COALESCE((
  SELECT MAX(CAST(SUBSTRING_INDEX(barcode,'-',-1) AS UNSIGNED))
  FROM inventory
  WHERE barcode REGEXP '^GMED-[0-9]+$'
),0))
WHERE category='medical';

UPDATE inventory_barcode_sequences
SET last_number = GREATEST(last_number, COALESCE((
  SELECT MAX(CAST(SUBSTRING_INDEX(barcode,'-',-1) AS UNSIGNED))
  FROM inventory
  WHERE barcode REGEXP '^DRM-[0-9]+$'
),0))
WHERE category='derma';

-- -----------------------------------------------------------------------------
-- Inventory locations already exist in the current schema. Ensure useful defaults.
-- -----------------------------------------------------------------------------
INSERT IGNORE INTO inventory_locations (name, location_type, is_active) VALUES
('Main Stockroom','stockroom',1),
('General Medicine Room','room',1),
('Dermatology Room','room',1),
('Dispensing Area','dispensing',1);
