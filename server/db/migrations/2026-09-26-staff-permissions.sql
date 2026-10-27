-- Batch 3: settable Staff feature permissions.
CREATE TABLE IF NOT EXISTS staff_permissions (
  staff_id INT NOT NULL,
  permission_key VARCHAR(50) NOT NULL,
  granted TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (staff_id, permission_key),
  KEY idx_staff_permissions_key (permission_key, granted),
  CONSTRAINT fk_staff_permissions_staff
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Default operational access: seed existing Staff with the same permissions that are pre-checked for newly created Staff accounts.
INSERT IGNORE INTO staff_permissions (staff_id, permission_key, granted)
SELECT s.id, p.permission_key, 1
FROM staff s
JOIN (
  SELECT 'dashboard' permission_key UNION ALL
  SELECT 'appointments' UNION ALL
  SELECT 'patient_records' UNION ALL
  SELECT 'doctor_schedules' UNION ALL
  SELECT 'checkout' UNION ALL
  SELECT 'inventory' UNION ALL
  SELECT 'stock_transfers'
) p
WHERE NOT EXISTS (SELECT 1 FROM staff_permissions sp WHERE sp.staff_id = s.id);
