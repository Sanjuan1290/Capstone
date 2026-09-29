-- CARAIT Batch 4 (2026-09-28)
-- Multi-item grouped stock transfer requests with atomic approval.
USE `carait_clinic_system`;

CREATE TABLE IF NOT EXISTS supply_request_groups (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  doctor_id INT NOT NULL,
  destination_location_id INT NULL,
  destination_location VARCHAR(120) NOT NULL DEFAULT 'Doctor / Treatment Room',
  reason TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  resolved_by_role VARCHAR(20) NULL,
  resolved_by_user_id INT NULL,
  resolution_note TEXT NULL,
  INDEX idx_supply_request_groups_status (status, requested_at),
  INDEX idx_supply_request_groups_doctor (doctor_id, status, requested_at),
  INDEX idx_supply_request_groups_destination (destination_location_id),
  CONSTRAINT fk_supply_request_groups_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
  CONSTRAINT fk_supply_request_groups_destination FOREIGN KEY (destination_location_id) REFERENCES inventory_locations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @schema_name = DATABASE();

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='supply_requests' AND COLUMN_NAME='request_group_id'),
  'SELECT 1',
  'ALTER TABLE supply_requests ADD COLUMN request_group_id BIGINT NULL AFTER id'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill every legacy single-line request into its own group.
INSERT IGNORE INTO supply_request_groups
  (id, doctor_id, destination_location_id, destination_location, reason, status, requested_at, updated_at, resolved_at, resolved_by_role, resolved_by_user_id, resolution_note)
SELECT sr.id, sr.doctor_id, sr.destination_location_id, sr.destination_location, sr.reason, sr.status,
       sr.requested_at, sr.updated_at, sr.resolved_at,
       CASE WHEN sr.resolved_by_admin_id IS NOT NULL THEN 'admin' ELSE NULL END,
       sr.resolved_by_admin_id,
       sr.resolution_note
FROM supply_requests sr
WHERE sr.request_group_id IS NULL;

UPDATE supply_requests sr
JOIN supply_request_groups g ON g.id = sr.id
SET sr.request_group_id = g.id
WHERE sr.request_group_id IS NULL
  AND sr.id > 0;

ALTER TABLE supply_requests
  MODIFY COLUMN request_group_id BIGINT NOT NULL,
  MODIFY COLUMN qty_requested DECIMAL(12,2) NOT NULL;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='supply_requests' AND INDEX_NAME='idx_supply_request_group'),
  'SELECT 1',
  'CREATE INDEX idx_supply_request_group ON supply_requests(request_group_id)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='supply_requests' AND INDEX_NAME='uniq_supply_request_group_item'),
  'SELECT 1',
  'CREATE UNIQUE INDEX uniq_supply_request_group_item ON supply_requests(request_group_id, inventory_id)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=@schema_name AND TABLE_NAME='supply_requests' AND CONSTRAINT_NAME='fk_supply_request_group' AND CONSTRAINT_TYPE='FOREIGN KEY'),
  'SELECT 1',
  'ALTER TABLE supply_requests ADD CONSTRAINT fk_supply_request_group FOREIGN KEY (request_group_id) REFERENCES supply_request_groups(id) ON DELETE CASCADE'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

