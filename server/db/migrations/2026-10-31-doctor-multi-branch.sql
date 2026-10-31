-- Apply ONCE to a backed-up Carait Clinic schema before deploying multi-branch code.
-- This does not duplicate doctor accounts, appointments or consultation records.
CREATE TABLE IF NOT EXISTS doctor_branch_assignments (
  doctor_id INT NOT NULL,
  branch_id INT NOT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (doctor_id, branch_id),
  KEY idx_doctor_assignment_branch (branch_id, doctor_id),
  CONSTRAINT fk_doctor_assignment_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
  CONSTRAINT fk_doctor_assignment_branch FOREIGN KEY (branch_id) REFERENCES clinic_branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO doctor_branch_assignments (doctor_id, branch_id)
SELECT id, branch_id FROM doctors WHERE branch_id IS NOT NULL;

ALTER TABLE doctor_schedules ADD COLUMN branch_id INT NULL;
UPDATE doctor_schedules s JOIN doctors d ON d.id = s.doctor_id SET s.branch_id=d.branch_id;
ALTER TABLE doctor_schedules MODIFY COLUMN branch_id INT NOT NULL;
ALTER TABLE doctor_schedules ADD UNIQUE KEY uniq_doctor_branch_weekday (doctor_id, branch_id, day_of_week);
ALTER TABLE doctor_schedules ADD KEY idx_schedule_branch (branch_id, doctor_id);

ALTER TABLE doctor_unavailable_dates ADD COLUMN branch_id INT NULL;
UPDATE doctor_unavailable_dates u JOIN doctors d ON d.id = u.doctor_id SET u.branch_id=d.branch_id;
ALTER TABLE doctor_unavailable_dates MODIFY COLUMN branch_id INT NOT NULL;
ALTER TABLE doctor_unavailable_dates DROP INDEX uniq_doctor_unavailable_date;
ALTER TABLE doctor_unavailable_dates ADD UNIQUE KEY uniq_doctor_branch_unavailable (doctor_id, branch_id, unavailable_date);
ALTER TABLE doctor_unavailable_dates ADD KEY idx_unavailable_branch (branch_id, doctor_id);
