-- Preserve visit uniqueness while allowing separately payable, linked add-on bills.
ALTER TABLE billing_records ADD COLUMN original_bill_id INT NULL;
ALTER TABLE billing_records ADD COLUMN charge_key VARCHAR(100) NOT NULL DEFAULT 'visit';
ALTER TABLE billing_records ADD UNIQUE KEY uniq_bill_visit_charge (appointment_id, charge_key);
ALTER TABLE billing_records ADD UNIQUE KEY uniq_bill_consultation_charge (consultation_id, charge_key);
ALTER TABLE billing_records DROP INDEX uniq_billing_records_appointment;
ALTER TABLE billing_records DROP INDEX uniq_billing_records_consultation;

CREATE TABLE IF NOT EXISTS billing_addons (
 id INT AUTO_INCREMENT PRIMARY KEY,
 branch_id INT NOT NULL,
 name VARCHAR(120) NOT NULL,
 default_price DECIMAL(10,2) NOT NULL,
 is_active TINYINT NOT NULL DEFAULT 1,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uniq_branch_addon_name (branch_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS billing_service_addons (
 branch_id INT NOT NULL,
 service_id INT NOT NULL,
 addon_id INT NOT NULL,
 price_override DECIMAL(10,2) NULL,
 PRIMARY KEY (service_id, addon_id),
 KEY idx_service_addon_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS billing_addon_charges (
 id INT AUTO_INCREMENT PRIMARY KEY,
 branch_id INT NOT NULL,
 original_bill_id INT NOT NULL,
 consultation_id INT NULL,
 service_id INT NOT NULL,
 addon_id INT NOT NULL,
 billing_id INT NOT NULL,
 name_snapshot VARCHAR(120) NOT NULL,
 price_snapshot DECIMAL(10,2) NOT NULL,
 request_key VARCHAR(100) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uniq_visit_service_addon (original_bill_id, service_id, addon_id),
 UNIQUE KEY uniq_branch_addon_request (branch_id, request_key),
 KEY idx_addon_charge_bill (billing_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS medical_certificates (
 id INT AUTO_INCREMENT PRIMARY KEY,
 branch_id INT NOT NULL,
 appointment_id INT NOT NULL,
 consultation_id INT NULL,
 doctor_id INT NOT NULL,
 document_json JSON NOT NULL,
 issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uniq_certificate_visit (appointment_id),
 KEY idx_certificate_doctor_branch (doctor_id, branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
