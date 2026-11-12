-- Keep Staff identities separate from Admin identities in shared Excel workflows.
-- Existing uploads and their Admin identities remain unchanged.
ALTER TABLE inventory_excel_uploads MODIFY COLUMN created_by_admin_id INT NULL;
ALTER TABLE inventory_excel_uploads ADD COLUMN created_by_staff_id INT NULL;
ALTER TABLE inventory_excel_uploads ADD COLUMN undone_by_staff_id INT NULL;
ALTER TABLE inventory_excel_receipts ADD COLUMN created_by_staff_id INT NULL;
