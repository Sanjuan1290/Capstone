-- FIX 11: All manual inventory movements are batch-specific.
-- UI no longer offers a per-movement-reason batch checkbox.
-- Run after backing up and reviewing the branch/system configuration on staging.
UPDATE inventory_movement_reasons SET requires_batch = 1 WHERE requires_batch <> 1 OR requires_batch IS NULL;
