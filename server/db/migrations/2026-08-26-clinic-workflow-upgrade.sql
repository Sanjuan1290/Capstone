-- CARAIT MEDICAL AND DERMATOLOGY CLINIC
-- 2026-08-26 workflow upgrade
-- Apply ONCE after importing currentSQLDB.sql.
-- The server's ensureAppSchema() also creates/repairs these structures on startup.

SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE appointments
  ADD COLUMN appointment_source VARCHAR(30) NOT NULL DEFAULT 'online' AFTER appointment_time,
  ADD COLUMN checked_in_at DATETIME NULL AFTER status;

ALTER TABLE patients
  ADD COLUMN consent_method VARCHAR(40) NULL AFTER consent_given_at,
  ADD COLUMN consent_recorded_by_staff_id INT NULL AFTER consent_method;

ALTER TABLE billing_service_catalog
  ADD COLUMN pricing_notes VARCHAR(255) NULL AFTER profit_percentage;

ALTER TABLE billing_records
  MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'draft',
  ADD COLUMN finalized_at DATETIME NULL AFTER confirmed_by_staff_id,
  ADD COLUMN finalized_by_staff_id INT NULL AFTER finalized_at,
  ADD COLUMN clinical_inventory_consumed_at DATETIME NULL AFTER finalized_by_staff_id,
  ADD COLUMN voided_at DATETIME NULL AFTER paid_at,
  ADD COLUMN void_reason TEXT NULL AFTER voided_at,
  ADD COLUMN refunded_at DATETIME NULL AFTER void_reason,
  ADD COLUMN refund_reason TEXT NULL AFTER refunded_at;

ALTER TABLE billing_payments
  ADD COLUMN refunded_at DATETIME NULL AFTER void_reason,
  ADD COLUMN refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER refunded_at,
  ADD COLUMN refund_reason TEXT NULL AFTER refund_amount,
  ADD COLUMN refunded_by_admin_id INT NULL AFTER refund_reason;

ALTER TABLE inventory_batches
  ADD COLUMN batch_code VARCHAR(80) NULL AFTER inventory_id,
  ADD INDEX idx_inventory_batches_code (inventory_id, batch_code);

ALTER TABLE inventory_logs
  MODIFY COLUMN qty DECIMAL(12,2) NOT NULL,
  ADD COLUMN movement_type VARCHAR(40) NOT NULL DEFAULT 'adjustment' AFTER note,
  ADD COLUMN from_location VARCHAR(120) NULL AFTER movement_type,
  ADD COLUMN to_location VARCHAR(120) NULL AFTER from_location,
  ADD COLUMN reference_type VARCHAR(50) NULL AFTER to_location,
  ADD COLUMN reference_id INT NULL AFTER reference_type,
  ADD COLUMN batch_id INT NULL AFTER reference_id;

ALTER TABLE supply_requests
  ADD COLUMN destination_location VARCHAR(120) NOT NULL DEFAULT 'Doctor / Treatment Room' AFTER reason,
  ADD COLUMN resolved_at DATETIME NULL AFTER updated_at,
  ADD COLUMN resolved_by_admin_id INT NULL AFTER resolved_at;

ALTER TABLE queue
  ADD UNIQUE KEY uniq_queue_doctor_day_number (queue_date, doctor_id, queue_number);

CREATE TABLE clinic_settings (
  id INT NOT NULL PRIMARY KEY,
  clinic_name VARCHAR(180) NOT NULL DEFAULT 'CARAIT MEDICAL AND DERMATOLOGY CLINIC',
  address VARCHAR(255) NULL,
  phone VARCHAR(80) NULL,
  email VARCHAR(160) NULL,
  report_footer VARCHAR(255) NULL,
  receipt_footer VARCHAR(255) NULL,
  updated_by_admin_id INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO clinic_settings
  (id, clinic_name, address, phone, email, report_footer, receipt_footer)
VALUES
  (1, 'CARAIT MEDICAL AND DERMATOLOGY CLINIC', 'A. Bonifacio St., Brgy. Canlalay, Biñan, Laguna', NULL, NULL,
   'Generated from the Carait Clinic Management System.',
   'Thank you for choosing Carait Medical and Dermatology Clinic.')
ON DUPLICATE KEY UPDATE clinic_name = VALUES(clinic_name);

CREATE TABLE discount_presets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(80) NOT NULL,
  discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage',
  value DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  requires_reference TINYINT(1) NOT NULL DEFAULT 0,
  requires_admin_approval TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_discount_preset_label (label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO discount_presets
  (label, discount_type, value, requires_reference, requires_admin_approval, is_active, sort_order)
VALUES
  ('Senior', 'percentage', 20.00, 1, 0, 1, 10),
  ('PWD', 'percentage', 20.00, 1, 0, 1, 20),
  ('Promotional', 'fixed', 0.00, 0, 0, 1, 30),
  ('Courtesy', 'fixed', 0.00, 0, 1, 1, 40),
  ('Employee', 'percentage', 0.00, 0, 1, 1, 50);

CREATE TABLE consultation_inventory_usage (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  consultation_id INT NOT NULL,
  billing_id INT NULL,
  inventory_id INT NOT NULL,
  quantity DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  unit_label VARCHAR(50) NULL,
  notes VARCHAR(255) NULL,
  recorded_by_doctor_id INT NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_consultation_inventory_usage (consultation_id, inventory_id),
  INDEX idx_consultation_inventory_billing (billing_id),
  CONSTRAINT fk_consultation_inventory_usage_consultation FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
  CONSTRAINT fk_consultation_inventory_usage_inventory FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_locations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  location_type VARCHAR(40) NOT NULL DEFAULT 'room',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_inventory_location_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO inventory_locations (name, location_type) VALUES
  ('Main Stockroom', 'stockroom'),
  ('General Medicine Room', 'room'),
  ('Dermatology Room', 'room'),
  ('Dispensing Area', 'dispensing');

CREATE TABLE inventory_location_batches (
  location_id INT NOT NULL,
  inventory_id INT NOT NULL,
  batch_id INT NOT NULL,
  quantity DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (location_id, batch_id),
  INDEX idx_inventory_location_batches_item (inventory_id, location_id),
  CONSTRAINT fk_inventory_location_batches_location FOREIGN KEY (location_id) REFERENCES inventory_locations(id) ON DELETE CASCADE,
  CONSTRAINT fk_inventory_location_batches_inventory FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE,
  CONSTRAINT fk_inventory_location_batches_batch FOREIGN KEY (batch_id) REFERENCES inventory_batches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_location_stock (
  location_id INT NOT NULL,
  inventory_id INT NOT NULL,
  quantity DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (location_id, inventory_id),
  CONSTRAINT fk_inventory_location_stock_location FOREIGN KEY (location_id) REFERENCES inventory_locations(id) ON DELETE CASCADE,
  CONSTRAINT fk_inventory_location_stock_inventory FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Existing batch balance begins in Main Stockroom. Each later movement preserves batch identity.
INSERT INTO inventory_location_batches (location_id, inventory_id, batch_id, quantity)
SELECT l.id, b.inventory_id, b.id, b.quantity
FROM inventory_batches b
JOIN inventory_locations l ON l.name = 'Main Stockroom'
WHERE b.quantity > 0
  AND NOT EXISTS (SELECT 1 FROM inventory_location_batches ilb WHERE ilb.batch_id = b.id);

INSERT INTO inventory_location_stock (location_id, inventory_id, quantity)
SELECT location_id, inventory_id, SUM(quantity)
FROM inventory_location_batches
WHERE quantity > 0
GROUP BY location_id, inventory_id
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity);

CREATE TABLE consultation_inventory_usage_batches (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  consultation_usage_id BIGINT NOT NULL,
  batch_id INT NOT NULL,
  package_quantity DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
  usage_quantity DECIMAL(12,4) NULL,
  usage_unit_label VARCHAR(50) NULL,
  source_location VARCHAR(120) NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_consultation_usage_batch (consultation_usage_id, batch_id, source_location),
  CONSTRAINT fk_consultation_usage_batch_parent FOREIGN KEY (consultation_usage_id) REFERENCES consultation_inventory_usage(id) ON DELETE CASCADE,
  CONSTRAINT fk_consultation_usage_batch_batch FOREIGN KEY (batch_id) REFERENCES inventory_batches(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE billing_item_batch_usage (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  billing_id INT NOT NULL,
  billing_item_id INT NULL,
  inventory_id INT NOT NULL,
  batch_id INT NOT NULL,
  package_quantity DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
  usage_quantity DECIMAL(12,4) NULL,
  usage_unit_label VARCHAR(50) NULL,
  movement_type VARCHAR(40) NOT NULL DEFAULT 'dispensed',
  source_location VARCHAR(120) NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_billing_item_batch_bill (billing_id),
  INDEX idx_billing_item_batch_batch (batch_id),
  CONSTRAINT fk_billing_item_batch_bill FOREIGN KEY (billing_id) REFERENCES billing_records(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_item_batch_item FOREIGN KEY (billing_item_id) REFERENCES billing_items(id) ON DELETE SET NULL,
  CONSTRAINT fk_billing_item_batch_inventory FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE RESTRICT,
  CONSTRAINT fk_billing_item_batch_batch FOREIGN KEY (batch_id) REFERENCES inventory_batches(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_transfers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  inventory_id INT NOT NULL,
  supply_request_id INT NULL,
  from_location VARCHAR(120) NOT NULL DEFAULT 'Main Stockroom',
  to_location VARCHAR(120) NOT NULL,
  quantity DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  transferred_by_role VARCHAR(20) NOT NULL,
  transferred_by_user_id INT NULL,
  transferred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes VARCHAR(255) NULL,
  INDEX idx_inventory_transfer_item (inventory_id, transferred_at),
  INDEX idx_inventory_transfer_request (supply_request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE inventory_transfer_batches (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  transfer_id BIGINT NOT NULL,
  batch_id INT NOT NULL,
  quantity DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  expiration_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_transfer_batches_transfer (transfer_id),
  INDEX idx_transfer_batches_batch (batch_id),
  CONSTRAINT fk_transfer_batches_transfer FOREIGN KEY (transfer_id) REFERENCES inventory_transfers(id) ON DELETE CASCADE,
  CONSTRAINT fk_transfer_batches_batch FOREIGN KEY (batch_id) REFERENCES inventory_batches(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE cashier_closings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  closing_date DATE NOT NULL,
  expected_cash DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  actual_cash DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  variance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  notes TEXT NULL,
  closed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_cashier_closing (staff_id, closing_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET FOREIGN_KEY_CHECKS = 1;
