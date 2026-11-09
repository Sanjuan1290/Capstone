-- Adds an optional Google Maps destination to each physical clinic branch.
-- Existing branches remain valid; NULL means no exact map pin has been supplied.
ALTER TABLE clinic_branches
  ADD COLUMN IF NOT EXISTS google_maps_url VARCHAR(2048) NULL AFTER address;
