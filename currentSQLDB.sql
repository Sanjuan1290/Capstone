-- MySQL dump 10.13  Distrib 8.0.41, for Win64 (x86_64)
--
-- Host: localhost    Database: carait_clinic_system
-- ------------------------------------------------------
-- Server version	8.0.41

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `admins`
--

DROP TABLE IF EXISTS `admins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admins` (
  `id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(150) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `theme_preference` varchar(10) NOT NULL DEFAULT 'light',
  `profile_image_url` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `admins`
--

LOCK TABLES `admins` WRITE;
/*!40000 ALTER TABLE `admins` DISABLE KEYS */;
INSERT INTO `admins` VALUES (1,'Administrator','admin@gmail.com','$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi','2026-03-29 02:46:42','light',NULL);
/*!40000 ALTER TABLE `admins` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `appointments`
--

DROP TABLE IF EXISTS `appointments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `appointments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int NOT NULL,
  `doctor_id` int NOT NULL,
  `clinic_type` enum('medical','derma') NOT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `appointment_date` date NOT NULL,
  `appointment_time` varchar(20) NOT NULL,
  `status` enum('pending','confirmed','completed','cancelled','rescheduled','no_show','in-progress') DEFAULT 'pending',
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `patient_id` (`patient_id`),
  KEY `doctor_id` (`doctor_id`),
  CONSTRAINT `appointments_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `appointments_ibfk_2` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `appointments`
--

LOCK TABLES `appointments` WRITE;
/*!40000 ALTER TABLE `appointments` DISABLE KEYS */;
INSERT INTO `appointments` VALUES (1,1,1,'derma','Skin Assessment','2026-03-30','9:00 AM','completed',NULL,'2026-03-29 02:59:27','2026-03-30 05:30:39'),(2,1,1,'derma','Acne Treatment','2026-03-29','1:00 PM','completed',NULL,'2026-03-29 03:01:23','2026-03-29 03:03:44'),(3,1,1,'derma','Follow-up Visit','2026-03-29','11:00 AM','completed','fsadf','2026-03-29 03:12:40','2026-03-29 03:38:11'),(4,2,1,'derma','General Consultation','2026-04-10','10:00 AM','completed',NULL,'2026-04-07 00:13:00','2026-04-10 10:26:47'),(5,2,1,'derma','Acne Treatment','2026-04-07','1:00 PM','completed',NULL,'2026-04-07 00:17:21','2026-04-07 00:23:17'),(6,1,1,'derma','Follow-up Visit','2026-04-07','7:00 PM','completed',NULL,'2026-04-07 10:42:02','2026-04-07 10:42:38'),(7,1,1,'derma','Acne Treatment','2026-04-10','3:00 PM','cancelled',NULL,'2026-04-07 10:47:13','2026-04-07 10:49:09'),(8,1,1,'derma','General Consultation','2026-04-15','10:00 AM','no_show',NULL,'2026-04-07 14:33:29','2026-04-19 14:07:33'),(9,1,1,'derma','Acne Treatment','2026-04-08','8:00 AM','no_show',NULL,'2026-04-07 14:39:01','2026-04-17 00:12:49'),(10,1,1,'derma','Acne Treatment','2026-04-08','9:00 AM','no_show',NULL,'2026-04-07 15:11:28','2026-04-17 00:12:49'),(11,1,1,'derma','Acne Treatment','2026-04-17','4:00 PM','completed','test','2026-04-16 23:58:07','2026-04-17 00:19:26'),(12,1,1,'derma','Acne Treatment','2026-04-17','3:00 PM','completed','test','2026-04-17 00:08:48','2026-04-17 00:15:01'),(13,1,1,'derma','Acne Treatment','2026-04-17','11:00 AM','completed','test','2026-04-17 00:13:36','2026-04-17 00:17:54'),(14,3,1,'derma','Skin Assessment','2026-04-20','1:00 PM','no_show','I wanna know my skin proper treatment','2026-04-19 01:56:42','2026-04-20 07:12:07'),(15,3,1,'derma','Skin Assessment','2026-04-19','1:00 PM','completed','wanna know something','2026-04-19 02:03:07','2026-04-19 14:11:42'),(16,1,1,'derma','Acne Treatment','2026-04-19','3:00 PM','completed',NULL,'2026-04-19 04:22:00','2026-04-19 14:11:51'),(17,4,1,'derma','Skin Assessment','2026-04-20','10:00 AM','no_show',NULL,'2026-04-19 13:56:05','2026-04-20 02:19:18'),(18,1,1,'derma','Acne Treatment','2026-04-20','11:00 AM','completed','test','2026-04-20 02:20:40','2026-04-20 10:00:17'),(19,5,1,'derma','Follow-up Visit','2026-04-19','8:00 PM','no_show','test','2026-04-20 09:04:53','2026-04-20 09:12:37'),(20,5,1,'derma','Acne Treatment','2026-04-20','9:00 PM','completed','test','2026-04-20 09:19:24','2026-04-20 09:22:14'),(21,5,1,'derma','Skin Assessment','2026-04-21','5:00 PM','completed',NULL,'2026-04-20 10:04:30','2026-04-21 03:15:46'),(22,1,1,'derma','Acne Treatment','2026-04-23','11:00 AM','cancelled',NULL,'2026-04-20 10:49:44','2026-04-22 06:29:15'),(23,1,1,'derma','walk in','2026-04-20','9:23 PM','no_show',NULL,'2026-04-20 13:23:07','2026-04-20 13:23:39'),(24,1,1,'derma','wer','2026-04-21','12:06 PM','completed',NULL,'2026-04-21 04:06:36','2026-04-21 04:07:13'),(25,1,1,'derma','Acne Treatment','2026-04-22','4:00 PM','completed','test','2026-04-22 06:29:25','2026-04-22 06:35:30'),(26,6,1,'derma','Acne Treatment','2026-04-23','10:00 PM','completed','test','2026-04-23 12:36:41','2026-04-23 12:58:32'),(27,1,1,'derma','Walk-in consultation','2026-04-23','8:57 PM','completed',NULL,'2026-04-23 12:57:39','2026-04-23 12:58:36');
/*!40000 ALTER TABLE `appointments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `consultations`
--

DROP TABLE IF EXISTS `consultations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `consultations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `appointment_id` int DEFAULT NULL,
  `doctor_id` int NOT NULL,
  `patient_id` int NOT NULL,
  `diagnosis` text,
  `prescription` text,
  `notes` text,
  `consulted_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `appointment_id` (`appointment_id`),
  KEY `doctor_id` (`doctor_id`),
  KEY `patient_id` (`patient_id`),
  CONSTRAINT `consultations_ibfk_1` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `consultations_ibfk_2` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`) ON DELETE CASCADE,
  CONSTRAINT `consultations_ibfk_3` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `consultations`
--

LOCK TABLES `consultations` WRITE;
/*!40000 ALTER TABLE `consultations` DISABLE KEYS */;
INSERT INTO `consultations` VALUES (1,2,1,1,'test diagnosis','[{\"medicine\":\"Tretinoin 0.025% Cream\",\"dosage\":\"2\",\"frequency\":\"Once daily\",\"duration\":\"\",\"notes\":\"\"}]','test notes','2026-03-29 03:03:44'),(2,3,1,1,'dfa','[{\"medicine\":\"Sunscreen SPF 50\",\"dosage\":\"12\",\"frequency\":\"Twice daily\",\"duration\":\"\",\"notes\":\"\"},{\"medicine\":\"Amoxicillin 500mg\",\"dosage\":\"12\",\"frequency\":\"Twice daily\",\"duration\":\"\",\"notes\":\"\"}]','fasasdsdd','2026-03-29 03:38:11'),(3,1,1,1,'testtest','[{\"medicine\":\"Paracetamol\",\"dosage\":\"12\",\"frequency\":\"Twice daily\",\"duration\":\"3 days\",\"notes\":\"test\"}]','test','2026-03-30 05:30:39'),(4,5,1,2,'Acne vulgaris (mild/moderate/severe — choose based on your case)','[{\"medicine\":\"Benzoyl Peroxide 2.5% gel\",\"dosage\":\"2\",\"frequency\":\"Twice daily\",\"duration\":\"1 month\",\"notes\":\"Take after meals\"}]','Patient presents with inflammatory acne (pimples, redness) on the face.\nPresence of comedones (blackheads and whiteheads).\nOccasional cystic lesions noted.\nNo signs of severe infection.','2026-04-07 00:23:17'),(5,6,1,1,'asdfasd','[{\"medicine\":\"amoxixilin\",\"dosage\":\"12\",\"frequency\":\"Three times daily\",\"duration\":\"7 days\",\"notes\":\"test\"}]','asdfasd','2026-04-07 10:42:38'),(6,4,1,2,'oks lang','[{\"medicine\":\"\",\"dosage\":\"\",\"frequency\":\"\",\"duration\":\"\",\"notes\":\"\"}]','wala','2026-04-10 10:26:47'),(7,12,1,1,'test','[{\"medicine\":\"Benzoyl Peroxide 2.5% gel\",\"dosage\":\"1\",\"frequency\":\"Once daily\",\"duration\":\"3 days\",\"notes\":\"test\"}]','test','2026-04-17 00:15:01'),(8,13,1,1,'test','[{\"medicine\":\"Paracetamol\",\"dosage\":\"1\",\"frequency\":\"Twice daily\",\"duration\":\"7 days\",\"notes\":\"test\"}]','test','2026-04-17 00:17:54'),(9,11,1,1,'test','[{\"medicine\":\"test\",\"dosage\":\"\",\"frequency\":\"\",\"duration\":\"\",\"notes\":\"\"}]','test','2026-04-17 00:19:26'),(10,15,1,3,'test','[{\"medicine\":\"Paracetamol\",\"dosage\":\"12\",\"frequency\":\"Once daily\",\"duration\":\"3 days\",\"notes\":\"\"}]','test','2026-04-19 04:07:35'),(11,20,1,5,'test','[{\"medicine\":\"Paracetamol\",\"dosage\":\"\",\"frequency\":\"Once daily\",\"duration\":\"5 days\",\"notes\":\"test\"}]','test','2026-04-20 09:22:14'),(12,18,1,1,'test','[{\"medicine\":\"Benzoyl Peroxide 2.5% gel\",\"dosage\":\"2 pack\",\"frequency\":\"Three times daily\",\"duration\":\"5 days\",\"notes\":\"123\"}]','trest','2026-04-20 10:00:17'),(13,21,1,5,NULL,'[{\"medicine\":\"\",\"dosage\":\"\",\"frequency\":\"\",\"duration\":\"\",\"notes\":\"\"}]',NULL,'2026-04-21 03:15:46'),(14,24,1,1,'wer','[{\"medicine\":\"Benzoyl Peroxide 2.5% gel\",\"dosage\":\"12\",\"frequency\":\"Once daily\",\"duration\":\"5 days\",\"notes\":\"\"}]','wer','2026-04-21 04:07:13'),(15,25,1,1,NULL,'[{\"medicine\":\"Benzoyl Peroxide 2.5% gel\",\"dosage\":\"7\",\"frequency\":\"Every 8 hours\",\"duration\":\"3 days\",\"notes\":\"\"}]',NULL,'2026-04-22 06:35:30'),(16,26,1,6,NULL,'[{\"medicine\":\"\",\"dosage\":\"\",\"frequency\":\"\",\"duration\":\"\",\"notes\":\"\"}]',NULL,'2026-04-23 12:58:32'),(17,27,1,1,NULL,'[{\"medicine\":\"\",\"dosage\":\"\",\"frequency\":\"\",\"duration\":\"\",\"notes\":\"\"}]',NULL,'2026-04-23 12:58:36');
/*!40000 ALTER TABLE `consultations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `doctor_schedules`
--

DROP TABLE IF EXISTS `doctor_schedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `doctor_schedules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `doctor_id` int NOT NULL,
  `day_of_week` enum('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `slot_duration_mins` int DEFAULT '30',
  `max_slots` int DEFAULT '10',
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `doctor_id` (`doctor_id`),
  CONSTRAINT `doctor_schedules_ibfk_1` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `doctor_schedules`
--

LOCK TABLES `doctor_schedules` WRITE;
/*!40000 ALTER TABLE `doctor_schedules` DISABLE KEYS */;
INSERT INTO `doctor_schedules` VALUES (1,1,'Monday','08:00:00','22:00:00',60,10,1),(2,1,'Tuesday','08:00:00','23:53:00',60,10,1),(3,1,'Wednesday','08:00:00','17:00:00',60,10,1),(4,1,'Thursday','08:00:00','23:00:00',60,10,1),(5,1,'Friday','12:00:00','17:00:00',60,10,1),(6,1,'Saturday','08:00:00','17:00:00',60,10,1),(7,1,'Sunday','08:00:00','22:00:00',60,10,1);
/*!40000 ALTER TABLE `doctor_schedules` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `doctors`
--

DROP TABLE IF EXISTS `doctors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `doctors` (
  `id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(150) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password` varchar(255) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `specialty` varchar(100) DEFAULT NULL,
  `prc_license` varchar(50) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `theme_preference` varchar(10) NOT NULL DEFAULT 'light',
  `profile_image_url` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `doctors`
--

LOCK TABLES `doctors` WRITE;
/*!40000 ALTER TABLE `doctors` DISABLE KEYS */;
INSERT INTO `doctors` VALUES (1,'Dr. Aaron corsino','robertrenbysanjuan@gmail.com','$2b$10$u5Og1riMUbVhMqNWeZ7hM.kPZqHob0QAj4vbh36O9QGbsinGS3z0G','0905454434','Dermatologist',NULL,1,'2026-03-29 02:56:44','light','https://res.cloudinary.com/dvazrmgq9/image/upload/v1776572601/sdpki1i5pcmg7oah6ypa.png');
/*!40000 ALTER TABLE `doctors` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inventory`
--

DROP TABLE IF EXISTS `inventory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventory` (
  `id` int NOT NULL AUTO_INCREMENT,
  `barcode` varchar(50) DEFAULT NULL,
  `name` varchar(150) NOT NULL,
  `category` enum('Derma','Medicine','Supplies') NOT NULL,
  `unit` varchar(30) DEFAULT NULL,
  `stock` int DEFAULT '0',
  `threshold` int DEFAULT '5',
  `price` decimal(10,2) DEFAULT '0.00',
  `supplier` varchar(150) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `base_unit` varchar(50) DEFAULT NULL,
  `unit_size` decimal(10,2) NOT NULL DEFAULT '1.00',
  `stock_base` decimal(12,2) NOT NULL DEFAULT '0.00',
  `expiration_date` date DEFAULT NULL,
  `storage_location` varchar(120) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `barcode` (`barcode`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventory`
--

LOCK TABLES `inventory` WRITE;
/*!40000 ALTER TABLE `inventory` DISABLE KEYS */;
INSERT INTO `inventory` VALUES (1,'MED-002','Paracetamol','Derma','bottle',90,5,4.00,NULL,'2026-03-29 03:15:42','2026-04-19 05:50:13','piece',1.00,90.00,'2027-06-17',NULL),(2,'MED-001','amoxixilin','Medicine','piece',90,5,12.00,'ewan','2026-03-30 05:36:47','2026-04-20 02:29:04','piece',1.00,90.00,'2027-01-19','Shelf A1'),(3,'MED-003','Benzoyl Peroxide 2.5% gel','Derma','pack',161,5,50.00,'Dermacare PH','2026-04-07 00:22:09','2026-04-21 13:13:33','piece',1.00,161.00,'2026-04-30','Shelf- A2');
/*!40000 ALTER TABLE `inventory` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inventory_batches`
--

DROP TABLE IF EXISTS `inventory_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventory_batches` (
  `id` int NOT NULL AUTO_INCREMENT,
  `inventory_id` int NOT NULL,
  `quantity` decimal(12,2) NOT NULL DEFAULT '0.00',
  `expiration_date` date DEFAULT NULL,
  `note` text,
  `received_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_inventory_batches_inventory_expiry` (`inventory_id`,`expiration_date`,`received_at`),
  CONSTRAINT `fk_inventory_batches_inventory` FOREIGN KEY (`inventory_id`) REFERENCES `inventory` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventory_batches`
--

LOCK TABLES `inventory_batches` WRITE;
/*!40000 ALTER TABLE `inventory_batches` DISABLE KEYS */;
INSERT INTO `inventory_batches` VALUES (1,1,90.00,'2027-06-17','Legacy opening balance','2026-04-19 05:50:13'),(2,2,90.00,'2027-01-19','Legacy opening balance','2026-04-20 02:29:04'),(3,3,61.00,'2026-04-30','Legacy opening balance','2026-04-19 06:22:00'),(4,3,100.00,'2027-02-08','Manual stock-in','2026-04-21 13:13:33');
/*!40000 ALTER TABLE `inventory_batches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inventory_logs`
--

DROP TABLE IF EXISTS `inventory_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventory_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `inventory_id` int NOT NULL,
  `staff_id` int DEFAULT NULL,
  `type` enum('in','out') NOT NULL,
  `qty` int NOT NULL,
  `note` text,
  `logged_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `admin_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `inventory_id` (`inventory_id`),
  KEY `staff_id` (`staff_id`),
  CONSTRAINT `inventory_logs_ibfk_1` FOREIGN KEY (`inventory_id`) REFERENCES `inventory` (`id`) ON DELETE CASCADE,
  CONSTRAINT `inventory_logs_ibfk_2` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventory_logs`
--

LOCK TABLES `inventory_logs` WRITE;
/*!40000 ALTER TABLE `inventory_logs` DISABLE KEYS */;
INSERT INTO `inventory_logs` VALUES (1,1,NULL,'in',100,'test','2026-03-29 03:25:38',NULL),(2,1,NULL,'out',10,'Supply request approved','2026-03-29 03:29:28',NULL),(3,3,NULL,'out',10,'Supply request approved','2026-04-07 14:35:17',NULL),(4,3,NULL,'out',20,'Supply request approved','2026-04-07 14:41:38',NULL),(5,3,NULL,'out',10,NULL,'2026-04-19 02:19:13',NULL),(6,3,1,'out',1,'testtest','2026-04-19 04:20:55',NULL),(7,3,1,'in',1,NULL,'2026-04-19 04:21:19',NULL),(8,3,NULL,'in',1,NULL,'2026-04-19 06:22:00',1),(9,2,1,'out',10,'test','2026-04-20 02:29:04',NULL),(10,3,NULL,'in',100,'Manual stock-in (batch expiry: 2027-02-08)','2026-04-21 13:13:33',1);
/*!40000 ALTER TABLE `inventory_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `landing_page_content`
--

DROP TABLE IF EXISTS `landing_page_content`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `landing_page_content` (
  `id` int NOT NULL,
  `content` json NOT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `landing_page_content`
--

LOCK TABLES `landing_page_content` WRITE;
/*!40000 ALTER TABLE `landing_page_content` DISABLE KEYS */;
INSERT INTO `landing_page_content` VALUES (1,'{\"hero\": {\"heading\": \"CARAIT MEDICAL AND DERMATOLOGY CLINIC\", \"section_id\": \"home\", \"subheading\": \"Providers of Comprehensive Care\", \"description\": \"Since our founding in 2015, we have been committed to providing modern, efficient, and high-quality medical and dermatological care to every patient. We focus on wellness and holistic care, ensuring personalized treatment for everyone who visits our clinic.\", \"overlay_opacity\": 0.7, \"heading_highlight\": \"DERMATOLOGY CLINIC\", \"primary_button_path\": \"/patient/register\", \"background_image_url\": \"https://res.cloudinary.com/dvazrmgq9/image/upload/v1776601143/n3uzmcjyhk3dsjjqjalb.png\", \"primary_button_label\": \"Book Appointment\", \"secondary_button_path\": \"#about\", \"secondary_button_label\": \"Learn More\"}, \"about\": {\"heading\": \"ABOUT OUR CLINIC\", \"image_alt\": \"Carait Medical and Dermatology Clinic\", \"image_url\": \"/about/aboutClinic.png\", \"badge_text\": \"Years Experience\", \"section_id\": \"about\", \"badge_title\": \"10+\", \"vision_body\": \"To be a trusted healthcare provider known for modern treatments, patient-centered care, and excellence in dermatological and medical services.\", \"body_primary\": \"Since its founding in 2015, Carait Medical and Dermatology Clinic has been committed to providing patients with affordable, reliable, and efficient healthcare services. Our goal is to deliver quality medical and dermatologic care that focuses on the overall health and well-being of every patient who visits our clinic.\", \"mission_body\": \"To provide accessible, compassionate, and high-quality medical and dermatological care that improves the health and wellbeing of our patients.\", \"vision_title\": \"Our Vision\", \"mission_title\": \"Our Mission\", \"body_secondary\": \"We strive to minimize patient wait times and continuously improve our services to make healthcare more convenient and accessible. Whenever possible, we also offer same-day appointments to better accommodate urgent medical needs. Our clinic is located at A. Bonifacio St., Brgy. Canlalay, Binan, Laguna, where we proudly serve the local community with compassionate and patient-centered care.\"}, \"footer\": {\"copyright\": \"©2023 by Carait Medical and Dermatology Clinic\", \"terms_url\": \"/terms\", \"privacy_url\": \"/privacy-policy\", \"facebook_url\": \"https://www.facebook.com/carait.mdc?mibextid=LQQJ4d\"}, \"header\": {\"cta_path\": \"/patient/register\", \"logo_url\": \"https://res.cloudinary.com/dvazrmgq9/image/upload/v1776399780/inqrsrbh9wnpg80gd7jc.png\", \"cta_label\": \"Book Appointment\", \"nav_links\": [{\"path\": \"#home\", \"label\": \"Home\"}, {\"path\": \"#about\", \"label\": \"About\"}, {\"path\": \"#services\", \"label\": \"Services\"}, {\"path\": \"#doctors\", \"label\": \"Doctors\"}, {\"path\": \"#contact\", \"label\": \"Contact\"}], \"login_path\": \"/patient/login\", \"clinic_name\": \"CARAIT MEDICAL AND DERMATOLOGY CLINIC\", \"login_label\": \"Log in\"}, \"contact\": {\"hours\": \"Monday - Saturday: 9:00 AM - 6:00 PM\\nSunday: Closed\", \"phone\": \"(0949) 998 6956\", \"heading\": \"CONTACT US\", \"cta_path\": \"/patient/register\", \"cta_label\": \"Book Appointment\", \"section_id\": \"contact\", \"cta_heading\": \"Ready to Book an Appointment?\", \"description\": \"We\'d love to hear from you. Visit us or reach out anytime.\", \"hours_title\": \"Clinic Hours\", \"phone_title\": \"Phone Number\", \"address_lines\": [\"A. Bonifacio St., Brgy. Canlalay\", \"Binan, Laguna 4024\"], \"map_embed_url\": \"https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d43325.4203321316!2d121.06200694781873!3d14.342479587423213!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397d7dd46e3b0cf%3A0x1e83bf84b4d824b3!2scarait%20medical%20and%20dermatological%20clinic!5e1!3m2!1sen!2sph!4v1773723093429!5m2!1sen!2sph\", \"location_title\": \"Our Location\", \"cta_description\": \"Same-day appointments available whenever possible.\"}, \"doctors\": {\"items\": [{\"name\": \"DR. MAGTANGOL JOSE C. CARAIT IV\", \"image\": \"/doctors/tanjol.png\", \"specialize\": \"Family Medicine Specialist\", \"description\": \"Dr. Carait is a Fellow of the Philippine Academy of Family Physicians (PAFP). He is also a certified medical acupuncturist and a member of the Philippine Institute of Traditional and Alternative Health Care (PITAHC).\"}, {\"name\": \"DR. PAULA KARINA GONZALES-CARAIT\", \"image\": \"/doctors/paula.png\", \"specialize\": \"Dermatologist\", \"description\": \"Dr. Gonzales-Carait is a Board-certified Dermatologist. She is a Fellow of the Philippine Dermatological Society and the Philippine Society of Venereology Inc.\"}], \"heading\": \"OUR DOCTORS\", \"section_id\": \"doctors\", \"description\": \"Meet our team of experienced and compassionate doctors, committed to providing high-quality medical and dermatological care.\"}, \"services\": {\"items\": [{\"bg\": \"bg-blue-50\", \"name\": \"MEDICAL CONSULTATIONS\", \"image\": \"/services/medical_consultation.png\", \"description\": \"Consultations for medical concerns for all ages (baby to adult) and surgical procedures (minor excision, circumcision etc).\"}, {\"bg\": \"bg-green-50\", \"name\": \"VACCINATIONS\", \"image\": \"/services/vaccination.png\", \"description\": \"It can be so tempting to put off your next appointment. At Carait Medical and Dermatology Clinic, we make it easier than ever to schedule Vaccinations.\"}, {\"bg\": \"bg-purple-50\", \"name\": \"DERMATOLOGIC CONSULTS AND PROCEDURES\", \"image\": \"/services/dermatologic_consults_procedures.png\", \"description\": \"Concern on skin, hair and nails for all ages. Dermatologic procedures include laser for rejuvenation and scars, intense pulse light treatment for anti-aging and hair removal, electrocautery for warts and syringoma, chemical peeling, and skin biopsy.\"}, {\"bg\": \"bg-yellow-50\", \"name\": \"ACUPUNCTURE\", \"image\": \"/services/acupuncture.png\", \"description\": \"Acupuncture for pain relief, vertigo, migraine, insomnia and smoking cessation and more.\"}, {\"bg\": \"bg-red-50\", \"name\": \"ANIMAL BITE CENTER (ABC)\", \"image\": \"/services/animal_bite_center(ABC).png\", \"description\": \"We offer vaccines for pre-exposure prophylaxis and post-exposure animal bite management by our trained doctors.\"}], \"heading\": \"OUR SERVICES\", \"section_id\": \"services\", \"description\": \"We provide a wide range of medical and dermatological services focused on patient wellness, modern treatments, and quality healthcare.\"}, \"testimonial\": {\"quote\": \"Thank you dra for making us beautiful and gwapod as can be. Our monthly IPL and microneedling all paid off. Thank you for removing my 10 step Korean skincare regimen and working your magic on us.\", \"heading\": \"WHAT OUR PATIENTS SAY ABOUT US\", \"image_alt\": \"Patient Feedback\", \"image_url\": \"/about/feedback.png\", \"subheading\": \"Only the Best\"}}','2026-04-19 12:19:06');
/*!40000 ALTER TABLE `landing_page_content` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `type` varchar(60) NOT NULL,
  `title` varchar(200) NOT NULL,
  `message` text,
  `reference_type` varchar(50) DEFAULT NULL,
  `reference_id` int DEFAULT NULL,
  `body` text,
  `link` varchar(255) DEFAULT NULL,
  `target_role` enum('admin','staff','doctor','patient') NOT NULL,
  `target_user_id` int DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_target` (`target_role`,`target_user_id`,`is_read`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=63 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES (1,'appointment_booked','New patient booking','Robert Renby San Juan booked an appointment with Dr. Aaron corsino on 2026-04-17 at 3:00 PM.','appointment',12,NULL,NULL,'admin',NULL,1,'2026-04-17 00:08:48'),(2,'appointment_booked','New patient booking','Robert Renby San Juan booked an appointment with Dr. Aaron corsino on 2026-04-17 at 3:00 PM.','appointment',12,NULL,NULL,'staff',NULL,1,'2026-04-17 00:08:48'),(3,'appointment_booked','Appointment received','Your appointment request for 2026-04-17 at 3:00 PM is pending confirmation.','appointment',12,NULL,NULL,'patient',1,1,'2026-04-17 00:08:48'),(4,'appointment_booked','New patient booking','Robert Renby San Juan booked an appointment with Dr. Aaron corsino on 2026-04-17 at 11:00 AM.','appointment',13,NULL,NULL,'admin',NULL,1,'2026-04-17 00:13:36'),(5,'appointment_booked','New patient booking','Robert Renby San Juan booked an appointment with Dr. Aaron corsino on 2026-04-17 at 11:00 AM.','appointment',13,NULL,NULL,'staff',NULL,1,'2026-04-17 00:13:36'),(6,'appointment_booked','Appointment received','Your appointment request for 2026-04-17 at 11:00 AM is pending confirmation.','appointment',13,NULL,NULL,'patient',1,1,'2026-04-17 00:13:36'),(7,'appointment_confirmed','Appointment confirmed','Your appointment with Dr. Aaron corsino has been confirmed.','appointment',13,NULL,NULL,'patient',1,1,'2026-04-17 00:14:29'),(8,'appointment_confirmed','Appointment confirmed','Your appointment with Dr. Aaron corsino has been confirmed.','appointment',13,NULL,NULL,'patient',1,1,'2026-04-17 00:14:31'),(9,'appointment_booked','New patient booking','nick ryan san juan booked an appointment with Dr. Aaron corsino on 2026-04-20 at 1:00 PM.','appointment',14,NULL,NULL,'admin',NULL,1,'2026-04-19 01:56:42'),(10,'appointment_booked','New patient booking','nick ryan san juan booked an appointment with Dr. Aaron corsino on 2026-04-20 at 1:00 PM.','appointment',14,NULL,NULL,'staff',NULL,1,'2026-04-19 01:56:42'),(11,'appointment_booked','Appointment received','Your appointment request for 2026-04-20 at 1:00 PM is pending confirmation.','appointment',14,NULL,NULL,'patient',3,1,'2026-04-19 01:56:42'),(12,'appointment_confirmed','Appointment confirmed','Your appointment with Dr. Aaron corsino has been confirmed.','appointment',14,NULL,NULL,'patient',3,1,'2026-04-19 01:58:53'),(13,'appointment_rescheduled','Appointment rescheduled','Your appointment with Dr. Aaron corsino was moved to 2026-04-20 at 1:00 PM.','appointment',14,NULL,NULL,'patient',3,1,'2026-04-19 02:01:07'),(14,'appointment_booked','New patient booking','nick ryan san juan booked an appointment with Dr. Aaron corsino on 2026-04-19 at 1:00 PM.','appointment',15,NULL,NULL,'admin',NULL,1,'2026-04-19 02:03:07'),(15,'appointment_booked','New patient booking','nick ryan san juan booked an appointment with Dr. Aaron corsino on 2026-04-19 at 1:00 PM.','appointment',15,NULL,NULL,'staff',NULL,1,'2026-04-19 02:03:07'),(16,'appointment_booked','Appointment received','Your appointment request for 2026-04-19 at 1:00 PM is pending confirmation.','appointment',15,NULL,NULL,'patient',3,0,'2026-04-19 02:03:07'),(17,'appointment_confirmed','Appointment confirmed','Your appointment with Dr. Aaron corsino has been confirmed.','appointment',15,NULL,NULL,'patient',3,1,'2026-04-19 02:03:14'),(18,'appointment_confirmed','Appointment confirmed','Your appointment with Dr. Aaron corsino has been confirmed.','appointment',14,NULL,NULL,'patient',3,0,'2026-04-19 04:05:28'),(19,'appointment_booked','New patient booking','Robert Renby San Juan booked an appointment with Dr. Aaron corsino on 2026-04-19 at 3:00 PM.','appointment',16,NULL,NULL,'admin',NULL,1,'2026-04-19 04:22:00'),(20,'appointment_booked','New patient booking','Robert Renby San Juan booked an appointment with Dr. Aaron corsino on 2026-04-19 at 3:00 PM.','appointment',16,NULL,NULL,'staff',NULL,1,'2026-04-19 04:22:00'),(21,'appointment_booked','Appointment received','Your appointment request for 2026-04-19 at 3:00 PM is pending confirmation.','appointment',16,NULL,NULL,'patient',1,1,'2026-04-19 04:22:00'),(22,'appointment_booked','New patient booking','pete san juan booked an appointment with Dr. Aaron corsino on 2026-04-20 at 10:00 AM.','appointment',17,NULL,NULL,'admin',NULL,1,'2026-04-19 13:56:05'),(23,'appointment_booked','New patient booking','pete san juan booked an appointment with Dr. Aaron corsino on 2026-04-20 at 10:00 AM.','appointment',17,NULL,NULL,'staff',NULL,1,'2026-04-19 13:56:05'),(24,'appointment_booked','Appointment received','Your appointment request for 2026-04-20 at 10:00 AM is pending confirmation.','appointment',17,NULL,NULL,'patient',4,0,'2026-04-19 13:56:05'),(25,'appointment_confirmed','Appointment confirmed','Your appointment with Dr. Aaron corsino has been confirmed.','appointment',17,NULL,NULL,'patient',4,0,'2026-04-19 13:57:15'),(26,'appointment_confirmed','Appointment confirmed','Your appointment with Dr. Aaron corsino has been confirmed.','appointment',8,NULL,NULL,'patient',1,1,'2026-04-19 14:07:28'),(27,'appointment_booked','New patient booking','Robert Renby San Juan booked an appointment with Dr. Aaron corsino on 2026-04-20 at 11:00 AM.','appointment',18,NULL,NULL,'admin',NULL,1,'2026-04-20 02:20:40'),(28,'appointment_booked','New patient booking','Robert Renby San Juan booked an appointment with Dr. Aaron corsino on 2026-04-20 at 11:00 AM.','appointment',18,NULL,NULL,'staff',NULL,1,'2026-04-20 02:20:40'),(29,'appointment_booked','Appointment received','Your appointment request for 2026-04-20 at 11:00 AM is pending confirmation.','appointment',18,NULL,NULL,'patient',1,1,'2026-04-20 02:20:40'),(30,'appointment_confirmed','Appointment confirmed','Your appointment with Dr. Aaron corsino has been confirmed.','appointment',18,NULL,NULL,'patient',1,1,'2026-04-20 02:22:11'),(31,'appointment_booked','New patient booking','raniel tafalla booked an appointment with Dr. Aaron corsino on 2026-04-20 at 7:00 PM.','appointment',19,NULL,NULL,'admin',NULL,1,'2026-04-20 09:04:53'),(32,'appointment_booked','New patient booking','raniel tafalla booked an appointment with Dr. Aaron corsino on 2026-04-20 at 7:00 PM.','appointment',19,NULL,NULL,'staff',NULL,1,'2026-04-20 09:04:53'),(33,'appointment_booked','Appointment received','Your appointment request for 2026-04-20 at 7:00 PM is pending confirmation.','appointment',19,NULL,NULL,'patient',5,1,'2026-04-20 09:04:53'),(34,'appointment_confirmed','Appointment confirmed','Your appointment with Dr. Aaron corsino has been confirmed.','appointment',19,NULL,NULL,'patient',5,1,'2026-04-20 09:11:03'),(35,'appointment_rescheduled','Appointment rescheduled','Your appointment with Dr. Aaron corsino was moved to 2026-04-19 at 8:00 PM.','appointment',19,NULL,NULL,'patient',5,1,'2026-04-20 09:11:37'),(36,'appointment_confirmed','Appointment confirmed','Your appointment with Dr. Aaron corsino has been confirmed.','appointment',19,NULL,NULL,'patient',5,1,'2026-04-20 09:12:34'),(37,'appointment_booked','New patient booking','raniel tafalla booked an appointment with Dr. Aaron corsino on 2026-04-20 at 9:00 PM.','appointment',20,NULL,NULL,'admin',NULL,1,'2026-04-20 09:19:24'),(38,'appointment_booked','New patient booking','raniel tafalla booked an appointment with Dr. Aaron corsino on 2026-04-20 at 9:00 PM.','appointment',20,NULL,NULL,'staff',NULL,1,'2026-04-20 09:19:24'),(39,'appointment_booked','Appointment received','Your appointment request for 2026-04-20 at 9:00 PM is pending confirmation.','appointment',20,NULL,NULL,'patient',5,1,'2026-04-20 09:19:24'),(40,'appointment_booked','New patient booking','raniel tafalla booked an appointment with Dr. Aaron corsino on 2026-04-20 at 8:00 PM.','appointment',21,NULL,NULL,'admin',NULL,1,'2026-04-20 10:04:30'),(41,'appointment_booked','New patient booking','raniel tafalla booked an appointment with Dr. Aaron corsino on 2026-04-20 at 8:00 PM.','appointment',21,NULL,NULL,'staff',NULL,1,'2026-04-20 10:04:30'),(42,'appointment_booked','Appointment received','Your appointment request for 2026-04-20 at 8:00 PM is pending confirmation.','appointment',21,NULL,NULL,'patient',5,1,'2026-04-20 10:04:30'),(43,'appointment_rescheduled','Appointment rescheduled','Your appointment with Dr. Aaron corsino was moved to 2026-04-20 at 8:00 PM and is pending confirmation.','appointment',21,NULL,NULL,'patient',5,0,'2026-04-20 10:06:49'),(44,'appointment_rescheduled','Appointment rescheduled','Your appointment with Dr. Aaron corsino was moved to 2026-04-21 at 6:00 PM and is pending confirmation.','appointment',21,NULL,NULL,'patient',5,0,'2026-04-20 10:07:04'),(45,'appointment_booked','New patient booking','Robert Renby San Juan booked an appointment with Dr. Aaron corsino on 2026-04-20 at 8:00 PM.','appointment',22,NULL,NULL,'admin',NULL,1,'2026-04-20 10:49:44'),(46,'appointment_booked','New patient booking','Robert Renby San Juan booked an appointment with Dr. Aaron corsino on 2026-04-20 at 8:00 PM.','appointment',22,NULL,NULL,'staff',NULL,1,'2026-04-20 10:49:44'),(47,'appointment_booked','Appointment received','Your appointment request for 2026-04-20 at 8:00 PM is pending confirmation.','appointment',22,NULL,NULL,'patient',1,1,'2026-04-20 10:49:44'),(48,'appointment_rescheduled','Appointment rescheduled','Your appointment with Dr. Aaron corsino was moved to 2026-04-21 at 3:00 PM and is pending confirmation.','appointment',21,NULL,NULL,'patient',5,0,'2026-04-20 10:50:48'),(49,'appointment_rescheduled','Appointment rescheduled','Your appointment with Dr. Aaron corsino was moved to 2026-04-22 at 11:00 AM.','appointment',22,NULL,NULL,'patient',1,1,'2026-04-20 11:35:26'),(50,'appointment_rescheduled','Appointment rescheduled','Your appointment with Dr. Aaron corsino was moved to 2026-04-21 at 5:00 PM.','appointment',21,NULL,NULL,'patient',5,0,'2026-04-20 11:35:45'),(51,'appointment_rescheduled','Appointment rescheduled','Your appointment with Dr. Aaron corsino was moved to 2026-04-22 at 9:00 AM.','appointment',22,NULL,NULL,'patient',1,1,'2026-04-20 11:36:19'),(52,'appointment_rescheduled','Appointment rescheduled','Your appointment with Dr. Aaron corsino was moved to 2026-04-22 at 9:00 AM.','appointment',22,NULL,NULL,'patient',1,1,'2026-04-20 11:36:39'),(53,'appointment_rescheduled','Appointment rescheduled','Your appointment with Dr. Aaron corsino was moved to 2026-04-23 at 11:00 AM.','appointment',22,NULL,NULL,'patient',1,1,'2026-04-20 12:34:20'),(54,'appointment_cancelled','Appointment cancelled','Your appointment has been cancelled.','appointment',22,NULL,NULL,'patient',1,0,'2026-04-22 06:29:15'),(55,'appointment_booked','New patient booking','Robert Renby San Juan booked an appointment with Dr. Aaron corsino on 2026-04-22 at 4:00 PM.','appointment',25,NULL,NULL,'admin',NULL,0,'2026-04-22 06:29:25'),(56,'appointment_booked','New patient booking','Robert Renby San Juan booked an appointment with Dr. Aaron corsino on 2026-04-22 at 4:00 PM.','appointment',25,NULL,NULL,'staff',NULL,0,'2026-04-22 06:29:25'),(57,'appointment_booked','Appointment received','Your appointment request for 2026-04-22 at 4:00 PM is pending confirmation.','appointment',25,NULL,NULL,'patient',1,0,'2026-04-22 06:29:25'),(58,'appointment_confirmed','Appointment confirmed','Your appointment with Dr. Aaron corsino has been confirmed.','appointment',25,NULL,NULL,'patient',1,0,'2026-04-22 06:29:48'),(59,'appointment_booked','New patient booking','nico vallente booked an appointment with Dr. Aaron corsino on 2026-04-23 at 10:00 PM.','appointment',26,NULL,NULL,'admin',NULL,0,'2026-04-23 12:36:41'),(60,'appointment_booked','New patient booking','nico vallente booked an appointment with Dr. Aaron corsino on 2026-04-23 at 10:00 PM.','appointment',26,NULL,NULL,'staff',NULL,0,'2026-04-23 12:36:41'),(61,'appointment_booked','Appointment received','Your appointment request for 2026-04-23 at 10:00 PM is pending confirmation.','appointment',26,NULL,NULL,'patient',6,0,'2026-04-23 12:36:41'),(62,'appointment_confirmed','Appointment confirmed','Your appointment with Dr. Aaron corsino has been confirmed.','appointment',26,NULL,NULL,'patient',6,0,'2026-04-23 12:38:35');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `password_resets`
--

DROP TABLE IF EXISTS `password_resets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_resets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(150) NOT NULL,
  `token` varchar(64) NOT NULL,
  `role` enum('patient','doctor','staff') NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `email_role` (`email`,`role`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `password_resets`
--

LOCK TABLES `password_resets` WRITE;
/*!40000 ALTER TABLE `password_resets` DISABLE KEYS */;
/*!40000 ALTER TABLE `password_resets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `patient_consents`
--

DROP TABLE IF EXISTS `patient_consents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `patient_consents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int NOT NULL,
  `consent_type` enum('treatment','privacy','data_processing') NOT NULL,
  `signed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `ip_address` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `patient_id` (`patient_id`),
  CONSTRAINT `patient_consents_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `patient_consents`
--

LOCK TABLES `patient_consents` WRITE;
/*!40000 ALTER TABLE `patient_consents` DISABLE KEYS */;
INSERT INTO `patient_consents` VALUES (1,4,'data_processing','2026-04-19 13:55:25','::1'),(2,5,'data_processing','2026-04-20 08:59:41','::1'),(3,6,'data_processing','2026-04-23 12:29:28','::1');
/*!40000 ALTER TABLE `patient_consents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `patient_phone_verifications`
--

DROP TABLE IF EXISTS `patient_phone_verifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `patient_phone_verifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `phone` varchar(20) NOT NULL,
  `otp_code` varchar(6) NOT NULL,
  `payload` json NOT NULL,
  `expires_at` datetime NOT NULL,
  `verified_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_patient_phone_verifications_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `patient_phone_verifications`
--

LOCK TABLES `patient_phone_verifications` WRITE;
/*!40000 ALTER TABLE `patient_phone_verifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `patient_phone_verifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `patients`
--

DROP TABLE IF EXISTS `patients`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `patients` (
  `id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(150) NOT NULL,
  `birthdate` date DEFAULT NULL,
  `gender` enum('Male','Female','Other') DEFAULT NULL,
  `sex` enum('Male','Female','Other') DEFAULT NULL,
  `civil_status` enum('Single','Married','Widowed','Divorced') DEFAULT NULL,
  `phone` varchar(20) NOT NULL,
  `address` text,
  `email` varchar(150) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `theme_preference` varchar(10) NOT NULL DEFAULT 'light',
  `profile_image_url` text,
  `is_walk_in` tinyint(1) NOT NULL DEFAULT '0',
  `consent_given` tinyint(1) NOT NULL DEFAULT '0',
  `consent_given_at` timestamp NULL DEFAULT NULL,
  `receive_promotions` tinyint(1) NOT NULL DEFAULT '0',
  `is_profile_complete` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `patients`
--

LOCK TABLES `patients` WRITE;
/*!40000 ALTER TABLE `patients` DISABLE KEYS */;
INSERT INTO `patients` VALUES (1,'Robert Renby San Juan','2005-01-18','Male','Male','Single','09057557640','blk 70 lot 44 cremona st. Bella Vista','robertrenbysanjuan@gmail.com','$2b$10$oq39VCMi5cuEk/ynvUiAZuprVQMq4g.RK5RvjrpasSHouRTK/XWSq','2026-03-29 02:52:38','2026-04-26 04:47:58','light','https://res.cloudinary.com/dvazrmgq9/image/upload/v1776383801/dbeexw7p6rorldrtbwab.jpg',0,0,NULL,0,0),(2,'nickryan san juan','2000-03-23','Male','Male','Divorced','09075638475','blk 70 lot 44 cremona st. Bella Vista','rrcsanjuan@pcu.edu.ph','$2b$10$ad24nSUgAhC2m5H/gZXKiOo8Y4G6LWEu91/76XbR5ZllTeiVLc.gO','2026-04-07 00:12:27','2026-04-26 04:47:58','light',NULL,0,0,NULL,0,0),(3,'nick ryan san juan','2002-03-07','Male','Male','Single','09057557640','blk 70 lot 44 cremona st. Bella Vista','nickryancsanjuan@gmail.com','$2b$10$aeS/eKIK4cDYh27gONxzvecMdNOnCpQUEZS62Z8ehPNe363mR8PMu','2026-04-19 01:55:18','2026-04-26 04:47:58','light',NULL,0,0,NULL,0,0),(4,'pete san juan','1952-01-03','Male','Male','Divorced','09057557640','blk 70 lot 44 cremona st. Bella Vista','sweetking370@gmail.com','$2b$10$MgwvtrxYJLtPG8AXm41LHeFSo9Z7qdPnGEmM1o9cNP3..OCAyu0gG','2026-04-19 13:55:25','2026-04-26 04:47:58','light','https://res.cloudinary.com/dvazrmgq9/image/upload/v1776606942/zshfv7vmsv5ulshugfoc.jpg',0,1,'2026-04-19 13:55:25',0,0),(5,'raniel tafalla','2005-06-14','Male','Male','Single','0907563847','blk 70 lot 44 cremona st. Bella Vista','rmtafalla@pcu.edu.ph','$2b$10$BQZBTieUaWIRWOcab0hAlOHhlMeVa8nyv05U7UKjI3BLcznSCPQG6','2026-04-20 08:59:41','2026-04-26 04:47:58','light',NULL,0,1,'2026-04-20 08:59:41',0,0),(6,'nico vallente','2004-01-16','Male','Male','Married','09057557640','blk 70 lot 44 cremona st. Bella Vista','acesalada1019652@gmail.com','$2b$10$tb1q/KGwWm.MdugD72VVl.e/.WvA76l1ldQHcBQ6BAjHAOeIAI79O','2026-04-23 12:29:28','2026-04-26 04:47:58','light',NULL,0,1,'2026-04-23 12:29:28',0,0);
/*!40000 ALTER TABLE `patients` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `queue`
--

DROP TABLE IF EXISTS `queue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `queue` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int DEFAULT NULL,
  `doctor_id` int NOT NULL,
  `queue_number` int NOT NULL,
  `patient_name` varchar(150) DEFAULT NULL,
  `type` enum('medical','derma') NOT NULL,
  `status` enum('waiting','in-progress','done','removed') DEFAULT 'waiting',
  `queue_date` date NOT NULL,
  `arrived_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `appointment_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `patient_id` (`patient_id`),
  KEY `doctor_id` (`doctor_id`),
  CONSTRAINT `queue_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE SET NULL,
  CONSTRAINT `queue_ibfk_2` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `queue`
--

LOCK TABLES `queue` WRITE;
/*!40000 ALTER TABLE `queue` DISABLE KEYS */;
INSERT INTO `queue` VALUES (1,NULL,1,1,'Robert Renby San Juan','derma','done','2026-04-07','2026-04-07 00:27:29',NULL),(2,NULL,1,2,'aaron','derma','done','2026-04-07','2026-04-07 00:27:40',NULL),(3,NULL,1,3,'test','derma','done','2026-04-07','2026-04-07 10:43:26',NULL),(4,NULL,1,4,'test2','derma','done','2026-04-07','2026-04-07 10:43:49',NULL),(5,NULL,1,5,'test3','derma','done','2026-04-07','2026-04-07 10:44:31',NULL),(6,NULL,1,6,'robert','derma','done','2026-04-07','2026-04-07 14:40:24',NULL),(7,NULL,1,7,'nico','derma','done','2026-04-07','2026-04-07 15:12:27',NULL),(8,NULL,1,1,'euri sajo','derma','done','2026-04-19','2026-04-19 02:04:05',NULL),(9,NULL,1,2,'aaron corsino','derma','done','2026-04-19','2026-04-19 02:05:44',NULL),(10,1,1,1,'Robert Renby San Juan','derma','done','2026-04-20','2026-04-20 10:39:45',NULL),(11,1,1,2,'Robert Renby San Juan','derma','in-progress','2026-04-20','2026-04-20 13:23:07',23),(12,1,1,1,'Robert Renby San Juan','derma','done','2026-04-21','2026-04-21 04:06:36',24),(13,1,1,1,'Robert Renby San Juan','derma','done','2026-04-23','2026-04-23 12:57:39',27);
/*!40000 ALTER TABLE `queue` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `staff`
--

DROP TABLE IF EXISTS `staff`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `staff` (
  `id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(150) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password` varchar(255) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `role` enum('staff') DEFAULT 'staff',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `status` enum('active','inactive') DEFAULT 'active',
  `theme_preference` varchar(10) NOT NULL DEFAULT 'light',
  `profile_image_url` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `staff`
--

LOCK TABLES `staff` WRITE;
/*!40000 ALTER TABLE `staff` DISABLE KEYS */;
INSERT INTO `staff` VALUES (1,'Nico Valeente','rrcsanjuan@pcu.edu.ph','$2b$10$FuQb.2aaa7zHelp0RMBl.uUWyINj9Xf5eUuiBtKpDESxVcNs0.aOK','09065464545','staff','2026-03-29 02:53:30','active','light',NULL);
/*!40000 ALTER TABLE `staff` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `supply_requests`
--

DROP TABLE IF EXISTS `supply_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `supply_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `doctor_id` int NOT NULL,
  `inventory_id` int NOT NULL,
  `qty_requested` int NOT NULL,
  `reason` text,
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `requested_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `doctor_id` (`doctor_id`),
  KEY `inventory_id` (`inventory_id`),
  CONSTRAINT `supply_requests_ibfk_1` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`) ON DELETE CASCADE,
  CONSTRAINT `supply_requests_ibfk_2` FOREIGN KEY (`inventory_id`) REFERENCES `inventory` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `supply_requests`
--

LOCK TABLES `supply_requests` WRITE;
/*!40000 ALTER TABLE `supply_requests` DISABLE KEYS */;
INSERT INTO `supply_requests` VALUES (1,1,1,10,NULL,'approved','2026-03-29 03:27:23','2026-03-29 03:29:28'),(2,1,3,10,NULL,'approved','2026-04-07 14:34:41','2026-04-07 14:35:17'),(3,1,3,20,NULL,'approved','2026-04-07 14:40:09','2026-04-07 14:41:38');
/*!40000 ALTER TABLE `supply_requests` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-04-27 14:14:14
