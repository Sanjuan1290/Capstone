-- Nullable for historical movements whose balances were never recorded.
-- Existing quantities and financial data remain unchanged.
ALTER TABLE inventory_logs ADD COLUMN quantity_before DECIMAL(12,2) NULL;
ALTER TABLE inventory_logs ADD COLUMN quantity_after DECIMAL(12,2) NULL;
