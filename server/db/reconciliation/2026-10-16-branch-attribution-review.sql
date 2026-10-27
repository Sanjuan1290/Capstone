-- CAREFUL: run SELECT reports FIRST on a verified BACKUP/CLONE only.
-- These corrections are deliberately NOT in the automatic migration runner.
-- Do not overwrite any branch attribution until each mismatch is reviewed.
SELECT br.id AS billing_id, br.branch_id AS recorded_branch_id, a.branch_id AS appointment_branch_id
FROM billing_records br JOIN appointments a ON a.id=br.appointment_id
WHERE br.branch_id<>a.branch_id ORDER BY br.id;
SELECT il.id AS inventory_log_id, il.inventory_id, il.branch_id AS recorded_branch_id,
       i.branch_id AS inventory_branch_id
FROM inventory_logs il JOIN inventory i ON i.id=il.inventory_id
WHERE COALESCE(il.branch_id,0)<>i.branch_id ORDER BY il.id;
-- Only after reviewing and confirming these reports in a transaction on a CLONE:
-- START TRANSACTION;
-- UPDATE billing_records br JOIN appointments a ON a.id=br.appointment_id
--   SET br.branch_id=a.branch_id WHERE br.branch_id<>a.branch_id;
-- UPDATE inventory_logs il JOIN inventory i ON i.id=il.inventory_id
--   SET il.branch_id=i.branch_id WHERE COALESCE(il.branch_id,0)<>i.branch_id;
-- VERIFY counts and reports again, then COMMIT; otherwise ROLLBACK.


