-- CARAIT Clinic - Perception Point malware-scan status migration
-- Back up the database before applying. If you use `npm run migrate`, schema.js applies the same columns idempotently.
USE `carait_clinic_system`;

ALTER TABLE consultation_images
  ADD COLUMN security_scan_status VARCHAR(20) NOT NULL DEFAULT 'legacy' AFTER caption;

ALTER TABLE clinic_payment_settings
  ADD COLUMN gcash_qr_scan_status VARCHAR(20) NOT NULL DEFAULT 'legacy' AFTER maya_qr_url,
  ADD COLUMN maya_qr_scan_status VARCHAR(20) NOT NULL DEFAULT 'legacy' AFTER gcash_qr_scan_status;

-- Existing images/QRs predate malware-scan tracking and remain marked `legacy`.
