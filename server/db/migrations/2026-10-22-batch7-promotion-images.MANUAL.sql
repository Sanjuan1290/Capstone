-- Optional manual migration, only if schema.js ensureAppSchema has not been run.
-- Inspect information_schema before adding each column; do not run twice.
-- Back up TiDB first. Existing data remains unchanged; historical promotions gain NULL images.
ALTER TABLE clinic_promotions ADD COLUMN image_url VARCHAR(500) NULL;
ALTER TABLE clinic_promotions ADD COLUMN image_asset_id VARCHAR(200) NULL;
ALTER TABLE clinic_promotions ADD COLUMN featured_order INT NOT NULL DEFAULT 0;


