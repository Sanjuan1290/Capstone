-- Preserve existing queue access when separating it from Appointments.
-- Explicit existing grants/denials remain unchanged; no clinical or financial data.
INSERT IGNORE INTO staff_permissions (staff_id,permission_key,granted)
SELECT staff_id,'walk_in_queue',1 FROM staff_permissions
WHERE permission_key='appointments' AND granted=1;
INSERT IGNORE INTO admin_branch_permissions (admin_id,permission_key,granted)
SELECT admin_id,'walk_in_queue',1 FROM admin_branch_permissions
WHERE permission_key='appointments' AND granted=1;
