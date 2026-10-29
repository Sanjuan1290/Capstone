-- Read-only inspection after applying each of the four statements in staging.
SELECT DATABASE() AS selected_database;
SELECT table_name,column_name,column_type,is_nullable,column_default FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND ((table_name='inventory' AND column_name='default_location_id') OR (table_name='branch_payment_settings' AND column_name='qrph_enabled'));
SELECT index_name,column_name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND table_name='inventory' AND index_name='idx_inventory_default_location';
SELECT constraint_name,referenced_table_name FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA=DATABASE() AND table_name='inventory' AND constraint_name='fk_inventory_default_location';
SELECT i.id,i.branch_id,i.default_location_id,il.branch_id AS stockroom_branch_id,il.is_active FROM inventory i
LEFT JOIN inventory_locations il ON il.id=i.default_location_id
WHERE i.default_location_id IS NOT NULL AND (il.id IS NULL OR il.branch_id<>i.branch_id OR il.is_active<>1);
SELECT branch_id,cash_enabled,qrph_enabled,gcash_enabled,maya_enabled,bank_transfer_enabled
FROM branch_payment_settings ORDER BY branch_id;
-- qrph_enabled remains 0 until approved PayMongo TEST validation and explicit authorization.
