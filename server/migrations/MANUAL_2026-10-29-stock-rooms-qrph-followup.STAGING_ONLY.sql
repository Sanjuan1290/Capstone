-- CARAIT 2026-10-29 STOCK ROOMS + QR PH COMPATIBILITY MIGRATION
-- ADDITIVE ONLY. STAGING DATABASE ONLY. No DROP, TRUNCATE, DELETE or UPDATE.
-- IMPORTANT: do not run on production, do not run npm run migrate blindly.
-- Take a separate verified TiDB staging backup and run READ_ONLY_PREFLIGHT first.
-- Compare information_schema results and SKIP an ALTER when its object already exists.
-- Run each statement individually in TiDB SQL Editor (the statements are NOT atomic together).

-- Step A: actual physical Stock Room preferred by the item; NULL for preexisting historical items.
ALTER TABLE inventory ADD COLUMN default_location_id INT NULL;

-- Step B: run separately after A appears in information_schema.COLUMNS.
ALTER TABLE inventory ADD INDEX idx_inventory_default_location (default_location_id);

-- Step C: run separately after B; historical NULLs are valid.
ALTER TABLE inventory ADD CONSTRAINT fk_inventory_default_location
  FOREIGN KEY (default_location_id) REFERENCES inventory_locations(id) ON DELETE SET NULL;

-- Step D: PayMongo QR Ph branch-specific feature switch, disabled by default.
ALTER TABLE branch_payment_settings ADD COLUMN qrph_enabled TINYINT(1) NOT NULL DEFAULT 0;

-- Legacy payment columns, storage-location types and batches are intentionally retained.
-- Never auto-map historical medicine stock to a guessed room.
-- No existing QR or clinical/billing data is rewritten.
-- This does NOT activate location-canonical/batch-free inventory or PayMongo LIVE collection.
