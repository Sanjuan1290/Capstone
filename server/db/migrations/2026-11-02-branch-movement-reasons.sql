
-- Branch-owned custom reasons are additive to shared
-- Super Admin movement reasons.
-- Shared legacy records keep NULL branch_id
-- and are never rewritten.

-- Step 1: Add branch_id column
ALTER TABLE inventory_movement_reasons
ADD COLUMN IF NOT EXISTS branch_id INT NULL DEFAULT NULL;

-- Step 2: Create branch movement reason index
ALTER TABLE inventory_movement_reasons
ADD INDEX IF NOT EXISTS idx_movement_reason_branch
(branch_id, movement_type, is_active);

-- Step 3: Verify the table structure
SHOW COLUMNS FROM inventory_movement_reasons;

-- Step 4: Verify the index
SHOW INDEX FROM inventory_movement_reasons;
