-- The runner validates index metadata and safely resumes partial DDL.
-- Add the branch-scoped replacement BEFORE removing the old global constraint.
-- Queue rows, existing numbers and migration history are retained.
ALTER TABLE queue ADD UNIQUE KEY uniq_queue_branch_doctor_day_number (branch_id, queue_date, doctor_id, queue_number);
ALTER TABLE queue ADD KEY idx_queue_branch_department_day (branch_id, queue_date, type, queue_number);
ALTER TABLE queue DROP INDEX uniq_queue_doctor_day_number;
