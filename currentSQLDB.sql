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
INSERT INTO `admins` VALUES (1,'Admin User','admin@gmail.com','$2b$10$zLwPIMvbDGAL81LIXT1V2eNWAstkOYoO17M9Y7LKODLK7.2VrI8ja','2026-04-27 06:51:27','light',NULL);
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
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `appointments`
--

LOCK TABLES `appointments` WRITE;
/*!40000 ALTER TABLE `appointments` DISABLE KEYS */;
INSERT INTO `appointments` VALUES (1,1,2,'medical','General Consultation','2026-04-27','4:00 PM','no_show',NULL,'2026-04-27 07:35:38','2026-04-27 08:02:24'),(2,1,1,'derma','Acne Treatment','2026-05-02','9:00 AM','completed',NULL,'2026-05-01 23:27:01','2026-05-01 23:32:46'),(3,1,1,'derma','Skin Assessment','2026-05-02','4:00 PM','completed',NULL,'2026-05-02 06:28:08','2026-05-02 06:32:03'),(4,2,1,'derma','Acne Treatment','2026-05-04','7:00 PM','completed',NULL,'2026-05-04 09:53:15','2026-05-04 10:51:36'),(5,1,1,'derma','Walk-in consultation','2026-05-04','6:44 PM','completed',NULL,'2026-05-04 10:44:20','2026-05-04 11:21:21'),(6,2,1,'derma','Acne Treatment','2026-05-04','9:00 PM','no_show',NULL,'2026-05-04 11:03:55','2026-05-05 03:49:06'),(7,3,2,'medical','Other','2026-05-05','3:00 PM','completed','Personal emergency','2026-05-05 03:53:30','2026-05-05 04:02:01'),(8,3,2,'medical','Follow-up Visit','2026-05-05','1:00 PM','no_show',NULL,'2026-05-05 04:02:23','2026-05-05 05:00:22'),(9,3,2,'medical','ewqeq','2026-05-05','12:03 PM','completed',NULL,'2026-05-05 04:03:44','2026-05-05 07:27:17'),(10,1,2,'medical','Annual Check-up','2026-05-27','10:00 AM','pending',NULL,'2026-05-05 06:21:48','2026-05-05 06:21:48'),(11,4,2,'medical','General Consultation','2026-05-05','4:00 PM','completed','test','2026-05-05 07:22:51','2026-05-05 08:34:44'),(12,4,2,'medical','test','2026-05-05','3:35 PM','completed',NULL,'2026-05-05 07:35:32','2026-05-05 07:38:59'),(13,5,1,'derma','Skin Assessment','2026-05-06','10:00 AM','pending',NULL,'2026-05-05 08:05:45','2026-05-05 08:05:45'),(14,5,2,'medical','test','2026-05-05','4:17 PM','in-progress',NULL,'2026-05-05 08:17:11','2026-05-05 08:19:23');
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
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `consultations`
--

LOCK TABLES `consultations` WRITE;
/*!40000 ALTER TABLE `consultations` DISABLE KEYS */;
INSERT INTO `consultations` VALUES (1,2,1,1,'test','[{\"medicine\":\"Hydroquinone Cream 4%\",\"dosage\":\"1\",\"frequency\":\"Once daily\",\"duration\":\"2 weeks\",\"notes\":\"teste\"}]','test','2026-05-01 23:32:46'),(2,3,1,1,NULL,'[{\"medicine\":\"Hydroquinone Cream 4%\",\"dosage\":\"1\",\"frequency\":\"Once daily\",\"duration\":\"7 days\",\"notes\":\"\"}]',NULL,'2026-05-02 06:32:03'),(3,4,1,2,'test','[{\"medicine\":\"Retinoid\",\"dosage\":\"12\",\"frequency\":\"Three times daily\",\"duration\":\"3 days\",\"notes\":\"\"}]','test','2026-05-04 10:51:36'),(4,5,1,1,'test','[{\"medicine\":\"Hydroquinone Cream 4%\",\"dosage\":\"12\",\"frequency\":\"Once daily\",\"duration\":\"5 days\",\"notes\":\"\"}]','testtest','2026-05-04 11:21:21'),(5,7,2,3,'test','[{\"medicine\":\"\",\"dosage\":\"\",\"frequency\":\"\",\"duration\":\"\",\"notes\":\"\"}]','severe','2026-05-05 04:02:01'),(6,9,2,3,NULL,'[{\"medicine\":\"\",\"dosage\":\"\",\"frequency\":\"\",\"duration\":\"\",\"notes\":\"\"}]',NULL,'2026-05-05 07:27:17'),(7,12,2,4,'test','[{\"medicine\":\"Retinoid\",\"dosage\":\"1\",\"frequency\":\"Three times daily\",\"duration\":\"7 days\",\"notes\":\"test\"}]','test','2026-05-05 07:38:59'),(8,11,2,4,NULL,'[{\"medicine\":\"\",\"dosage\":\"\",\"frequency\":\"\",\"duration\":\"\",\"notes\":\"\"}]',NULL,'2026-05-05 08:34:44');
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
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `doctor_schedules`
--

LOCK TABLES `doctor_schedules` WRITE;
/*!40000 ALTER TABLE `doctor_schedules` DISABLE KEYS */;
INSERT INTO `doctor_schedules` VALUES (1,2,'Monday','08:00:00','17:00:00',60,10,1),(2,2,'Friday','08:00:00','17:00:00',60,10,1),(3,2,'Saturday','08:00:00','17:00:00',60,10,1),(4,2,'Wednesday','08:00:00','17:00:00',60,10,1),(5,2,'Sunday','08:00:00','17:00:00',60,10,1),(6,2,'Tuesday','08:00:00','17:00:00',60,10,1),(7,2,'Thursday','08:00:00','17:00:00',60,10,1),(8,1,'Monday','08:00:00','22:00:00',60,10,1),(9,1,'Tuesday','08:00:00','17:00:00',60,10,1),(10,1,'Wednesday','08:00:00','17:00:00',60,10,1),(11,1,'Thursday','08:00:00','17:00:00',60,10,0),(12,1,'Sunday','08:00:00','17:00:00',60,10,1),(13,1,'Saturday','08:00:00','17:00:00',60,10,1),(14,1,'Friday','08:00:00','17:00:00',60,10,1);
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
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `doctors`
--

LOCK TABLES `doctors` WRITE;
/*!40000 ALTER TABLE `doctors` DISABLE KEYS */;
INSERT INTO `doctors` VALUES (1,'Dr. Aaron Corsino','robertrenbysanjuan@gmail.com','$2b$10$Xo.gmN5C.8YtYsW7pVDCIevJTvLhHO4HDn9fsi.PpHOvf9BaZ3KRW','639944799753','Dermatologist','PRC-01234',1,'2026-04-27 06:58:52','light',NULL),(2,'Dr. Euri Sajo','rrcsanjuan@pcu.edu.ph','$2b$10$gLyIIDFeIvfAMFskVUALre0nu8p0eD/9jPh7L4l5.RfPkNqM3OasK','639057557640','General Medicine','PRC-0234',1,'2026-04-27 06:59:31','light','https://res.cloudinary.com/dvazrmgq9/image/upload/v1777470658/l7ebjx5m4if33rcx4cwz.jpg');
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
INSERT INTO `inventory` VALUES (2,'MED-001','Retinoid','Derma','box',288,5,850.00,'DermaPharma Inc.','2026-04-27 07:13:12','2026-05-04 11:16:01','piece',30.00,8640.00,'2028-01-11','Shelf A1 / Cool Storage'),(3,'MED-002','Hydroquinone Cream 4%','Medicine','tube',45,5,620.00,'SkinCare Depot','2026-04-27 07:28:10','2026-04-27 07:28:10','piece',1.00,45.00,'2028-10-27',NULL);
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
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventory_batches`
--

LOCK TABLES `inventory_batches` WRITE;
/*!40000 ALTER TABLE `inventory_batches` DISABLE KEYS */;
INSERT INTO `inventory_batches` VALUES (2,2,0.00,'2027-12-24','Opening stock','2026-04-27 07:13:12'),(3,3,45.00,'2028-10-27','Opening stock','2026-04-27 07:28:10'),(4,2,150.00,'2028-10-27','Manual stock-in','2026-04-29 14:07:18'),(5,2,138.00,'2028-01-11','Manual stock-in','2026-05-02 06:34:35');
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
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventory_logs`
--

LOCK TABLES `inventory_logs` WRITE;
/*!40000 ALTER TABLE `inventory_logs` DISABLE KEYS */;
INSERT INTO `inventory_logs` VALUES (1,2,NULL,'in',100,'Created inventory item with barcode MED-001; opening batch expiry: 2027-12-24','2026-04-27 07:13:12',1),(2,3,1,'in',45,'Created inventory item with barcode MED-002; opening batch expiry: 2028-10-27','2026-04-27 07:28:10',NULL),(3,2,NULL,'in',150,'Manual stock-in (batch expiry: 2028-10-27)','2026-04-29 14:07:18',1),(4,2,1,'in',150,'Manual stock-in (batch expiry: 2028-01-11)','2026-05-02 06:34:35',NULL),(5,2,1,'out',102,'Manual stock-out from selected batches','2026-05-02 06:35:30',NULL),(6,2,NULL,'out',10,'Supply request approved via FEFO','2026-05-04 11:16:01',1);
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
INSERT INTO `landing_page_content` VALUES (1,'{\"hero\": {\"heading\": \"CARAIT MEDICAL AND DERMATOLOGY CLINIC\", \"section_id\": \"home\", \"subheading\": \"Providers of Comprehensive Care\", \"description\": \"Since our founding in 2015, we have been committed to providing modern, efficient, and high-quality medical and dermatological care to every patient. We focus on wellness and holistic care, ensuring personalized treatment for everyone who visits our clinic.\", \"overlay_opacity\": 0.7, \"heading_highlight\": \"DERMATOLOGY CLINIC\", \"primary_button_path\": \"/patient/register\", \"background_image_url\": \"/homeBG.png\", \"primary_button_label\": \"Book Appointment\", \"secondary_button_path\": \"#about\", \"secondary_button_label\": \"Learn More\"}, \"about\": {\"heading\": \"ABOUT OUR CLINIC\", \"image_alt\": \"Carait Medical and Dermatology Clinic\", \"image_url\": \"/about/aboutClinic.png\", \"badge_text\": \"Years Experience\", \"section_id\": \"about\", \"badge_title\": \"10+\", \"vision_body\": \"To be a trusted healthcare provider known for modern treatments, patient-centered care, and excellence in dermatological and medical services.\", \"body_primary\": \"Since its founding in 2015, Carait Medical and Dermatology Clinic has been committed to providing patients with affordable, reliable, and efficient healthcare services. Our goal is to deliver quality medical and dermatologic care that focuses on the overall health and well-being of every patient who visits our clinic.\", \"mission_body\": \"To provide accessible, compassionate, and high-quality medical and dermatological care that improves the health and wellbeing of our patients.\", \"vision_title\": \"Our Vision\", \"mission_title\": \"Our Mission\", \"body_secondary\": \"We strive to minimize patient wait times and continuously improve our services to make healthcare more convenient and accessible. Whenever possible, we also offer same-day appointments to better accommodate urgent medical needs. Our clinic is located at A. Bonifacio St., Brgy. Canlalay, Binan, Laguna, where we proudly serve the local community with compassionate and patient-centered care.\"}, \"footer\": {\"copyright\": \"©2023 by Carait Medical and Dermatology Clinic\", \"terms_url\": \"\", \"privacy_url\": \"\", \"facebook_url\": \"https://www.facebook.com/carait.mdc?mibextid=LQQJ4d\"}, \"header\": {\"cta_path\": \"/patient/register\", \"logo_url\": \"https://res.cloudinary.com/dvazrmgq9/image/upload/v1777892249/ok4mhx1flghqhoeacdrs.png\", \"cta_label\": \"Book Appointment\", \"nav_links\": [{\"path\": \"#home\", \"label\": \"Home\"}, {\"path\": \"#about\", \"label\": \"About\"}, {\"path\": \"#services\", \"label\": \"Services\"}, {\"path\": \"#doctors\", \"label\": \"Doctors\"}, {\"path\": \"#contact\", \"label\": \"Contact\"}], \"login_path\": \"/patient/login\", \"clinic_name\": \"CARAIT MEDICAL AND DERMATOLOGY CLINIC\", \"login_label\": \"Log in\"}, \"contact\": {\"hours\": \"Monday - Saturday: 9:00 AM - 6:00 PM\\nSunday: Closed\", \"phone\": \"(0949) 998 6956\", \"heading\": \"CONTACT US\", \"cta_path\": \"/patient/register\", \"cta_label\": \"Book Appointment\", \"section_id\": \"contact\", \"cta_heading\": \"Ready to Book an Appointment?\", \"description\": \"We\'d love to hear from you. Visit us or reach out anytime.\", \"hours_title\": \"Clinic Hours\", \"phone_title\": \"Phone Number\", \"address_lines\": [\"A. Bonifacio St., Brgy. Canlalay\", \"Binan, Laguna 4024\"], \"map_embed_url\": \"https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d43325.4203321316!2d121.06200694781873!3d14.342479587423213!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397d7dd46e3b0cf%3A0x1e83bf84b4d824b3!2scarait%20medical%20and%20dermatological%20clinic!5e1!3m2!1sen!2sph!4v1773723093429!5m2!1sen!2sph\", \"location_title\": \"Our Location\", \"cta_description\": \"Same-day appointments available whenever possible.\"}, \"doctors\": {\"items\": [{\"name\": \"DR. MAGTANGOL JOSE C. CARAIT IV\", \"image\": \"/doctors/tanjol.png\", \"specialize\": \"Family Medicine Specialist\", \"description\": \"Dr. Carait is a Fellow of the Philippine Academy of Family Physicians (PAFP). He is also a certified medical acupuncturist and a member of the Philippine Institute of Traditional and Alternative Health Care (PITAHC).\"}, {\"name\": \"DR. PAULA KARINA GONZALES-CARAIT\", \"image\": \"/doctors/paula.png\", \"specialize\": \"Dermatologist\", \"description\": \"Dr. Gonzales-Carait is a Board-certified Dermatologist. She is a Fellow of the Philippine Dermatological Society and the Philippine Society of Venereology Inc.\"}], \"heading\": \"OUR DOCTORS\", \"section_id\": \"doctors\", \"description\": \"Meet our team of experienced and compassionate doctors, committed to providing high-quality medical and dermatological care.\"}, \"services\": {\"items\": [{\"bg\": \"bg-blue-50\", \"name\": \"MEDICAL CONSULTATIONS\", \"image\": \"/services/medical_consultation.png\", \"description\": \"Consultations for medical concerns for all ages (baby to adult) and surgical procedures (minor excision, circumcision etc).\"}, {\"bg\": \"bg-green-50\", \"name\": \"VACCINATIONS\", \"image\": \"/services/vaccination.png\", \"description\": \"It can be so tempting to put off your next appointment. At Carait Medical and Dermatology Clinic, we make it easier than ever to schedule Vaccinations.\"}, {\"bg\": \"bg-purple-50\", \"name\": \"DERMATOLOGIC CONSULTS AND PROCEDURES\", \"image\": \"/services/dermatologic_consults_procedures.png\", \"description\": \"Concern on skin, hair and nails for all ages. Dermatologic procedures include laser for rejuvenation and scars, intense pulse light treatment for anti-aging and hair removal, electrocautery for warts and syringoma, chemical peeling, and skin biopsy.\"}, {\"bg\": \"bg-yellow-50\", \"name\": \"ACUPUNCTURE\", \"image\": \"/services/acupuncture.png\", \"description\": \"Acupuncture for pain relief, vertigo, migraine, insomnia and smoking cessation and more.\"}, {\"bg\": \"bg-red-50\", \"name\": \"ANIMAL BITE CENTER (ABC)\", \"image\": \"/services/animal_bite_center(ABC).png\", \"description\": \"We offer vaccines for pre-exposure prophylaxis and post-exposure animal bite management by our trained doctors.\"}], \"heading\": \"OUR SERVICES\", \"section_id\": \"services\", \"description\": \"We provide a wide range of medical and dermatological services focused on patient wellness, modern treatments, and quality healthcare.\"}, \"testimonial\": {\"quote\": \"Thank you dra for making us beautiful and gwapod as can be. Our monthly IPL and microneedling all paid off. Thank you for removing my 10 step Korean skincare regimen and working your magic on us.\", \"heading\": \"WHAT OUR PATIENTS SAY ABOUT US\", \"image_alt\": \"Patient Feedback\", \"image_url\": \"/about/feedback.png\", \"subheading\": \"Only the Best\"}}','2026-05-04 10:57:29');
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
) ENGINE=InnoDB AUTO_INCREMENT=56 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES (1,'appointment_booked','New patient booking','Robert Renby San Juan booked an appointment with Dr. Euri Sajo on 2026-04-27 at 4:00 PM.','appointment',1,NULL,NULL,'admin',NULL,1,'2026-04-27 07:35:38'),(2,'appointment_booked','New patient booking','Robert Renby San Juan booked an appointment with Dr. Euri Sajo on 2026-04-27 at 4:00 PM.','appointment',1,NULL,NULL,'staff',NULL,1,'2026-04-27 07:35:38'),(3,'appointment_booked','Appointment received','Your appointment request for 2026-04-27 at 4:00 PM is pending confirmation.','appointment',1,NULL,NULL,'patient',1,1,'2026-04-27 07:35:38'),(4,'appointment_booked','New appointment booked','Robert Renby San Juan booked an appointment on 2026-04-27 at 4:00 PM.','appointment',1,NULL,NULL,'doctor',2,0,'2026-04-27 07:35:38'),(5,'appointment_confirmed','Appointment confirmed','Your appointment with Dr. Euri Sajo has been confirmed.','appointment',1,NULL,NULL,'patient',1,1,'2026-04-27 07:36:24'),(6,'appointment_booked','New patient booking','Robert Renby San Juan booked an appointment with Dr. Aaron Corsino on 2026-05-02 at 9:00 AM.','appointment',2,NULL,NULL,'admin',NULL,1,'2026-05-01 23:27:01'),(7,'appointment_booked','New patient booking','Robert Renby San Juan booked an appointment with Dr. Aaron Corsino on 2026-05-02 at 9:00 AM.','appointment',2,NULL,NULL,'staff',NULL,1,'2026-05-01 23:27:01'),(8,'appointment_booked','Appointment received','Your appointment request for 2026-05-02 at 9:00 AM is pending confirmation.','appointment',2,NULL,NULL,'patient',1,1,'2026-05-01 23:27:01'),(9,'appointment_booked','New appointment booked','Robert Renby San Juan booked an appointment on 2026-05-02 at 9:00 AM.','appointment',2,NULL,NULL,'doctor',1,1,'2026-05-01 23:27:01'),(10,'appointment_confirmed','Appointment confirmed','Your appointment with Dr. Aaron Corsino has been confirmed.','appointment',2,NULL,NULL,'patient',1,1,'2026-05-01 23:31:04'),(11,'appointment_booked','New patient booking','Robert Renby San Juan booked an appointment with Dr. Aaron Corsino on 2026-05-02 at 4:00 PM.','appointment',3,NULL,NULL,'admin',NULL,0,'2026-05-02 06:28:08'),(12,'appointment_booked','New patient booking','Robert Renby San Juan booked an appointment with Dr. Aaron Corsino on 2026-05-02 at 4:00 PM.','appointment',3,NULL,NULL,'staff',NULL,1,'2026-05-02 06:28:08'),(13,'appointment_booked','Appointment received','Your appointment request for 2026-05-02 at 4:00 PM is pending confirmation.','appointment',3,NULL,NULL,'patient',1,1,'2026-05-02 06:28:08'),(14,'appointment_booked','New appointment booked','Robert Renby San Juan booked an appointment on 2026-05-02 at 4:00 PM.','appointment',3,NULL,NULL,'doctor',1,0,'2026-05-02 06:28:08'),(15,'appointment_confirmed','Appointment confirmed','Your appointment with Dr. Aaron Corsino has been confirmed.','appointment',3,NULL,NULL,'patient',1,1,'2026-05-02 06:29:03'),(16,'appointment_booked','New patient booking','nick ryan san juan booked an appointment with Dr. Aaron Corsino on 2026-05-04 at 7:00 PM.','appointment',4,NULL,NULL,'admin',NULL,0,'2026-05-04 09:53:15'),(17,'appointment_booked','New patient booking','nick ryan san juan booked an appointment with Dr. Aaron Corsino on 2026-05-04 at 7:00 PM.','appointment',4,NULL,NULL,'staff',NULL,1,'2026-05-04 09:53:15'),(18,'appointment_booked','Appointment received','Your appointment request for 2026-05-04 at 7:00 PM is pending confirmation.','appointment',4,NULL,NULL,'patient',2,0,'2026-05-04 09:53:15'),(19,'appointment_booked','New appointment booked','nick ryan san juan booked an appointment on 2026-05-04 at 7:00 PM.','appointment',4,NULL,NULL,'doctor',1,0,'2026-05-04 09:53:15'),(20,'appointment_confirmed','Appointment confirmed','Your appointment with Dr. Aaron Corsino has been confirmed.','appointment',4,NULL,NULL,'patient',2,0,'2026-05-04 09:53:42'),(21,'supply_request','Doctor supply request','A doctor requested 10 box(s) of Retinoid.','supply_request',1,NULL,NULL,'staff',NULL,1,'2026-05-04 10:42:22'),(22,'supply_request','Doctor supply request','A doctor requested 10 box(s) of Retinoid.','supply_request',1,NULL,NULL,'admin',NULL,0,'2026-05-04 10:42:22'),(23,'appointment_booked','New patient booking','nick ryan san juan booked an appointment with Dr. Aaron Corsino on 2026-05-04 at 9:00 PM.','appointment',6,NULL,NULL,'admin',NULL,0,'2026-05-04 11:03:55'),(24,'appointment_booked','New patient booking','nick ryan san juan booked an appointment with Dr. Aaron Corsino on 2026-05-04 at 9:00 PM.','appointment',6,NULL,NULL,'staff',NULL,1,'2026-05-04 11:03:55'),(25,'appointment_booked','Appointment received','Your appointment request for 2026-05-04 at 9:00 PM is pending confirmation.','appointment',6,NULL,NULL,'patient',2,0,'2026-05-04 11:03:55'),(26,'appointment_booked','New appointment booked','nick ryan san juan booked an appointment on 2026-05-04 at 9:00 PM.','appointment',6,NULL,NULL,'doctor',1,0,'2026-05-04 11:03:55'),(27,'supply_request','Doctor supply request','A doctor requested 300 box(s) of Retinoid.','supply_request',2,NULL,NULL,'staff',NULL,1,'2026-05-04 11:16:29'),(28,'supply_request','Doctor supply request','A doctor requested 300 box(s) of Retinoid.','supply_request',2,NULL,NULL,'admin',NULL,0,'2026-05-04 11:16:29'),(29,'appointment_booked','New patient booking','john pork booked an appointment with Dr. Euri Sajo on 2026-05-06 at 10:00 AM.','appointment',7,NULL,NULL,'admin',NULL,0,'2026-05-05 03:53:30'),(30,'appointment_booked','New patient booking','john pork booked an appointment with Dr. Euri Sajo on 2026-05-06 at 10:00 AM.','appointment',7,NULL,NULL,'staff',NULL,1,'2026-05-05 03:53:30'),(31,'appointment_booked','Appointment received','Your appointment request for 2026-05-06 at 10:00 AM is pending confirmation.','appointment',7,NULL,NULL,'patient',3,0,'2026-05-05 03:53:30'),(32,'appointment_booked','New appointment booked','john pork booked an appointment on 2026-05-06 at 10:00 AM.','appointment',7,NULL,NULL,'doctor',2,0,'2026-05-05 03:53:30'),(33,'appointment_reschedule_request','Appointment needs reconfirmation','john pork moved an appointment with Dr. Euri Sajo to 2026-05-14 at 2:00 PM.','appointment',7,NULL,NULL,'admin',NULL,0,'2026-05-05 03:53:57'),(34,'appointment_reschedule_request','Appointment needs reconfirmation','john pork moved an appointment with Dr. Euri Sajo to 2026-05-14 at 2:00 PM.','appointment',7,NULL,NULL,'staff',NULL,1,'2026-05-05 03:53:57'),(35,'appointment_rescheduled','Reschedule submitted','Your new schedule (2026-05-14 at 2:00 PM) is pending confirmation.','appointment',7,NULL,NULL,'patient',3,0,'2026-05-05 03:53:57'),(36,'appointment_confirmed','Appointment confirmed','Your appointment with Dr. Euri Sajo has been confirmed.','appointment',7,NULL,NULL,'patient',3,0,'2026-05-05 03:55:40'),(37,'appointment_rescheduled','Appointment rescheduled','Your appointment with Dr. Euri Sajo was moved to 2026-05-05 at 3:00 PM.','appointment',7,NULL,NULL,'patient',3,0,'2026-05-05 04:01:09'),(38,'appointment_booked','New patient booking','john pork booked an appointment with Dr. Euri Sajo on 2026-05-05 at 1:00 PM.','appointment',8,NULL,NULL,'admin',NULL,0,'2026-05-05 04:02:23'),(39,'appointment_booked','New patient booking','john pork booked an appointment with Dr. Euri Sajo on 2026-05-05 at 1:00 PM.','appointment',8,NULL,NULL,'staff',NULL,1,'2026-05-05 04:02:23'),(40,'appointment_booked','Appointment received','Your appointment request for 2026-05-05 at 1:00 PM is pending confirmation.','appointment',8,NULL,NULL,'patient',3,0,'2026-05-05 04:02:23'),(41,'appointment_booked','New appointment booked','john pork booked an appointment on 2026-05-05 at 1:00 PM.','appointment',8,NULL,NULL,'doctor',2,0,'2026-05-05 04:02:23'),(42,'appointment_confirmed','Appointment confirmed','Your appointment with Dr. Euri Sajo has been confirmed.','appointment',8,NULL,NULL,'patient',3,0,'2026-05-05 04:02:46'),(43,'appointment_booked','New patient booking','Robert Renby San Juan booked an appointment with Dr. Euri Sajo on 2026-05-27 at 10:00 AM.','appointment',10,NULL,NULL,'admin',NULL,0,'2026-05-05 06:21:48'),(44,'appointment_booked','New patient booking','Robert Renby San Juan booked an appointment with Dr. Euri Sajo on 2026-05-27 at 10:00 AM.','appointment',10,NULL,NULL,'staff',NULL,1,'2026-05-05 06:21:48'),(45,'appointment_booked','Appointment received','Your appointment request for 2026-05-27 at 10:00 AM is pending confirmation.','appointment',10,NULL,NULL,'patient',1,0,'2026-05-05 06:21:48'),(46,'appointment_booked','New appointment booked','Robert Renby San Juan booked an appointment on 2026-05-27 at 10:00 AM.','appointment',10,NULL,NULL,'doctor',2,0,'2026-05-05 06:21:48'),(47,'appointment_booked','New patient booking','Aaron Corsino booked an appointment with Dr. Euri Sajo on 2026-05-05 at 4:00 PM.','appointment',11,NULL,NULL,'admin',NULL,0,'2026-05-05 07:22:51'),(48,'appointment_booked','New patient booking','Aaron Corsino booked an appointment with Dr. Euri Sajo on 2026-05-05 at 4:00 PM.','appointment',11,NULL,NULL,'staff',NULL,1,'2026-05-05 07:22:51'),(49,'appointment_booked','Appointment received','Your appointment request for 2026-05-05 at 4:00 PM is pending confirmation.','appointment',11,NULL,NULL,'patient',4,0,'2026-05-05 07:22:51'),(50,'appointment_booked','New appointment booked','Aaron Corsino booked an appointment on 2026-05-05 at 4:00 PM.','appointment',11,NULL,NULL,'doctor',2,0,'2026-05-05 07:22:51'),(51,'appointment_confirmed','Appointment confirmed','Your appointment with Dr. Euri Sajo has been confirmed.','appointment',11,NULL,NULL,'patient',4,0,'2026-05-05 07:24:40'),(52,'appointment_booked','New patient booking','Eushuaia Rikk D. Sajo booked an appointment with Dr. Aaron Corsino on 2026-05-06 at 10:00 AM.','appointment',13,NULL,NULL,'admin',NULL,0,'2026-05-05 08:05:45'),(53,'appointment_booked','New patient booking','Eushuaia Rikk D. Sajo booked an appointment with Dr. Aaron Corsino on 2026-05-06 at 10:00 AM.','appointment',13,NULL,NULL,'staff',NULL,0,'2026-05-05 08:05:45'),(54,'appointment_booked','Appointment received','Your appointment request for 2026-05-06 at 10:00 AM is pending confirmation.','appointment',13,NULL,NULL,'patient',5,0,'2026-05-05 08:05:45'),(55,'appointment_booked','New appointment booked','Eushuaia Rikk D. Sajo booked an appointment on 2026-05-06 at 10:00 AM.','appointment',13,NULL,NULL,'doctor',1,0,'2026-05-05 08:05:45');
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
  `email` varchar(255) DEFAULT NULL,
  `token` varchar(64) NOT NULL,
  `role` enum('patient','doctor','staff') NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `identifier` varchar(120) DEFAULT NULL,
  `account_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `email_role` (`email`,`role`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
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
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `patient_consents`
--

LOCK TABLES `patient_consents` WRITE;
/*!40000 ALTER TABLE `patient_consents` DISABLE KEYS */;
INSERT INTO `patient_consents` VALUES (1,1,'data_processing','2026-04-27 06:54:46','::1'),(2,2,'data_processing','2026-05-04 09:43:49','::1'),(3,3,'data_processing','2026-05-05 03:50:54','::1'),(4,4,'data_processing','2026-05-05 07:21:27','::1'),(5,5,'data_processing','2026-05-05 07:58:55','::1');
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
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `patient_phone_verifications`
--

LOCK TABLES `patient_phone_verifications` WRITE;
/*!40000 ALTER TABLE `patient_phone_verifications` DISABLE KEYS */;
INSERT INTO `patient_phone_verifications` VALUES (2,'639944799753','811124','{\"phone\": \"639944799753\", \"password\": \"$2b$10$Xg9alj9TluCnD0ulvaGn/OkhyDPjXxwO9BkzGV3v3jkRTiKP3/ZHe\", \"full_name\": \"nickryan san juan\", \"consent_given\": true, \"receive_promotions\": 1}','2026-04-29 21:56:45',NULL,'2026-04-29 13:44:50','2026-04-29 13:46:44');
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
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `patients`
--

LOCK TABLES `patients` WRITE;
/*!40000 ALTER TABLE `patients` DISABLE KEYS */;
INSERT INTO `patients` VALUES (1,'Robert Renby San Juan','2005-01-27','Male','Male','Single','639057557640','Blk 70 lot 44 Cremona st. Brgy. Santiago Gen.tri Cavite','robertrenbysanjuan@gmail.com','$2b$10$qIpeM.tF48GHZZsADBFEVuggbN5BvFaFJ0cx1J2TOGB7fasWihWuG','2026-04-27 06:54:46','2026-04-27 06:57:03','light','https://res.cloudinary.com/dvazrmgq9/image/upload/v1777272948/ibhzoo6h2kxkpbqmyvev.jpg',0,1,'2026-04-27 06:54:47',1,1),(2,'nick ryan san juan',NULL,NULL,NULL,NULL,'639075638475',NULL,NULL,'$2b$10$/DKnfKr0gyJX.eUThDIkmufDf//rGH7.50ofw.q497IxbQSuIXf12','2026-05-04 09:43:49','2026-05-04 09:43:49','light',NULL,0,1,'2026-05-04 09:43:49',1,0),(3,'john pork',NULL,'Other','Other',NULL,'639459934847','bella vista',NULL,'$2b$10$/Buu4pYzJrdcBLA/WIpfmOTJYRAkza5NE/2qZ19uT3V6YDbTxUq5y','2026-05-05 03:50:54','2026-05-05 03:52:06','dark','https://res.cloudinary.com/dvazrmgq9/image/upload/v1777953121/fnrbajphvfi2wsilaavm.jpg',0,1,'2026-05-05 03:50:54',0,0),(4,'Aaron Corsino',NULL,NULL,NULL,NULL,'639455782227',NULL,NULL,'$2b$10$xHadW6QCA360M974dIC6H.ETms5ZMuBd1semMIeuPysWnIb1.GPNi','2026-05-05 07:21:27','2026-05-05 07:21:27','light',NULL,0,1,'2026-05-05 07:21:28',1,0),(5,'Eushuaia Rikk D. Sajo',NULL,NULL,NULL,NULL,'639156682526',NULL,NULL,'$2b$10$I216D9V0E3l.dKjwesAQDuiEcsehVFqkpv5U9gTysi7inMRKH4uqy','2026-05-05 07:58:55','2026-05-05 07:58:55','light',NULL,0,1,'2026-05-05 07:58:56',1,0);
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
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `queue`
--

LOCK TABLES `queue` WRITE;
/*!40000 ALTER TABLE `queue` DISABLE KEYS */;
INSERT INTO `queue` VALUES (1,1,1,1,'Robert Renby San Juan','derma','done','2026-05-04','2026-05-04 10:44:20',5),(2,3,2,1,'john pork','medical','done','2026-05-05','2026-05-05 04:03:44',9),(3,4,2,2,'Aaron Corsino','medical','done','2026-05-05','2026-05-05 07:35:32',12),(4,5,2,3,'Eushuaia Rikk D. Sajo','medical','in-progress','2026-05-05','2026-05-05 08:17:11',14);
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
INSERT INTO `staff` VALUES (1,'Nico Vallente','rrcsanjuan@pcu.edu.ph','$2b$10$wu3IglV9dVF8iEIHkVb98.vjondjzrz5QSZXRYLM.xPDHS15EoqCG','639232323232','staff','2026-04-27 07:19:53','active','light',NULL);
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
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `supply_requests`
--

LOCK TABLES `supply_requests` WRITE;
/*!40000 ALTER TABLE `supply_requests` DISABLE KEYS */;
INSERT INTO `supply_requests` VALUES (1,1,2,10,NULL,'approved','2026-05-04 10:42:22','2026-05-04 11:16:01'),(2,1,2,300,NULL,'pending','2026-05-04 11:16:29','2026-05-04 11:16:29');
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

-- Dump completed on 2026-05-05 17:51:42
