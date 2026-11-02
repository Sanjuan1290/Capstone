-- For TiDB: add the column before creating an index over it.
-- Existing shared movement reasons retain NULL branch_id.
ALTER TABLE inventory_movement_reasons
  ADD COLUMN IF NOT EXISTS branch_id INT NULL DEFAULT NULL;

ALTER TABLE inventory_movement_reasons
  ADD INDEX IF NOT EXISTS idx_movement_reason_branch (branch_id,movement_type,is_active);
