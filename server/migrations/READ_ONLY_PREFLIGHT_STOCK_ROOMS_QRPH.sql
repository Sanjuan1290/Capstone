-- Execute on a known isolated TiDB STAGING database; inspect all results.
SELECT DATABASE() AS selected_database, NOW() AS inspected_at;
SELECT table_name, column_name, column_type, is_nullable, column_default
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND (
(table_name='inventory' AND column_name IN ('default_location_id','location_type_id','stock','stock_base')) OR
(table_name='branch_payment_settings' AND column_name IN ('qrph_enabled','cash_enabled','gcash_enabled','maya_enabled','bank_transfer_enabled')))
ORDER BY table_name,column_name;
SELECT table_name,index_name,seq_in_index,column_name FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA=DATABASE() AND table_name='inventory' AND index_name='idx_inventory_default_location';
SELECT table_name,constraint_name FROM information_schema.TABLE_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA=DATABASE() AND table_name='inventory' AND constraint_name='fk_inventory_default_location';
SELECT COUNT(*) AS inventory_items FROM inventory;
SELECT COUNT(*) AS location_records FROM inventory_locations;
SELECT COUNT(*) AS branches FROM clinic_branches;
SELECT COUNT(*) AS payment_config_rows FROM branch_payment_settings;
SELECT COUNT(*) AS pending_qr_attempts FROM payment_gateway_attempts WHERE active_bill_id IS NOT NULL OR status IN ('creating','pending','review');
SELECT COUNT(*) AS currently_nonzero_items FROM inventory WHERE stock<>0 OR stock_base<>0;
SELECT COUNT(*) AS location_balances FROM inventory_location_stock WHERE quantity<>0;
SELECT COUNT(*) AS batch_location_balances FROM inventory_location_batches WHERE quantity<>0;
-- If stock is nonempty, compare physical counts/expiry first; never guess allocations.
