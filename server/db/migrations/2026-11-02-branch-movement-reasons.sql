-- Branch-owned custom reasons are additive to shared Super Admin movement reasons.
-- Shared legacy records keep NULL branch_id and are never rewritten.
ALTER TABLE inventory_movement_reasons
  ADD COLUMN branch_id INT NULL DEFAULT NULL,
  ADD INDEX idx_movement_reason_branch (branch_id,movement_type,is_active);
