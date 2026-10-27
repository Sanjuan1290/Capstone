-- Non-destructive. Verify a database backup before running this migration.
-- Keep existing cashier closing IDs/events; change only the uniqueness scope.
DELIMITER $$
DROP PROCEDURE IF EXISTS carait_cashier_branch_unique$$
CREATE PROCEDURE carait_cashier_branch_unique()
BEGIN
 IF NOT EXISTS(
   SELECT 1 FROM information_schema.statistics
   WHERE table_schema=DATABASE() AND table_name='cashier_closings'
     AND index_name='uniq_cashier_branch_date'
 ) THEN
   IF EXISTS(
     SELECT 1 FROM information_schema.statistics
     WHERE table_schema=DATABASE() AND table_name='cashier_closings'
       AND index_name='uniq_cashier_closing'
   ) THEN
     ALTER TABLE cashier_closings DROP INDEX uniq_cashier_closing,
       ADD UNIQUE KEY uniq_cashier_branch_date (branch_id,cashier_role,staff_id,closing_date);
   ELSE
     ALTER TABLE cashier_closings
       ADD UNIQUE KEY uniq_cashier_branch_date (branch_id,cashier_role,staff_id,closing_date);
   END IF;
 END IF;
END$$
DELIMITER ;
CALL carait_cashier_branch_unique();
DROP PROCEDURE IF EXISTS carait_cashier_branch_unique;
