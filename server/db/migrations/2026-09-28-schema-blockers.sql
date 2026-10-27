-- CARAIT 2026-09-28 schema blockers / compatibility migration
-- Run after taking a database backup. Idempotent on the target column definitions.
USE `carait_clinic_system`;

-- All four portals can use the shared recovery controller. The legacy ENUM omitted admin.
ALTER TABLE password_resets
  MODIFY COLUMN role VARCHAR(20) NOT NULL;

-- Decimal-enabled inventory UOMs can request/transfer quantities such as 0.25 or 1.50.
ALTER TABLE supply_requests
  MODIFY COLUMN qty_requested DECIMAL(12,2) NOT NULL;

-- Movement-reason internal codes are VARCHAR(80); the inventory log must be able to store them.
ALTER TABLE inventory_logs
  MODIFY COLUMN movement_type VARCHAR(80) NOT NULL DEFAULT 'adjustment';

