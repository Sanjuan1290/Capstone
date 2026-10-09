-- CAPSTONE 2026-10-08: Add service-specific patient promotions and 12-hour booking cutoff.
-- Non-destructive; no TRUNCATE, DELETE, or reset. Back up before applying.
USE `carait_clinic_system`;

CREATE TABLE IF NOT EXISTS `clinic_promotions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(120) NOT NULL,
  `description` VARCHAR(1000) NOT NULL,
  `badge_text` VARCHAR(48) NULL,
  `starts_on` DATE NOT NULL,
  `ends_on` DATE NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 0,
  `show_on_dashboard` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by_admin_id` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_promo_public` (`is_active`, `starts_on`, `ends_on`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `clinic_promotion_services` (
  `promotion_id` INT NOT NULL,
  `service_id` INT NOT NULL,
  PRIMARY KEY (`promotion_id`, `service_id`),
  KEY `idx_promo_service` (`service_id`),
  CONSTRAINT `fk_promo_service_promotion`
    FOREIGN KEY (`promotion_id`) REFERENCES `clinic_promotions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_promo_service_catalog`
    FOREIGN KEY (`service_id`) REFERENCES `billing_service_catalog`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `clinic_promotion_notifications` (
  `promotion_id` INT NOT NULL,
  `patient_id` INT NOT NULL,
  `notified_at` DATETIME NULL,
  PRIMARY KEY (`promotion_id`, `patient_id`),
  CONSTRAINT `fk_promo_delivery_promotion` FOREIGN KEY (`promotion_id`) REFERENCES `clinic_promotions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_promo_delivery_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

UPDATE `booking_settings` SET `online_min_lead_minutes` = 720 WHERE `online_min_lead_minutes` < 720;

SELECT `online_min_lead_minutes`, `pending_confirmation_cutoff_minutes` FROM `booking_settings` WHERE `id` = 1;
SELECT COUNT(*) AS `promo_count` FROM `clinic_promotions`;

