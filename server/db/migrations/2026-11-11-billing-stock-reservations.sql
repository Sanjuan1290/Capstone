-- Added for the unified billing stock-out workflow. Never delete old movements.
-- Pending rows mark stock used in consultation until the bill is settled.
CREATE TABLE IF NOT EXISTS clinical_inventory_reservations (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 consultation_usage_id BIGINT NOT NULL,
 billing_id INT NOT NULL,
 inventory_id INT NOT NULL,
 batch_id INT NOT NULL,
 location_id INT NOT NULL,
 package_quantity DECIMAL(12,4) NOT NULL,
 usage_quantity DECIMAL(12,4) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'pending',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 posted_at DATETIME NULL,
 posted_by_role VARCHAR(20) NULL,
 posted_by_user_id INT NULL,
 UNIQUE KEY uq_clinical_reservation_batch (consultation_usage_id,batch_id,location_id),
 KEY idx_clinical_reservation_available (batch_id,location_id,status),
 KEY idx_clinical_reservation_bill (billing_id,status),
 CONSTRAINT fk_clinical_reservation_usage FOREIGN KEY(consultation_usage_id) REFERENCES consultation_inventory_usage(id) ON DELETE RESTRICT,
 CONSTRAINT fk_clinical_reservation_bill FOREIGN KEY(billing_id) REFERENCES billing_records(id) ON DELETE RESTRICT,
 CONSTRAINT fk_clinical_reservation_batch FOREIGN KEY(batch_id) REFERENCES inventory_batches(id) ON DELETE RESTRICT,
 CONSTRAINT fk_clinical_reservation_location FOREIGN KEY(location_id) REFERENCES inventory_locations(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
