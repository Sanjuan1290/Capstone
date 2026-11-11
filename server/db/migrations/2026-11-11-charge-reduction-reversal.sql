-- Additive. The migration runner checks each column to resume partial MySQL/TiDB DDL.
-- Approval/requester fields remain immutable when a reduction is reversed.
ALTER TABLE billing_charge_adjustments ADD COLUMN reversed_at DATETIME NULL;
ALTER TABLE billing_charge_adjustments ADD COLUMN reversed_by_admin_id INT NULL;
ALTER TABLE billing_charge_adjustments ADD COLUMN reversal_reason VARCHAR(255) NULL;
