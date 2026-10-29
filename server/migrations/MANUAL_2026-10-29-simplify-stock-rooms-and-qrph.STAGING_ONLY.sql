-- MANUAL STAGING ONLY. DO NOT EXECUTE ON PRODUCTION WITHOUT REVIEWED BACKUP.
-- Validate SELECT DATABASE() and preflight information_schema first.
-- Run each ALTER independently (TiDB DDL dependency rules).
-- Keep historical inventory_location_types, appointments and payments intact.
-- This migration alone is NOT a completed batch-free inventory migration.

ALTER TABLE inventory ADD COLUMN default_location_id INT NULL;
ALTER TABLE inventory ADD INDEX idx_inventory_default_location (default_location_id);
ALTER TABLE inventory ADD CONSTRAINT fk_inventory_default_location
  FOREIGN KEY (default_location_id) REFERENCES inventory_locations(id) ON DELETE SET NULL;

ALTER TABLE branch_payment_settings ADD COLUMN qrph_enabled TINYINT(1) NOT NULL DEFAULT 0;

-- No backfill intentionally: historical items must have their default stock room
-- selected by a branch admin after reviewing actual per-location physical stock.
-- Do not run automatic UPDATE inventory SET default_location_id=<guessed room>.
-- Leave CARAIT_ENFORCE_QRPH_BRANCH_TOGGLE=false until all branches and existing
-- pending PayMongo QR attempts have been reconciled and the explicit rollout approved.
