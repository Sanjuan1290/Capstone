-- CARAIT Clinic — configurable manual inventory movement reasons.
-- Existing movement codes stay stable so historical inventory_logs remain readable.

CREATE TABLE IF NOT EXISTS inventory_movement_reasons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(80) NOT NULL,
  movement_type ENUM('in','out') NOT NULL,
  requires_batch TINYINT(1) NOT NULL DEFAULT 0,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_inventory_movement_reason_code (code),
  INDEX idx_inventory_movement_reason_active (movement_type, is_active, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO inventory_movement_reasons
  (name, code, movement_type, requires_batch, is_system, is_active)
VALUES
  ('Received from Supplier', 'received', 'in', 0, 1, 1),
  ('Returned to Stock', 'returned', 'in', 0, 1, 1),
  ('Inventory Correction (+)', 'correction_in', 'in', 0, 1, 1),
  ('Inventory Correction (-)', 'adjustment_out', 'out', 1, 1, 1),
  ('Expired Stock', 'expired', 'out', 1, 1, 1),
  ('Damaged Stock', 'damaged', 'out', 1, 1, 1),
  ('Wastage / Spillage', 'wastage', 'out', 1, 1, 1),
  ('Returned to Supplier', 'returned_to_supplier', 'out', 1, 1, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  movement_type = VALUES(movement_type),
  requires_batch = VALUES(requires_batch),
  is_system = VALUES(is_system);

