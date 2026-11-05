-- Apply to a verified backup and disposable TiDB staging first.
-- Existing active assignments remain opted in, subject to schedule and blocked dates.
ALTER TABLE doctor_branch_assignments
  ADD COLUMN accepting_walk_ins TINYINT(1) NOT NULL DEFAULT 1;
