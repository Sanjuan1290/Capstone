-- CARAIT editable billing service categories (2026-09-22)
-- Safe to run against an existing MySQL 8 database. Back up first.

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

-- Move the category choices that used to be hard-coded in the React form into DB data.
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

-- Preserve every category already used by current services so no existing service is orphaned.
INSERT IGNORE INTO billing_service_categories (name, clinic_type, sort_order)
SELECT DISTINCT TRIM(category), clinic_type, 100
FROM billing_service_catalog
WHERE TRIM(COALESCE(category,'')) <> ''
  AND clinic_type IN ('medical','derma');

-- Add category_id only when it does not already exist.
SET @has_category_id := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'billing_service_catalog'
    AND COLUMN_NAME = 'category_id'
);
SET @sql := IF(
  @has_category_id = 0,
  'ALTER TABLE billing_service_catalog ADD COLUMN category_id INT NULL AFTER id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE billing_service_catalog bsc
JOIN billing_service_categories bcat
  ON bcat.clinic_type = bsc.clinic_type
 AND bcat.name = bsc.category
SET bsc.category_id = bcat.id
WHERE bsc.category_id IS NULL;

SET @has_category_idx := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'billing_service_catalog'
    AND INDEX_NAME = 'idx_billing_service_category_id'
);
SET @sql := IF(
  @has_category_idx = 0,
  'CREATE INDEX idx_billing_service_category_id ON billing_service_catalog (category_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_category_fk := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'billing_service_catalog'
    AND CONSTRAINT_NAME = 'fk_billing_service_category'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
  @has_category_fk = 0,
  'ALTER TABLE billing_service_catalog ADD CONSTRAINT fk_billing_service_category FOREIGN KEY (category_id) REFERENCES billing_service_categories(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

