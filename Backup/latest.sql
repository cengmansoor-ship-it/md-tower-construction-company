-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: arabian_d
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `arabian_d`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `arabian_d` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;

USE `arabian_d`;

--
-- Table structure for table `accounts`
--

DROP TABLE IF EXISTS `accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `accounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('asset','liability','equity','income','expense') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `isSystem` tinyint(1) NOT NULL DEFAULT '0',
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `accounts`
--

LOCK TABLES `accounts` WRITE;
/*!40000 ALTER TABLE `accounts` DISABLE KEYS */;
INSERT INTO `accounts` VALUES (1,'1000','نقدي صندوق','asset',1,1),(2,'1100','د شرکت طلب','asset',1,1),(3,'2000','د شرکت پور','liability',1,1),(4,'2100','د کرایه دار امانت','liability',1,1),(5,'3000','د حاجي صاحبانو سرمایه','equity',1,1),(6,'4000','د فروش عاید','income',1,1),(7,'4100','د کرایې عاید','income',1,1),(8,'5000','عمومي مصارف','expense',1,1),(9,'5100','د معاشاتو مصارف','expense',1,1),(10,'5200','د صرافۍ مصارف','expense',1,1),(11,'3100','د صرافۍ منځنی حساب','asset',1,1);
/*!40000 ALTER TABLE `accounts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `attendances`
--

DROP TABLE IF EXISTS `attendances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendances` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employeeId` int NOT NULL,
  `date` date NOT NULL,
  `status` enum('present','absent','leave','half_day') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `payableAmount` decimal(36,18) NOT NULL DEFAULT '0.000000000000000000',
  `currencyCode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdByUserId` int DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `attendances_employee_id_date` (`employeeId`,`date`),
  CONSTRAINT `attendances_ibfk_1` FOREIGN KEY (`employeeId`) REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendances`
--

LOCK TABLES `attendances` WRITE;
/*!40000 ALTER TABLE `attendances` DISABLE KEYS */;
INSERT INTO `attendances` VALUES (1,1,'2026-08-21','present',400.000000000000000000,'AFN',NULL,1,'2026-08-21 03:25:42','2026-08-21 03:25:42'),(2,2,'2026-08-18','present',400.000000000000000000,'AFN','پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو',1,'2026-08-21 20:40:24','2026-08-21 20:40:24'),(3,2,'2026-08-19','present',400.000000000000000000,'AFN','پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو',1,'2026-08-21 20:40:24','2026-08-21 20:40:24'),(4,2,'2026-08-20','present',400.000000000000000000,'AFN','پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو',1,'2026-08-21 20:40:24','2026-08-21 20:40:24'),(5,2,'2026-08-21','present',400.000000000000000000,'AFN',NULL,1,'2026-08-21 20:40:24','2026-08-21 20:40:24'),(6,4,'2026-08-11','present',400.000000000000000000,'AFN','پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو',1,'2026-08-21 11:37:46','2026-08-21 11:37:46'),(7,4,'2026-08-12','present',400.000000000000000000,'AFN','پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو',1,'2026-08-21 11:37:46','2026-08-21 11:37:46'),(8,4,'2026-08-13','present',400.000000000000000000,'AFN','پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو',1,'2026-08-21 11:37:46','2026-08-21 11:37:46'),(9,4,'2026-08-14','present',400.000000000000000000,'AFN','پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو',1,'2026-08-21 11:37:46','2026-08-21 11:37:46'),(10,4,'2026-08-15','present',400.000000000000000000,'AFN','پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو',1,'2026-08-21 11:37:46','2026-08-21 11:37:46'),(11,4,'2026-08-16','present',400.000000000000000000,'AFN','پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو',1,'2026-08-21 11:37:46','2026-08-21 11:37:46'),(12,4,'2026-08-17','present',400.000000000000000000,'AFN','پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو',1,'2026-08-21 11:37:46','2026-08-21 11:37:46'),(13,4,'2026-08-18','present',400.000000000000000000,'AFN','پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو',1,'2026-08-21 11:37:46','2026-08-21 11:37:46'),(14,4,'2026-08-19','present',400.000000000000000000,'AFN','پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو',1,'2026-08-21 11:37:46','2026-08-21 11:37:46'),(15,4,'2026-08-20','present',400.000000000000000000,'AFN','پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو',1,'2026-08-21 11:37:46','2026-08-21 11:37:46'),(16,4,'2026-08-21','present',400.000000000000000000,'AFN',NULL,1,'2026-08-21 11:37:46','2026-08-21 11:37:46');
/*!40000 ALTER TABLE `attendances` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `audit_logs`
--

DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int DEFAULT NULL,
  `action` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `entityType` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `entityId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `details` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `userId` (`userId`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=91 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_logs`
--

LOCK TABLES `audit_logs` WRITE;
/*!40000 ALTER TABLE `audit_logs` DISABLE KEYS */;
INSERT INTO `audit_logs` VALUES (1,NULL,'recover_credentials','User','1','{\"username\":\"MD\",\"requestedUsername\":\"MD\",\"createdAccount\":false,\"renamedAccount\":true}','2026-08-13 21:59:02'),(2,1,'login','User','1',NULL,'2026-08-13 21:59:02'),(3,1,'login','User','1',NULL,'2026-08-21 02:48:50'),(4,1,'login_failed','User','1','{\"failedLoginAttempts\":1}','2026-08-21 03:24:21'),(5,1,'login_failed','User','1','{\"failedLoginAttempts\":2}','2026-08-21 03:24:22'),(6,1,'login','User','1',NULL,'2026-08-21 03:24:30'),(7,1,'create','Employee','1','{\"name\":\"نعمت الله\",\"fatherName\":\"عنایت الله\",\"phone\":\"0708877666\",\"position\":\"منشی\",\"wageType\":\"monthly\",\"wageAmount\":\"12000\",\"currencyCode\":\"AFN\",\"startDate\":\"2026-08-21\",\"endDate\":null,\"workerType\":\"regular\",\"notes\":null}','2026-08-21 03:25:33'),(8,1,'create','Attendance','1','{\"date\":\"2026-08-21\",\"status\":\"present\"}','2026-08-21 03:25:42'),(9,1,'create','EmployeePayment','1','{\"amount\":\"2000\",\"type\":\"salary\",\"currencyCode\":\"AFN\",\"paymentDate\":\"2026-08-21\"}','2026-08-21 03:26:02'),(10,1,'login','User','1',NULL,'2026-08-21 04:59:19'),(11,1,'delete','Employee','1','{\"reason\":\"sdsad\",\"trashItemId\":1,\"purgeAfter\":\"2026-09-20T05:00:15.661Z\",\"sourcePath\":\"/employees\"}','2026-08-21 05:00:15'),(12,1,'login_failed','User','1','{\"failedLoginAttempts\":1}','2026-08-21 16:06:58'),(13,1,'login','User','1',NULL,'2026-08-21 16:07:07'),(14,1,'login','User','1',NULL,'2026-08-21 17:53:53'),(15,1,'login','User','1',NULL,'2026-08-21 20:39:00'),(16,1,'create','Employee','2','{\"name\":\"نعمت الله\",\"fatherName\":\"عنایت الله\",\"phone\":\"0709876543\",\"position\":\"منشی\",\"wageType\":\"monthly\",\"wageAmount\":\"12000\",\"currencyCode\":\"AFN\",\"startDate\":\"2026-08-18\",\"endDate\":null,\"workerType\":\"regular\",\"notes\":null}','2026-08-21 20:40:19'),(17,1,'create','Attendance','5','{\"date\":\"2026-08-21\",\"status\":\"present\"}','2026-08-21 20:40:24'),(18,1,'create','EmployeePayment','2','{\"amount\":\"600\",\"type\":\"salary\",\"currencyCode\":\"AFN\",\"paymentDate\":\"2026-08-21\"}','2026-08-21 20:41:02'),(19,1,'delete','Employee','2','{\"reason\":\"sdfds\",\"trashItemId\":2,\"purgeAfter\":\"2026-09-20T20:42:19.466Z\",\"sourcePath\":\"/employees\"}','2026-08-21 20:42:19'),(20,1,'create','Party','1','{\"type\":\"supplier\",\"name\":\"احمد\",\"companyName\":null,\"fatherName\":null,\"grandfatherName\":null,\"tazkiraNumber\":null,\"phone1\":null,\"phone2\":null,\"address\":null,\"notes\":null}','2026-08-21 20:43:23'),(21,1,'create','Purchase','1','{\"purchaseNumber\":\"4344\",\"supplierPartyId\":1,\"purchaseDate\":\"2026-08-21\",\"itemName\":\"سمینټ \",\"quantity\":\"2000\",\"unitOfMeasure\":\"پارسل\",\"unitPrice\":\"200\",\"currencyCode\":\"AFN\",\"notes\":null}','2026-08-21 20:44:02'),(22,1,'delete','Purchase','1','{\"reason\":\"غلط یا اړتیا نه لرونکی مشتری\",\"trashItemId\":3,\"purgeAfter\":\"2026-09-20T20:45:10.593Z\",\"sourcePath\":\"/purchases/1\"}','2026-08-21 20:45:10'),(23,1,'delete','Party','1','{\"reason\":\"غلط یا اړتیا نه لرونکی مشتری\",\"trashItemId\":4,\"purgeAfter\":\"2026-09-20T20:45:10.665Z\",\"sourcePath\":\"/parties\"}','2026-08-21 20:45:10'),(24,1,'create','Employee','3','{\"name\":\"احمد\",\"fatherName\":\"محمود\",\"phone\":\"0708888888\",\"position\":\"متفرقه کاریګر\",\"wageType\":\"daily\",\"wageAmount\":\"200\",\"currencyCode\":\"AFN\",\"startDate\":\"2026-08-16\",\"endDate\":null,\"workerType\":\"misc\",\"status\":\"active\",\"notes\":null}','2026-08-21 20:46:38'),(25,1,'create','EmployeePayment','3','{\"amount\":\"200\",\"type\":\"salary\",\"currencyCode\":\"AFN\",\"paymentDate\":\"2026-08-21\",\"note\":\"رسیده ګی د دفتر له طرفه و احمد ته \"}','2026-08-21 20:47:21'),(26,1,'delete','Employee','3','{\"reason\":\"یبیس\",\"trashItemId\":5,\"purgeAfter\":\"2026-09-20T20:47:35.037Z\",\"sourcePath\":\"/employees\"}','2026-08-21 20:47:35'),(27,1,'create','Project','1',NULL,'2026-08-21 20:48:08'),(28,1,'create','Block','1',NULL,'2026-08-21 20:48:25'),(29,1,'create','Floor','1',NULL,'2026-08-21 20:48:40'),(30,1,'create','Unit','1',NULL,'2026-08-21 20:48:56'),(31,1,'update','Unit','1','{\"unitNumber\":\"01\",\"unitTypeId\":1,\"status\":\"available\",\"purpose\":\"for_sale\",\"roomCount\":4,\"areaSqm\":null,\"notes\":null}','2026-08-21 20:49:06'),(32,1,'create','Party','2','{\"type\":\"sales_customer\",\"name\":\"حاجی احمد \",\"companyName\":null,\"fatherName\":\"حاجی محمود\",\"grandfatherName\":\"حاجی سردار احمد\",\"tazkiraNumber\":\"087668\",\"phone1\":\"0700009988\",\"phone2\":null,\"address\":\"کندهار\",\"notes\":null}','2026-08-21 20:49:59'),(33,1,'create','Sale','1','{\"unitId\":1,\"partyId\":2,\"price\":\"35000\",\"discount\":\"0\",\"currencyCode\":\"USD\",\"saleDate\":\"2026-08-21\",\"paymentType\":\"installment\",\"contractNumber\":null,\"notes\":\"یوباب کور پر حاجی احمد باندی په فروش ورسید \",\"status\":\"active\",\"firstReceivedAmount\":\"10000\"}','2026-08-21 20:50:56'),(34,1,'delete','Sale','1','{\"reason\":\"غلط یا اړتیا نه لرونکی مشتری\",\"trashItemId\":6,\"purgeAfter\":\"2026-09-20T20:51:40.244Z\",\"sourcePath\":\"/sales?customerType=sales_customer&salesDetail=1&allDates=1\"}','2026-08-21 20:51:40'),(35,1,'delete','Party','2','{\"reason\":\"غلط یا اړتیا نه لرونکی مشتری\",\"trashItemId\":7,\"purgeAfter\":\"2026-09-20T20:51:40.314Z\",\"sourcePath\":\"/parties\"}','2026-08-21 20:51:40'),(36,1,'delete','Project','1','{\"reason\":\"سیس\",\"trashItemId\":8,\"purgeAfter\":\"2026-09-20T20:51:57.600Z\",\"sourcePath\":\"/projects/list\"}','2026-08-21 20:51:57'),(37,1,'login','User','1',NULL,'2026-08-21 10:44:12'),(38,1,'login_failed','User','1','{\"failedLoginAttempts\":1}','2026-08-21 11:36:28'),(39,1,'login','User','1',NULL,'2026-08-21 11:36:41'),(40,1,'create','Employee','4','{\"name\":\"احمد\",\"fatherName\":\"محمود\",\"phone\":\"0708888888\",\"position\":\"منشی\",\"wageType\":\"monthly\",\"wageAmount\":\"12000\",\"currencyCode\":\"AFN\",\"startDate\":\"2026-08-11\",\"endDate\":null,\"workerType\":\"regular\",\"notes\":null}','2026-08-21 11:37:41'),(41,1,'create','Attendance','16','{\"date\":\"2026-08-21\",\"status\":\"present\"}','2026-08-21 11:37:46'),(42,1,'create','EmployeePayment','4','{\"amount\":\"4000\",\"type\":\"salary\",\"currencyCode\":\"AFN\",\"paymentDate\":\"2026-08-21\"}','2026-08-21 11:38:00'),(43,1,'delete','Employee','4','{\"reason\":\"ssdfds\",\"trashItemId\":9,\"purgeAfter\":\"2026-09-20T11:38:23.863Z\",\"sourcePath\":\"/employees\"}','2026-08-21 11:38:23'),(44,1,'create','Employee','5','{\"name\":\"احمد\",\"fatherName\":\"محمود\",\"phone\":\"0708888888\",\"position\":\"متفرقه کاریګر\",\"wageType\":\"daily\",\"wageAmount\":\"200\",\"currencyCode\":\"AFN\",\"startDate\":\"2026-08-11\",\"endDate\":null,\"workerType\":\"misc\",\"status\":\"active\",\"notes\":null}','2026-08-21 11:40:54'),(45,1,'create','EmployeePayment','5','{\"amount\":\"2000\",\"type\":\"salary\",\"currencyCode\":\"AFN\",\"paymentDate\":\"2026-08-21\",\"note\":\"رسیده احمد ته \"}','2026-08-21 11:41:14'),(46,1,'delete','Employee','5','{\"reason\":\"لابا\",\"trashItemId\":10,\"purgeAfter\":\"2026-09-20T11:41:31.885Z\",\"sourcePath\":\"/employees\"}','2026-08-21 11:41:31'),(47,1,'login_failed','User','1','{\"failedLoginAttempts\":1}','2026-08-21 11:57:28'),(48,1,'login_failed','User','1','{\"failedLoginAttempts\":2}','2026-08-21 11:57:28'),(49,1,'login','User','1',NULL,'2026-08-21 11:57:35'),(50,1,'create','Party','3','{\"type\":\"supplier\",\"name\":\"احمد\",\"companyName\":null,\"fatherName\":null,\"grandfatherName\":null,\"tazkiraNumber\":null,\"phone1\":null,\"phone2\":null,\"address\":null,\"notes\":null}','2026-08-21 11:57:50'),(51,1,'delete','Party','3','{\"reason\":\"غلط یا اړتیا نه لرونکی مشتری\",\"trashItemId\":11,\"purgeAfter\":\"2026-09-20T11:58:01.145Z\",\"sourcePath\":\"/parties\"}','2026-08-21 11:58:01'),(52,1,'create','Party','4','{\"type\":\"supplier\",\"name\":\"احمد\",\"companyName\":\"عذیرعطایی شرکت\",\"fatherName\":null,\"grandfatherName\":null,\"tazkiraNumber\":null,\"phone1\":\"0708899898\",\"phone2\":\"0708964443\",\"address\":\"کندهار\",\"notes\":null}','2026-08-21 11:58:32'),(53,1,'create','Party','5','{\"type\":\"sales_customer\",\"name\":\"حاجی بسم الله جان\",\"companyName\":null,\"fatherName\":\"خیر الله جان\",\"grandfatherName\":\"نورجان\",\"tazkiraNumber\":\"9787887\",\"phone1\":\"0708777766\",\"phone2\":\"0708765432\",\"address\":\"څلورمه ناحیه کندهار افغانستان\",\"notes\":null}','2026-08-21 11:59:33'),(54,1,'create','Party','6','{\"type\":\"sales_customer\",\"name\":\"حاجی عمر احمد\",\"companyName\":null,\"fatherName\":\"حاجی ګل محمد\",\"grandfatherName\":\"حاجی نورمحمد\",\"tazkiraNumber\":\"8767888\",\"phone1\":\"0708776655\",\"phone2\":\"0708888666\",\"address\":\"کندهار\",\"notes\":null}','2026-08-21 12:00:17'),(55,1,'create','Party','7','{\"type\":\"tenant\",\"name\":\"سمیع الله\",\"companyName\":null,\"fatherName\":\"خیر الله\",\"grandfatherName\":\"بشیر احمد\",\"tazkiraNumber\":\"876655\",\"phone1\":\"0708888888\",\"phone2\":\"0708765566\",\"address\":\"کندهار\",\"notes\":null}','2026-08-21 12:01:04'),(56,1,'create','Party','8','{\"type\":\"exchange_dealer\",\"name\":\"حاجی بلال احمد\",\"companyName\":\"وحید صرافی\",\"fatherName\":null,\"grandfatherName\":null,\"tazkiraNumber\":null,\"phone1\":\"0709888888\",\"phone2\":\"0708988877\",\"address\":\"کندهار اتل مارکیټ 28 نمبر دوکان \",\"notes\":null}','2026-08-21 12:01:47'),(57,1,'create','Party','9','{\"type\":\"market_customer\",\"name\":\"تورجان \",\"companyName\":\"غالب کار\",\"fatherName\":null,\"grandfatherName\":null,\"tazkiraNumber\":null,\"phone1\":\"0708887767\",\"phone2\":\"0708888866\",\"address\":\"کندهار\",\"notes\":null}','2026-08-21 12:02:23'),(58,1,'create','Project','2',NULL,'2026-08-21 12:02:44'),(59,1,'update','Project','2','{\"status\":\"active\"}','2026-08-21 12:02:57'),(60,1,'create','Block','2',NULL,'2026-08-21 12:03:09'),(61,1,'create','Floor','2',NULL,'2026-08-21 12:03:24'),(62,1,'create','Unit','2',NULL,'2026-08-21 12:03:41'),(63,1,'update','Unit','2','{\"unitNumber\":\"01\",\"unitTypeId\":1,\"status\":\"available\",\"purpose\":\"for_sale\",\"roomCount\":4,\"areaSqm\":null,\"notes\":null}','2026-08-21 12:03:50'),(64,1,'create','Floor','3',NULL,'2026-08-21 12:04:04'),(65,1,'create','Unit','3',NULL,'2026-08-21 12:04:17'),(66,1,'update','Unit','3','{\"unitNumber\":\"01\",\"unitTypeId\":2,\"status\":\"available\",\"purpose\":\"for_sale\",\"roomCount\":null,\"areaSqm\":null,\"notes\":null}','2026-08-21 12:04:27'),(67,1,'create','Floor','4',NULL,'2026-08-21 12:04:55'),(68,1,'create','Unit','4',NULL,'2026-08-21 12:05:08'),(69,1,'update','Unit','4','{\"unitNumber\":\"01\",\"unitTypeId\":2,\"status\":\"available\",\"purpose\":\"for_rent\",\"roomCount\":null,\"areaSqm\":null,\"notes\":null}','2026-08-21 12:05:19'),(70,1,'create','Purchase','2','{\"purchaseNumber\":\"4477\",\"supplierPartyId\":4,\"purchaseDate\":\"2026-08-20\",\"itemName\":\"سمینټ\",\"quantity\":\"2000\",\"unitOfMeasure\":\"پارسل\",\"unitPrice\":\"200\",\"currencyCode\":\"AFN\",\"notes\":null}','2026-08-21 12:05:59'),(71,1,'create','PartyLedgerEntry','13','{\"date\":\"2026-08-18\",\"description\":\"بازار/انفرادي راکړه - د مشتری بیل نمبر: 0 - د تورجان غالب کار د 5 ورځو د غالبانو حساب\",\"entryType\":\"receipt\",\"amount\":\"10000\",\"currencyCode\":\"AFN\"}','2026-08-21 12:07:17'),(72,1,'create','PartyLedgerEntry','14','{\"date\":\"2026-08-19\",\"description\":\"رسیده ګی د دفتر له طرفه و حاجی بلال صراف ته\",\"entryType\":\"money\",\"amount\":\"200000\",\"currencyCode\":\"AFN\"}','2026-08-21 12:08:12'),(73,1,'create','CompanyPartner','1','{\"name\":\"حاجی محمد داود\",\"initialInvestment\":\"200000\",\"currencyCode\":\"USD\",\"ownershipPercent\":null,\"joinDate\":\"2026-08-21\",\"notes\":\"لومړی سرمایه ګذاری یی کړی دی\"}','2026-08-21 12:09:17'),(74,1,'create','Party','10','{\"type\":\"partner\",\"name\":\"حاجی محمد داود\",\"source\":\"partners\"}','2026-08-21 12:09:34'),(75,1,'create','Partner','1','{\"partyName\":\"حاجی محمد داود\",\"initialInvestment\":0,\"currencyCode\":\"AFN\",\"joinDate\":\"2026-08-21\",\"notes\":null}','2026-08-21 12:09:34'),(76,1,'create','PartnerTransaction','1','{\"type\":\"investment\",\"amount\":\"50000\",\"currencyCode\":\"AFN\",\"transactionDate\":\"2026-08-17\",\"description\":\"رسیده ګی د حاجی صاحب له طرفه و دفتر ته\",\"note\":null}','2026-08-21 12:10:18'),(77,1,'create','Sale','2','{\"unitId\":2,\"partyId\":5,\"price\":\"35000\",\"discount\":\"0\",\"currencyCode\":\"USD\",\"saleDate\":\"2026-08-21\",\"paymentType\":\"installment\",\"contractNumber\":null,\"notes\":\"یو باب کور پر حاجی بسم الله باندی په فروش ورسید \",\"status\":\"active\",\"firstReceivedAmount\":\"10000\"}','2026-08-21 12:12:22'),(78,1,'create','Sale','3','{\"unitId\":3,\"partyId\":6,\"price\":\"14000\",\"discount\":\"0\",\"currencyCode\":\"USD\",\"saleDate\":\"2026-08-20\",\"paymentType\":\"installment\",\"contractNumber\":null,\"notes\":\"یوباب دوکان پر حاجی عمر احمدباندی په فروش ورسید \",\"status\":\"active\",\"firstReceivedAmount\":\"5000\"}','2026-08-21 12:14:11'),(79,1,'create','Rental','1','{\"unitId\":4,\"tenantPartyId\":7,\"startDate\":\"2026-08-16\",\"rentAmount\":\"300\",\"frequency\":\"monthly\",\"depositAmount\":\"0\",\"currencyCode\":\"USD\",\"notes\":\"یوباب دوکان سمیع الله ته دمیاشتی په کرایه ورکول سول \",\"firstReceivedAmount\":\"100\"}','2026-08-21 12:16:01'),(80,1,'delete','ExpenseCategoryLabel','maintenance','{\"key\":\"maintenance\",\"note\":\"Expense records were kept; this category is hidden from expense entry dropdowns.\"}','2026-08-21 12:16:25'),(81,1,'delete','ExpenseCategoryLabel','other','{\"key\":\"other\",\"note\":\"Expense records were kept; this category is hidden from expense entry dropdowns.\"}','2026-08-21 12:16:28'),(82,1,'delete','ExpenseCategoryLabel','kitchen','{\"key\":\"kitchen\",\"note\":\"Expense records were kept; this category is hidden from expense entry dropdowns.\"}','2026-08-21 12:16:30'),(83,1,'delete','ExpenseCategoryLabel','office','{\"key\":\"office\",\"note\":\"Expense records were kept; this category is hidden from expense entry dropdowns.\"}','2026-08-21 12:16:32'),(84,1,'delete','ExpenseCategoryLabel','transport','{\"key\":\"transport\",\"note\":\"Expense records were kept; this category is hidden from expense entry dropdowns.\"}','2026-08-21 12:16:34'),(85,1,'delete','ExpenseCategoryLabel','utilities','{\"key\":\"utilities\",\"note\":\"Expense records were kept; this category is hidden from expense entry dropdowns.\"}','2026-08-21 12:16:36'),(86,1,'delete','ExpenseCategoryLabel','salaries','{\"key\":\"salaries\",\"note\":\"Expense records were kept; this category is hidden from expense entry dropdowns.\"}','2026-08-21 12:16:38'),(87,1,'update','ExpenseCategoryName','دفتر','{\"oldName\":\"دفتر\",\"newName\":\"دفتر\",\"updated\":0}','2026-08-21 12:16:46'),(88,1,'create','Expense','1','{\"category\":\"other\",\"categoryName\":\"دفتر\",\"expenseDate\":\"2026-08-19\",\"description\":\"د دفتر لپاره فرش \",\"amount\":\"20000\",\"currencyCode\":\"AFN\",\"payeeName\":null}','2026-08-21 12:17:16'),(89,1,'create','Expense','2','{\"category\":\"other\",\"categoryName\":\"دفتر\",\"expenseDate\":\"2026-08-21\",\"description\":\"قرطاسیه باب او انټرنیټ \",\"amount\":\"8000\",\"currencyCode\":\"AFN\",\"payeeName\":null}','2026-08-21 12:17:56'),(90,1,'create','PartyLedgerEntry','24','{\"date\":\"2026-08-21\",\"description\":\"رسیده ګی د دفتر له طرفه و عذیر عطایی شرکت ته\",\"entryType\":\"receipt\",\"amount\":\"200000\",\"currencyCode\":\"AFN\"}','2026-08-21 12:19:55');
/*!40000 ALTER TABLE `audit_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `block_groups`
--

DROP TABLE IF EXISTS `block_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `block_groups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `projectId` int NOT NULL,
  `name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `projectId` (`projectId`),
  CONSTRAINT `block_groups_ibfk_1` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `block_groups`
--

LOCK TABLES `block_groups` WRITE;
/*!40000 ALTER TABLE `block_groups` DISABLE KEYS */;
/*!40000 ALTER TABLE `block_groups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `blocks`
--

DROP TABLE IF EXISTS `blocks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `blocks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `projectId` int NOT NULL,
  `blockGroupId` int DEFAULT NULL,
  `name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `order` int NOT NULL DEFAULT '0',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `blocks_project_id_code` (`projectId`,`code`),
  KEY `blockGroupId` (`blockGroupId`),
  CONSTRAINT `blocks_ibfk_1` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `blocks_ibfk_2` FOREIGN KEY (`blockGroupId`) REFERENCES `block_groups` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `blocks`
--

LOCK TABLES `blocks` WRITE;
/*!40000 ALTER TABLE `blocks` DISABLE KEYS */;
INSERT INTO `blocks` VALUES (1,1,NULL,'A بلاک','0001',0,NULL),(2,2,NULL,'A بلاک','0001',0,NULL);
/*!40000 ALTER TABLE `blocks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cash_accounts`
--

DROP TABLE IF EXISTS `cash_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cash_accounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `currencyCode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `accountId` int NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `accountId` (`accountId`),
  CONSTRAINT `cash_accounts_ibfk_1` FOREIGN KEY (`accountId`) REFERENCES `accounts` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cash_accounts`
--

LOCK TABLES `cash_accounts` WRITE;
/*!40000 ALTER TABLE `cash_accounts` DISABLE KEYS */;
INSERT INTO `cash_accounts` VALUES (1,'د افغانیو اصلي صندوق','AFN',1,1);
/*!40000 ALTER TABLE `cash_accounts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `company_partners`
--

DROP TABLE IF EXISTS `company_partners`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `company_partners` (
  `id` int NOT NULL AUTO_INCREMENT,
  `partnerNumber` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `initialInvestment` decimal(36,18) NOT NULL,
  `currencyCode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ownershipPercent` decimal(36,18) DEFAULT NULL,
  `joinDate` date NOT NULL,
  `status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdByUserId` int DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `partnerNumber` (`partnerNumber`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `company_partners`
--

LOCK TABLES `company_partners` WRITE;
/*!40000 ALTER TABLE `company_partners` DISABLE KEYS */;
INSERT INTO `company_partners` VALUES (1,'شریک-0001','حاجی محمد داود',200000.000000000000000000,'USD',NULL,'2026-08-21','active','لومړی سرمایه ګذاری یی کړی دی',1,'2026-08-21 12:09:17','2026-08-21 12:09:17');
/*!40000 ALTER TABLE `company_partners` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `company_settings`
--

DROP TABLE IF EXISTS `company_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `company_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyName` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'د سیستم اداره',
  `baseCurrencyCode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'AFN',
  `fiscalYearStartMonth` int NOT NULL DEFAULT '1',
  `locale` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ps',
  `logoUrl` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `address` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `whatsapp` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `website` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `slogan` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expenseCategoryConfig` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `welcomeTitlePashto` varchar(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ښه راغلاست',
  `welcomeSubtitlePashto` varchar(220) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'د مدیریت سیستم',
  `welcomeDescriptionPashto` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `welcomeTitleEnglish` varchar(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Welcome',
  `welcomeSubtitleEnglish` varchar(220) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'To Our Company',
  `welcomeDescriptionEnglish` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `company_settings`
--

LOCK TABLES `company_settings` WRITE;
/*!40000 ALTER TABLE `company_settings` DISABLE KEYS */;
INSERT INTO `company_settings` VALUES (1,'د سیستم اداره','AFN',1,'ps',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{\"labels\":{},\"hidden\":[\"maintenance\",\"other\",\"kitchen\",\"office\",\"transport\",\"utilities\",\"salaries\"],\"custom\":[\"دفتر\"]}','ښه راغلاست','د مدیریت سیستم','د پروژو، فروشاتو، کرایې، تدارکاتو، کارکوونکو او مالي حسابونو مرکزي مدیریت.','Welcome','To Our Company','Central management for projects, sales, rentals, procurement, employees, and accounts.');
/*!40000 ALTER TABLE `company_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `currencies`
--

DROP TABLE IF EXISTS `currencies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `currencies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `isBase` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `currencies`
--

LOCK TABLES `currencies` WRITE;
/*!40000 ALTER TABLE `currencies` DISABLE KEYS */;
INSERT INTO `currencies` VALUES (1,'AFN','افغانی',1),(2,'USD','ډالر',0),(3,'PKR','کلداره',0);
/*!40000 ALTER TABLE `currencies` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `daily_cash_entries`
--

DROP TABLE IF EXISTS `daily_cash_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `daily_cash_entries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `entryDate` date NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` enum('cash_in','labor','kitchen','machinery','company','customers','other') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `entryType` enum('in','out') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'out',
  `targetType` enum('supplier','sales_customer','exchange_dealer','market_customer','individual_customer','regular_employee','misc_worker','expense','company','other') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `targetId` int DEFAULT NULL,
  `targetName` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(36,18) NOT NULL,
  `currencyCode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `journalTransactionId` int DEFAULT NULL,
  `linkedEmployeePaymentId` int DEFAULT NULL,
  `createdByUserId` int DEFAULT NULL,
  `voidedAt` datetime DEFAULT NULL,
  `voidedByUserId` int DEFAULT NULL,
  `voidReason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `journalTransactionId` (`journalTransactionId`),
  CONSTRAINT `daily_cash_entries_ibfk_1` FOREIGN KEY (`journalTransactionId`) REFERENCES `journal_transactions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `daily_cash_entries`
--

LOCK TABLES `daily_cash_entries` WRITE;
/*!40000 ALTER TABLE `daily_cash_entries` DISABLE KEYS */;
/*!40000 ALTER TABLE `daily_cash_entries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `document_sequences`
--

DROP TABLE IF EXISTS `document_sequences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_sequences` (
  `id` int NOT NULL AUTO_INCREMENT,
  `documentType` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `prefix` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `nextNumber` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `documentType` (`documentType`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `document_sequences`
--

LOCK TABLES `document_sequences` WRITE;
/*!40000 ALTER TABLE `document_sequences` DISABLE KEYS */;
INSERT INTO `document_sequences` VALUES (1,'sales_contract','فروش-',4),(2,'rental_contract','کرایه-',2),(3,'receipt','رسید-',4),(4,'rental_receipt','دکرایېرسید-',2),(5,'purchase_invoice','خرید-',1),(6,'purchase_payment','دخریدتادیه-',1),(7,'purchase_return','بیل-',1),(8,'expense_voucher','مصرف-',3),(9,'journal_entry','روزنامچه-',1),(10,'employee','کارکوونکی-',6),(11,'employee_payment','معاش-',6),(12,'exchange','صرافي-',1),(13,'company_partner','شریک-',2),(14,'partner','حاجي-',2),(15,'partner_transaction','حاجيرسید-',2);
/*!40000 ALTER TABLE `document_sequences` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `employee_documents`
--

DROP TABLE IF EXISTS `employee_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employeeId` int NOT NULL,
  `fileName` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `fileUrl` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `mimeType` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sizeBytes` int NOT NULL,
  `uploadedByUserId` int DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `employee_documents_employee_id` (`employeeId`),
  CONSTRAINT `employee_documents_ibfk_1` FOREIGN KEY (`employeeId`) REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `employee_documents`
--

LOCK TABLES `employee_documents` WRITE;
/*!40000 ALTER TABLE `employee_documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `employee_documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `employee_payments`
--

DROP TABLE IF EXISTS `employee_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `paymentNumber` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeId` int NOT NULL,
  `paymentDate` date NOT NULL,
  `type` enum('salary','advance','debt_repayment') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'salary',
  `amount` decimal(36,18) NOT NULL,
  `previousBalance` decimal(36,18) DEFAULT NULL,
  `newBalance` decimal(36,18) DEFAULT NULL,
  `currencyCode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `method` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'cash',
  `cashAccountId` int DEFAULT NULL,
  `note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `paidByUserId` int DEFAULT NULL,
  `voidedAt` datetime DEFAULT NULL,
  `voidReason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `paymentNumber` (`paymentNumber`),
  KEY `employeeId` (`employeeId`),
  KEY `cashAccountId` (`cashAccountId`),
  CONSTRAINT `employee_payments_ibfk_1` FOREIGN KEY (`employeeId`) REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `employee_payments_ibfk_2` FOREIGN KEY (`cashAccountId`) REFERENCES `cash_accounts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `employee_payments`
--

LOCK TABLES `employee_payments` WRITE;
/*!40000 ALTER TABLE `employee_payments` DISABLE KEYS */;
INSERT INTO `employee_payments` VALUES (1,'معاش-0001',1,'2026-08-21','salary',2000.000000000000000000,400.000000000000000000,-1600.000000000000000000,'AFN','cash',NULL,NULL,1,NULL,NULL,'2026-08-21 03:26:02','2026-08-21 03:26:02'),(2,'معاش-0002',2,'2026-08-21','salary',600.000000000000000000,1600.000000000000000000,1000.000000000000000000,'AFN','cash',NULL,NULL,1,NULL,NULL,'2026-08-21 20:41:02','2026-08-21 20:41:02'),(3,'معاش-0003',3,'2026-08-21','salary',200.000000000000000000,1200.000000000000000000,1000.000000000000000000,'AFN','cash',NULL,'رسیده ګی د دفتر له طرفه و احمد ته ',1,NULL,NULL,'2026-08-21 20:47:21','2026-08-21 20:47:21'),(4,'معاش-0004',4,'2026-08-21','salary',4000.000000000000000000,4400.000000000000000000,400.000000000000000000,'AFN','cash',NULL,NULL,1,NULL,NULL,'2026-08-21 11:38:00','2026-08-21 11:38:00'),(5,'معاش-0005',5,'2026-08-21','salary',2000.000000000000000000,2200.000000000000000000,200.000000000000000000,'AFN','cash',NULL,'رسیده احمد ته ',1,NULL,NULL,'2026-08-21 11:41:14','2026-08-21 11:41:14');
/*!40000 ALTER TABLE `employee_payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `employee_work_periods`
--

DROP TABLE IF EXISTS `employee_work_periods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_work_periods` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employeeId` int NOT NULL,
  `startDate` date NOT NULL,
  `endDate` date NOT NULL,
  `wageType` enum('daily','monthly') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'daily',
  `wageAmount` decimal(36,18) NOT NULL,
  `currencyCode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `workerType` enum('regular','misc') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'regular',
  `note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `employeeId` (`employeeId`),
  CONSTRAINT `employee_work_periods_ibfk_1` FOREIGN KEY (`employeeId`) REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `employee_work_periods`
--

LOCK TABLES `employee_work_periods` WRITE;
/*!40000 ALTER TABLE `employee_work_periods` DISABLE KEYS */;
/*!40000 ALTER TABLE `employee_work_periods` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `employees`
--

DROP TABLE IF EXISTS `employees`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employees` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employeeNumber` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `fatherName` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `position` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `wageType` enum('daily','monthly') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'daily',
  `wageAmount` decimal(36,18) NOT NULL,
  `currencyCode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `startDate` date NOT NULL,
  `endDate` date DEFAULT NULL,
  `status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `workerType` enum('regular','misc') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'regular',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `deletedAt` datetime DEFAULT NULL,
  `deletedByUserId` int DEFAULT NULL,
  `deleteReason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdByUserId` int DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employeeNumber` (`employeeNumber`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `employees`
--

LOCK TABLES `employees` WRITE;
/*!40000 ALTER TABLE `employees` DISABLE KEYS */;
INSERT INTO `employees` VALUES (1,'کارکوونکی-0001','نعمت الله','عنایت الله','0708877666','منشی','monthly',12000.000000000000000000,'AFN','2026-08-21',NULL,'inactive','regular',NULL,'2026-08-21 05:00:15',1,'sdsad',1,'2026-08-21 03:25:33','2026-08-21 05:00:15'),(2,'کارکوونکی-0002','نعمت الله','عنایت الله','0709876543','منشی','monthly',12000.000000000000000000,'AFN','2026-08-18',NULL,'inactive','regular',NULL,'2026-08-21 20:42:19',1,'sdfds',1,'2026-08-21 20:40:19','2026-08-21 20:42:19'),(3,'کارکوونکی-0003','احمد','محمود','0708888888','متفرقه کاریګر','daily',200.000000000000000000,'AFN','2026-08-16',NULL,'inactive','misc',NULL,'2026-08-21 20:47:35',1,'یبیس',1,'2026-08-21 20:46:38','2026-08-21 20:47:35'),(4,'کارکوونکی-0004','احمد','محمود','0708888888','منشی','monthly',12000.000000000000000000,'AFN','2026-08-11',NULL,'inactive','regular',NULL,'2026-08-21 11:38:23',1,'ssdfds',1,'2026-08-21 11:37:41','2026-08-21 11:38:23'),(5,'کارکوونکی-0005','احمد','محمود','0708888888','متفرقه کاریګر','daily',200.000000000000000000,'AFN','2026-08-11',NULL,'inactive','misc',NULL,'2026-08-21 11:41:31',1,'لابا',1,'2026-08-21 11:40:54','2026-08-21 11:41:31');
/*!40000 ALTER TABLE `employees` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `exchange_transactions`
--

DROP TABLE IF EXISTS `exchange_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `exchange_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `exchangeNumber` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `partyId` int NOT NULL,
  `exchangeDate` date NOT NULL,
  `currencyGiven` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `amountGiven` decimal(36,18) NOT NULL,
  `currencyReceived` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `amountReceived` decimal(36,18) NOT NULL,
  `rate` decimal(36,18) NOT NULL,
  `fee` decimal(36,18) NOT NULL DEFAULT '0.000000000000000000',
  `reference` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdByUserId` int DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `exchangeNumber` (`exchangeNumber`),
  KEY `partyId` (`partyId`),
  CONSTRAINT `exchange_transactions_ibfk_1` FOREIGN KEY (`partyId`) REFERENCES `parties` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `exchange_transactions`
--

LOCK TABLES `exchange_transactions` WRITE;
/*!40000 ALTER TABLE `exchange_transactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `exchange_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `expenses`
--

DROP TABLE IF EXISTS `expenses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `expenses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `expenseNumber` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` enum('kitchen','office','transport','utilities','salaries','maintenance','other') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `categoryName` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expenseDate` date NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(36,18) NOT NULL,
  `currencyCode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `payeePartyId` int DEFAULT NULL,
  `payeeName` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `projectId` int DEFAULT NULL,
  `cashAccountId` int DEFAULT NULL,
  `voidedAt` datetime DEFAULT NULL,
  `voidReason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdByUserId` int DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `expenseNumber` (`expenseNumber`),
  KEY `payeePartyId` (`payeePartyId`),
  KEY `projectId` (`projectId`),
  KEY `cashAccountId` (`cashAccountId`),
  CONSTRAINT `expenses_ibfk_1` FOREIGN KEY (`payeePartyId`) REFERENCES `parties` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `expenses_ibfk_2` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `expenses_ibfk_3` FOREIGN KEY (`cashAccountId`) REFERENCES `cash_accounts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `expenses`
--

LOCK TABLES `expenses` WRITE;
/*!40000 ALTER TABLE `expenses` DISABLE KEYS */;
INSERT INTO `expenses` VALUES (1,'مصرف-0001','other','دفتر','2026-08-19','د دفتر لپاره فرش',20000.000000000000000000,'AFN',NULL,NULL,NULL,NULL,NULL,NULL,1,'2026-08-21 12:17:16','2026-08-21 12:17:16'),(2,'مصرف-0002','other','دفتر','2026-08-21','قرطاسیه باب او انټرنیټ',8000.000000000000000000,'AFN',NULL,NULL,NULL,NULL,NULL,NULL,1,'2026-08-21 12:17:56','2026-08-21 12:17:56');
/*!40000 ALTER TABLE `expenses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fiscal_periods`
--

DROP TABLE IF EXISTS `fiscal_periods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fiscal_periods` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `startDate` date NOT NULL,
  `endDate` date NOT NULL,
  `isClosed` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fiscal_periods`
--

LOCK TABLES `fiscal_periods` WRITE;
/*!40000 ALTER TABLE `fiscal_periods` DISABLE KEYS */;
/*!40000 ALTER TABLE `fiscal_periods` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `floors`
--

DROP TABLE IF EXISTS `floors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `floors` (
  `id` int NOT NULL AUTO_INCREMENT,
  `blockId` int NOT NULL,
  `name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `levelNumber` int NOT NULL,
  `floorType` enum('basement','ground','mezzanine','residential','commercial','parking','roof','other') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'residential',
  `unitTypeId` int DEFAULT NULL,
  `purpose` enum('for_sale','for_rent') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `floors_block_id_level_number` (`blockId`,`levelNumber`),
  KEY `unitTypeId` (`unitTypeId`),
  CONSTRAINT `floors_ibfk_1` FOREIGN KEY (`blockId`) REFERENCES `blocks` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `floors_ibfk_2` FOREIGN KEY (`unitTypeId`) REFERENCES `unit_types` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `floors`
--

LOCK TABLES `floors` WRITE;
/*!40000 ALTER TABLE `floors` DISABLE KEYS */;
INSERT INTO `floors` VALUES (1,1,'آول منزل',1,'residential',1,'for_sale',1),(2,2,'اول منزل',1,'residential',1,'for_sale',1),(3,2,'دوهم منزل',2,'commercial',2,'for_sale',2),(4,2,'دیم منزل',3,'commercial',2,'for_rent',3);
/*!40000 ALTER TABLE `floors` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `journal_lines`
--

DROP TABLE IF EXISTS `journal_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `journal_lines` (
  `id` int NOT NULL AUTO_INCREMENT,
  `transactionId` int NOT NULL,
  `accountId` int NOT NULL,
  `currencyCode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `direction` enum('debit','credit') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(36,18) NOT NULL,
  `partyType` enum('customer','supplier','tenant','employee','partner','exchange_dealer') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `partyId` int DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `transactionId` (`transactionId`),
  KEY `accountId` (`accountId`),
  CONSTRAINT `journal_lines_ibfk_1` FOREIGN KEY (`transactionId`) REFERENCES `journal_transactions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `journal_lines_ibfk_2` FOREIGN KEY (`accountId`) REFERENCES `accounts` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=49 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `journal_lines`
--

LOCK TABLES `journal_lines` WRITE;
/*!40000 ALTER TABLE `journal_lines` DISABLE KEYS */;
INSERT INTO `journal_lines` VALUES (1,1,9,'AFN','debit',2000.000000000000000000,'employee',1,'تادیه معاش-0001 نعمت الله ته'),(2,1,1,'AFN','credit',2000.000000000000000000,NULL,NULL,'تادیه معاش-0001 نغدي ورکړه'),(3,2,9,'AFN','debit',600.000000000000000000,'employee',2,'تادیه معاش-0002 نعمت الله ته'),(4,2,1,'AFN','credit',600.000000000000000000,NULL,NULL,'تادیه معاش-0002 نغدي ورکړه'),(5,3,8,'AFN','debit',400000.000000000000000000,NULL,NULL,'خرید 4344 - سمینټ  × 2000.00'),(6,3,3,'AFN','credit',400000.000000000000000000,'supplier',1,'د خرید 4344 الباقی حساب'),(7,4,8,'AFN','credit',400000.000000000000000000,NULL,NULL,'بېرته کول: خرید 4344 - سمینټ  × 2000.00'),(8,4,3,'AFN','debit',400000.000000000000000000,'supplier',1,'بېرته کول: د خرید 4344 الباقی حساب'),(9,5,9,'AFN','debit',200.000000000000000000,'employee',3,'تادیه معاش-0003 احمد ته'),(10,5,1,'AFN','credit',200.000000000000000000,NULL,NULL,'تادیه معاش-0003 نغدي ورکړه'),(11,6,2,'USD','debit',35000.000000000000000000,'customer',2,'فروش فروش-0001 د مشتری حساب'),(12,6,6,'USD','credit',35000.000000000000000000,NULL,NULL,'فروش فروش-0001 عاید'),(13,7,1,'USD','debit',10000.000000000000000000,NULL,NULL,'رسید رسید-0001 د فروش فروش-0001'),(14,7,2,'USD','credit',10000.000000000000000000,'customer',2,'رسید رسید-0001 د فروش فروش-0001 ته تطبیق'),(15,8,1,'USD','credit',10000.000000000000000000,NULL,NULL,'بېرته کول: رسید رسید-0001 د فروش فروش-0001'),(16,8,2,'USD','debit',10000.000000000000000000,'customer',2,'بېرته کول: رسید رسید-0001 د فروش فروش-0001 ته تطبیق'),(17,9,2,'USD','credit',35000.000000000000000000,'customer',2,'بېرته کول: فروش فروش-0001 د مشتری حساب'),(18,9,6,'USD','debit',35000.000000000000000000,NULL,NULL,'بېرته کول: فروش فروش-0001 عاید'),(19,10,9,'AFN','debit',4000.000000000000000000,'employee',4,'تادیه معاش-0004 احمد ته'),(20,10,1,'AFN','credit',4000.000000000000000000,NULL,NULL,'تادیه معاش-0004 نغدي ورکړه'),(21,11,9,'AFN','debit',2000.000000000000000000,'employee',5,'تادیه معاش-0005 احمد ته'),(22,11,1,'AFN','credit',2000.000000000000000000,NULL,NULL,'تادیه معاش-0005 نغدي ورکړه'),(23,12,8,'AFN','debit',400000.000000000000000000,NULL,NULL,'خرید 4477 - سمینټ × 2000.00'),(24,12,3,'AFN','credit',400000.000000000000000000,'supplier',4,'د خرید 4477 الباقی حساب'),(25,13,2,'AFN','credit',10000.000000000000000000,'customer',9,'بازار/انفرادي راکړه - د مشتری بیل نمبر: 0 - د تورجان غالب کار د 5 ورځو د غالبانو حساب'),(26,13,1,'AFN','debit',10000.000000000000000000,NULL,NULL,'بازار/انفرادي راکړه - د مشتری بیل نمبر: 0 - د تورجان غالب کار د 5 ورځو د غالبانو حساب'),(27,14,2,'AFN','debit',200000.000000000000000000,'exchange_dealer',8,'رسیده ګی د دفتر له طرفه و حاجی بلال صراف ته'),(28,14,1,'AFN','credit',200000.000000000000000000,NULL,NULL,'رسیده ګی د دفتر له طرفه و حاجی بلال صراف ته'),(29,15,1,'AFN','debit',50000.000000000000000000,NULL,NULL,'Investment حاجيرسید-0001 by حاجی محمد داود — رسیده ګی د حاجی صاحب له طرفه و دفتر ته'),(30,15,5,'AFN','credit',50000.000000000000000000,'partner',1,'Investment حاجيرسید-0001 by حاجی محمد داود — رسیده ګی د حاجی صاحب له طرفه و دفتر ته'),(31,16,2,'USD','debit',35000.000000000000000000,'customer',5,'فروش فروش-0002 د مشتری حساب'),(32,16,6,'USD','credit',35000.000000000000000000,NULL,NULL,'فروش فروش-0002 عاید'),(33,17,1,'USD','debit',10000.000000000000000000,NULL,NULL,'رسید رسید-0002 د فروش فروش-0002'),(34,17,2,'USD','credit',10000.000000000000000000,'customer',5,'رسید رسید-0002 د فروش فروش-0002 ته تطبیق'),(35,18,2,'USD','debit',14000.000000000000000000,'customer',6,'فروش فروش-0003 د مشتری حساب'),(36,18,6,'USD','credit',14000.000000000000000000,NULL,NULL,'فروش فروش-0003 عاید'),(37,19,1,'USD','debit',5000.000000000000000000,NULL,NULL,'رسید رسید-0003 د فروش فروش-0003'),(38,19,2,'USD','credit',5000.000000000000000000,'customer',6,'رسید رسید-0003 د فروش فروش-0003 ته تطبیق'),(39,20,2,'USD','debit',300.000000000000000000,'tenant',7,'کرایه کرایه-0001 - د لومړۍ مودې او امانت حساب'),(40,20,7,'USD','credit',300.000000000000000000,NULL,NULL,'کرایه کرایه-0001 - د لومړۍ مودې کرایه'),(41,21,1,'USD','debit',100.000000000000000000,NULL,NULL,'د کرایې رسید دکرایېرسید-0001'),(42,21,2,'USD','credit',100.000000000000000000,'tenant',7,'د کرایې رسید دکرایېرسید-0001 د کرایې کرایه-0001 ته تطبیق'),(43,22,8,'AFN','debit',20000.000000000000000000,NULL,NULL,'مصرف مصرف-0001 - د دفتر لپاره فرش '),(44,22,1,'AFN','credit',20000.000000000000000000,NULL,NULL,'مصرف مصرف-0001 تادیه'),(45,23,8,'AFN','debit',8000.000000000000000000,NULL,NULL,'مصرف مصرف-0002 - قرطاسیه باب او انټرنیټ '),(46,23,1,'AFN','credit',8000.000000000000000000,NULL,NULL,'مصرف مصرف-0002 تادیه'),(47,24,3,'AFN','debit',200000.000000000000000000,'supplier',4,'رسیده ګی د دفتر له طرفه و عذیر عطایی شرکت ته'),(48,24,1,'AFN','credit',200000.000000000000000000,NULL,NULL,'رسیده ګی د دفتر له طرفه و عذیر عطایی شرکت ته');
/*!40000 ALTER TABLE `journal_lines` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `journal_transactions`
--

DROP TABLE IF EXISTS `journal_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `journal_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `idempotencyKey` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `transactionDate` date NOT NULL,
  `memo` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `isManual` tinyint(1) NOT NULL DEFAULT '0',
  `createdByUserId` int DEFAULT NULL,
  `voidedAt` datetime DEFAULT NULL,
  `voidedByUserId` int DEFAULT NULL,
  `voidReason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `reversalOfId` int DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idempotencyKey` (`idempotencyKey`),
  KEY `reversalOfId` (`reversalOfId`),
  CONSTRAINT `journal_transactions_ibfk_1` FOREIGN KEY (`reversalOfId`) REFERENCES `journal_transactions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `journal_transactions`
--

LOCK TABLES `journal_transactions` WRITE;
/*!40000 ALTER TABLE `journal_transactions` DISABLE KEYS */;
INSERT INTO `journal_transactions` VALUES (1,'73156ade-8afc-454b-9a0e-a16edebf6298','2026-08-21','معاش تادیه معاش-0001 نعمت الله ته',0,1,NULL,NULL,NULL,NULL,'2026-08-21 03:26:02'),(2,'f7f3274a-708e-4437-8c15-173f3b95ee76','2026-08-21','معاش تادیه معاش-0002 نعمت الله ته',0,1,NULL,NULL,NULL,NULL,'2026-08-21 20:41:02'),(3,'9105ed4c-ef2d-49fb-9776-780b1d97355c','2026-08-21','د خرید بیل 4344: سمینټ ',0,1,'2026-08-21 20:45:10',1,'غلط یا اړتیا نه لرونکی مشتری',NULL,'2026-08-21 20:44:02'),(4,'e8c95b15-6d82-4c52-b089-6c7476d53044','2026-08-21','د ثبت 3 بېرته کول: غلط یا اړتیا نه لرونکی مشتری',1,1,NULL,NULL,NULL,3,'2026-08-21 20:45:10'),(5,'f6ae36ab-580e-495d-b600-7f118e2089fc','2026-08-21','معاش تادیه معاش-0003 احمد ته',0,1,NULL,NULL,NULL,NULL,'2026-08-21 20:47:21'),(6,'6e50188f-6274-4fe6-8bf2-e2c5e9b0a23a','2026-08-21','فروش فروش-0001 - واحد 1',0,1,'2026-08-21 20:51:40',1,'غلط یا اړتیا نه لرونکی مشتری',NULL,'2026-08-21 20:50:56'),(7,'40d99292-6a66-4c55-91c9-04f9076a354d','2026-08-21','رسید رسید-0001 د فروش فروش-0001',0,1,'2026-08-21 20:51:40',1,'غلط یا اړتیا نه لرونکی مشتری',NULL,'2026-08-21 20:50:56'),(8,'b6b29a68-178b-49e5-a623-0ea39166078f','2026-08-21','د ثبت 7 بېرته کول: غلط یا اړتیا نه لرونکی مشتری',1,1,NULL,NULL,NULL,7,'2026-08-21 20:51:40'),(9,'e82f0f4c-8aeb-4edd-9501-87bc6878afa0','2026-08-21','د ثبت 6 بېرته کول: غلط یا اړتیا نه لرونکی مشتری',1,1,NULL,NULL,NULL,6,'2026-08-21 20:51:40'),(10,'f4d11a3f-76d6-4be4-97a2-7bea11523604','2026-08-21','معاش تادیه معاش-0004 احمد ته',0,1,NULL,NULL,NULL,NULL,'2026-08-21 11:38:00'),(11,'e5309f15-207b-46c2-aba7-e9ac920f2235','2026-08-21','معاش تادیه معاش-0005 احمد ته',0,1,NULL,NULL,NULL,NULL,'2026-08-21 11:41:14'),(12,'182a47e3-0195-4ddf-9832-e7a6cdc9144e','2026-08-20','د خرید بیل 4477: سمینټ',0,1,NULL,NULL,NULL,NULL,'2026-08-21 12:05:59'),(13,'1bbb795c-6697-442f-81a0-5cf87ba89073','2026-08-18','بازار/انفرادي راکړه - د مشتری بیل نمبر: 0 - د تورجان غالب کار د 5 ورځو د غالبانو حساب',1,1,NULL,NULL,NULL,NULL,'2026-08-21 12:07:17'),(14,'f0e37274-59a5-4007-99af-73d450c6e43d','2026-08-19','رسیده ګی د دفتر له طرفه و حاجی بلال صراف ته',1,1,NULL,NULL,NULL,NULL,'2026-08-21 12:08:12'),(15,'398b19dc-8ad1-4703-8518-b5ba1d453137','2026-08-17','Investment حاجيرسید-0001 — حاجی محمد داود — رسیده ګی د حاجی صاحب له طرفه و دفتر ته',0,1,NULL,NULL,NULL,NULL,'2026-08-21 12:10:18'),(16,'b15a7416-4ab9-4245-9f53-a2b142d679fd','2026-08-21','فروش فروش-0002 - واحد 2',0,1,NULL,NULL,NULL,NULL,'2026-08-21 12:12:22'),(17,'366819f9-71b6-4273-864f-e43a5c8b4eef','2026-08-21','رسید رسید-0002 د فروش فروش-0002',0,1,NULL,NULL,NULL,NULL,'2026-08-21 12:12:22'),(18,'1a56d222-ffb0-48d4-8a88-c1c8556a9188','2026-08-20','فروش فروش-0003 - واحد 3',0,1,NULL,NULL,NULL,NULL,'2026-08-21 12:14:11'),(19,'fed3e188-68ba-4650-88c3-3797ab1f30d3','2026-08-20','رسید رسید-0003 د فروش فروش-0003',0,1,NULL,NULL,NULL,NULL,'2026-08-21 12:14:11'),(20,'adabbbeb-026a-43a7-9ddb-cbe7d1b2f9fb','2026-08-16','کرایه کرایه-0001 - واحد 4',0,1,NULL,NULL,NULL,NULL,'2026-08-21 12:16:01'),(21,'c6a67e2c-f8a9-4669-ace7-cf976facfbb6','2026-08-16','د کرایې رسید دکرایېرسید-0001 د کرایې کرایه-0001',0,1,NULL,NULL,NULL,NULL,'2026-08-21 12:16:01'),(22,'eb01dd5b-3183-45f6-9356-fa50555b316d','2026-08-19','مصرف مصرف-0001: د دفتر لپاره فرش ',0,1,NULL,NULL,NULL,NULL,'2026-08-21 12:17:16'),(23,'a0a2a309-8a44-4b2e-b569-88593a562da8','2026-08-21','مصرف مصرف-0002: قرطاسیه باب او انټرنیټ ',0,1,NULL,NULL,NULL,NULL,'2026-08-21 12:17:56'),(24,'6f8a5d9d-0376-430a-a539-5d369cfda2ac','2026-08-21','رسیده ګی د دفتر له طرفه و عذیر عطایی شرکت ته',1,1,NULL,NULL,NULL,NULL,'2026-08-21 12:19:55');
/*!40000 ALTER TABLE `journal_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `parties`
--

DROP TABLE IF EXISTS `parties`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `parties` (
  `id` int NOT NULL AUTO_INCREMENT,
  `type` enum('individual_customer','market_customer','supplier','sales_customer','tenant','exchange_dealer','employee','partner','other') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `companyName` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fatherName` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `grandfatherName` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tazkiraNumber` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `taxRegNumber` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone1` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone2` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `photoUrl` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `deletedAt` datetime DEFAULT NULL,
  `deletedByUserId` int DEFAULT NULL,
  `deleteReason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `parties_name` (`name`),
  KEY `parties_tazkira_number` (`tazkiraNumber`),
  KEY `parties_type` (`type`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `parties`
--

LOCK TABLES `parties` WRITE;
/*!40000 ALTER TABLE `parties` DISABLE KEYS */;
INSERT INTO `parties` VALUES (1,'supplier','احمد',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,'2026-08-21 20:45:10',1,'غلط یا اړتیا نه لرونکی مشتری','2026-08-21 20:43:23','2026-08-21 20:45:10'),(2,'sales_customer','حاجی احمد',NULL,'حاجی محمود','حاجی سردار احمد','087668',NULL,'0700009988',NULL,'کندهار',NULL,NULL,0,'2026-08-21 20:51:40',1,'غلط یا اړتیا نه لرونکی مشتری','2026-08-21 20:49:59','2026-08-21 20:51:40'),(3,'supplier','احمد',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,'2026-08-21 11:58:01',1,'غلط یا اړتیا نه لرونکی مشتری','2026-08-21 11:57:50','2026-08-21 11:58:01'),(4,'supplier','احمد','عذیرعطایی شرکت',NULL,NULL,NULL,NULL,'0708899898','0708964443','کندهار',NULL,NULL,1,NULL,NULL,NULL,'2026-08-21 11:58:32','2026-08-21 11:58:32'),(5,'sales_customer','حاجی بسم الله جان',NULL,'خیر الله جان','نورجان','9787887',NULL,'0708777766','0708765432','څلورمه ناحیه کندهار افغانستان',NULL,NULL,1,NULL,NULL,NULL,'2026-08-21 11:59:33','2026-08-21 11:59:33'),(6,'sales_customer','حاجی عمر احمد',NULL,'حاجی ګل محمد','حاجی نورمحمد','8767888',NULL,'0708776655','0708888666','کندهار',NULL,NULL,1,NULL,NULL,NULL,'2026-08-21 12:00:17','2026-08-21 12:00:17'),(7,'tenant','سمیع الله',NULL,'خیر الله','بشیر احمد','876655',NULL,'0708888888','0708765566','کندهار',NULL,NULL,1,NULL,NULL,NULL,'2026-08-21 12:01:04','2026-08-21 12:01:04'),(8,'exchange_dealer','حاجی بلال احمد','وحید صرافی',NULL,NULL,NULL,NULL,'0709888888','0708988877','کندهار اتل مارکیټ 28 نمبر دوکان ',NULL,NULL,1,NULL,NULL,NULL,'2026-08-21 12:01:47','2026-08-21 12:01:47'),(9,'market_customer','تورجان','غالب کار',NULL,NULL,NULL,NULL,'0708887767','0708888866','کندهار',NULL,NULL,1,NULL,NULL,NULL,'2026-08-21 12:02:23','2026-08-21 12:02:23'),(10,'partner','حاجی محمد داود',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1,NULL,NULL,NULL,'2026-08-21 12:09:34','2026-08-21 12:09:34');
/*!40000 ALTER TABLE `parties` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `partner_transactions`
--

DROP TABLE IF EXISTS `partner_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `partner_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `transactionNumber` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `partnerId` int NOT NULL,
  `transactionDate` date NOT NULL,
  `type` enum('investment','withdrawal') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(36,18) NOT NULL,
  `previousBalance` decimal(36,18) DEFAULT NULL,
  `newBalance` decimal(36,18) DEFAULT NULL,
  `currencyCode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdByUserId` int DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `transactionNumber` (`transactionNumber`),
  KEY `partnerId` (`partnerId`),
  CONSTRAINT `partner_transactions_ibfk_1` FOREIGN KEY (`partnerId`) REFERENCES `partners` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `partner_transactions`
--

LOCK TABLES `partner_transactions` WRITE;
/*!40000 ALTER TABLE `partner_transactions` DISABLE KEYS */;
INSERT INTO `partner_transactions` VALUES (1,'حاجيرسید-0001',1,'2026-08-17','investment',50000.000000000000000000,0.000000000000000000,50000.000000000000000000,'AFN','رسیده ګی د حاجی صاحب له طرفه و دفتر ته',NULL,1,'2026-08-21 12:10:18','2026-08-21 12:10:18');
/*!40000 ALTER TABLE `partner_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `partners`
--

DROP TABLE IF EXISTS `partners`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `partners` (
  `id` int NOT NULL AUTO_INCREMENT,
  `partnerNumber` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `partyId` int NOT NULL,
  `initialInvestment` decimal(36,18) NOT NULL,
  `currencyCode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ownershipPercent` decimal(36,18) DEFAULT NULL,
  `joinDate` date NOT NULL,
  `status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdByUserId` int DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `partnerNumber` (`partnerNumber`),
  UNIQUE KEY `partyId` (`partyId`),
  CONSTRAINT `partners_ibfk_1` FOREIGN KEY (`partyId`) REFERENCES `parties` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `partners`
--

LOCK TABLES `partners` WRITE;
/*!40000 ALTER TABLE `partners` DISABLE KEYS */;
INSERT INTO `partners` VALUES (1,'حاجي-0001',10,0.000000000000000000,'AFN',NULL,'2026-08-21','active',NULL,1,'2026-08-21 12:09:34','2026-08-21 12:09:34');
/*!40000 ALTER TABLE `partners` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `party_roles`
--

DROP TABLE IF EXISTS `party_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `party_roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `partyId` int NOT NULL,
  `role` enum('individual_customer','market_customer','supplier','sales_customer','tenant','exchange_dealer','employee','partner','other') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `party_roles_party_id_role` (`partyId`,`role`),
  CONSTRAINT `party_roles_ibfk_1` FOREIGN KEY (`partyId`) REFERENCES `parties` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `party_roles`
--

LOCK TABLES `party_roles` WRITE;
/*!40000 ALTER TABLE `party_roles` DISABLE KEYS */;
INSERT INTO `party_roles` VALUES (4,4,'supplier'),(5,5,'sales_customer'),(6,6,'sales_customer'),(7,7,'tenant'),(8,8,'exchange_dealer'),(9,9,'market_customer'),(10,10,'partner');
/*!40000 ALTER TABLE `party_roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `permissions`
--

DROP TABLE IF EXISTS `permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `key` varchar(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `key` (`key`)
) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `permissions`
--

LOCK TABLES `permissions` WRITE;
/*!40000 ALTER TABLE `permissions` DISABLE KEYS */;
INSERT INTO `permissions` VALUES (1,'dashboard.view','د ډشبورډ لیدل'),(2,'journal.view','د روزنامچې لیدل'),(3,'journal.manage','د روزنامچې اداره'),(4,'accounting.manage','د حسابونو اداره'),(5,'parties.view','د مشتریانو لیدل'),(6,'parties.manage','د مشتریانو اداره'),(7,'projects.view','د پروژو لیدل'),(8,'projects.manage','د پروژو اداره'),(9,'unit_types.manage','د واحدونو ډولونه اداره'),(10,'sales.view','د فروشاتو لیدل'),(11,'sales.manage','د فروشاتو اداره'),(12,'rentals.view','د کرایې لیدل'),(13,'rentals.manage','د کرایې اداره'),(14,'purchases.view','د اجناسو خریداري لیدل'),(15,'purchases.manage','د اجناسو خریداري اداره'),(16,'expenses.view','د مصارفاتو لیدل'),(17,'expenses.manage','د مصارفاتو اداره'),(18,'exchange.view','د صرافۍ لیدل'),(19,'exchange.manage','د صرافۍ اداره'),(20,'partners.view','د شریکانو لیدل'),(21,'partners.manage','د شریکانو اداره'),(22,'haji_ledger.view','د حاجي صاحب کهاتې لیدل'),(23,'haji_ledger.manage','د حاجي صاحب کهاتې اداره'),(24,'employees.view','د کارکوونکو لیدل'),(25,'employees.manage','د کارکوونکو اداره'),(26,'attendance.view','د حاضرۍ لیدل'),(27,'attendance.manage','د حاضرۍ اداره'),(28,'hr.manage','د کارکوونکو او حاضرۍ اداره'),(29,'cash_accounts.manage','د صندوقونو اداره'),(30,'reports.view','د راپورونو لیدل'),(31,'reports.print','د راپورونو چاپ'),(32,'reports.export','د راپورونو راایستل'),(33,'delegations.view','د کفیل مدیریت لیدل'),(34,'delegations.manage','د کفیل مدیریت اداره'),(35,'settings.view','د عمومي تنظیماتو لیدل'),(36,'settings.manage','د عمومي تنظیماتو اداره'),(37,'users.manage','د کاروونکو اداره'),(38,'roles.manage','د رولونو او واکونو اداره'),(39,'audit.view','د بدلونونو راپور لیدل'),(40,'trash.view','حذف شوي ریکارډونه لیدل'),(41,'trash.manage','حذف شوي ریکارډونه اداره');
/*!40000 ALTER TABLE `permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `posting_links`
--

DROP TABLE IF EXISTS `posting_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `posting_links` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sourceModule` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sourceId` int NOT NULL,
  `postingType` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `transactionId` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `posting_links_source_module_source_id_posting_type` (`sourceModule`,`sourceId`,`postingType`),
  KEY `transactionId` (`transactionId`),
  CONSTRAINT `posting_links_ibfk_1` FOREIGN KEY (`transactionId`) REFERENCES `journal_transactions` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `posting_links`
--

LOCK TABLES `posting_links` WRITE;
/*!40000 ALTER TABLE `posting_links` DISABLE KEYS */;
INSERT INTO `posting_links` VALUES (1,'employee_payment',1,'employee_payment',1),(2,'employee_payment',2,'employee_payment',2),(3,'purchase',1,'purchase_creation',3),(4,'employee_payment',3,'employee_payment',5),(5,'sale',1,'sale_creation',6),(6,'sale_receipt',1,'sale_receipt',7),(7,'employee_payment',4,'employee_payment',10),(8,'employee_payment',5,'employee_payment',11),(9,'purchase',2,'purchase_creation',12),(10,'partner_transaction',1,'partner_transaction',15),(11,'sale',2,'sale_creation',16),(12,'sale_receipt',2,'sale_receipt',17),(13,'sale',3,'sale_creation',18),(14,'sale_receipt',3,'sale_receipt',19),(15,'rental',1,'rental_creation',20),(16,'rental_receipt',1,'rental_receipt',21),(17,'expense',1,'expense',22),(18,'expense',2,'expense',23);
/*!40000 ALTER TABLE `posting_links` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `projects`
--

DROP TABLE IF EXISTS `projects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('draft','active','on_hold','completed','archived') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `deletedAt` datetime DEFAULT NULL,
  `deletedByUserId` int DEFAULT NULL,
  `deleteReason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `projects`
--

LOCK TABLES `projects` WRITE;
/*!40000 ALTER TABLE `projects` DISABLE KEYS */;
INSERT INTO `projects` VALUES (1,'MD ټاور','001','archived',NULL,'2026-08-21 20:51:57',1,'سیس','2026-08-21 20:48:08','2026-08-21 20:51:57'),(2,'MD ساختمانی ټاور','0001','active',NULL,NULL,NULL,NULL,'2026-08-21 12:02:44','2026-08-21 12:02:57');
/*!40000 ALTER TABLE `projects` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchase_payments`
--

DROP TABLE IF EXISTS `purchase_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `paymentNumber` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `purchaseId` int NOT NULL,
  `paymentDate` date NOT NULL,
  `amount` decimal(36,18) NOT NULL,
  `previousBalance` decimal(36,18) DEFAULT NULL,
  `newBalance` decimal(36,18) DEFAULT NULL,
  `currencyCode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `method` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'cash',
  `cashAccountId` int DEFAULT NULL,
  `reference` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `paidByUserId` int DEFAULT NULL,
  `voidedAt` datetime DEFAULT NULL,
  `voidReason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `paymentNumber` (`paymentNumber`),
  KEY `purchaseId` (`purchaseId`),
  KEY `cashAccountId` (`cashAccountId`),
  CONSTRAINT `purchase_payments_ibfk_1` FOREIGN KEY (`purchaseId`) REFERENCES `purchases` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `purchase_payments_ibfk_2` FOREIGN KEY (`cashAccountId`) REFERENCES `cash_accounts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_payments`
--

LOCK TABLES `purchase_payments` WRITE;
/*!40000 ALTER TABLE `purchase_payments` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchase_payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchase_returns`
--

DROP TABLE IF EXISTS `purchase_returns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_returns` (
  `id` int NOT NULL AUTO_INCREMENT,
  `returnNumber` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `customerBillNumber` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `purchaseId` int NOT NULL,
  `returnDate` date NOT NULL,
  `returnedItemName` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(36,18) NOT NULL,
  `amount` decimal(36,18) NOT NULL,
  `currencyCode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdByUserId` int DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `returnNumber` (`returnNumber`),
  KEY `purchaseId` (`purchaseId`),
  CONSTRAINT `purchase_returns_ibfk_1` FOREIGN KEY (`purchaseId`) REFERENCES `purchases` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_returns`
--

LOCK TABLES `purchase_returns` WRITE;
/*!40000 ALTER TABLE `purchase_returns` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchase_returns` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchases`
--

DROP TABLE IF EXISTS `purchases`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchases` (
  `id` int NOT NULL AUTO_INCREMENT,
  `purchaseNumber` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `customerBillNumber` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `supplierPartyId` int NOT NULL,
  `purchaseDate` date NOT NULL,
  `itemName` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(36,18) NOT NULL,
  `unitOfMeasure` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unitPrice` decimal(36,18) NOT NULL,
  `totalAmount` decimal(36,18) NOT NULL,
  `currencyCode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('open','paid','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdByUserId` int DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `purchaseNumber` (`purchaseNumber`),
  KEY `supplierPartyId` (`supplierPartyId`),
  CONSTRAINT `purchases_ibfk_1` FOREIGN KEY (`supplierPartyId`) REFERENCES `parties` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchases`
--

LOCK TABLES `purchases` WRITE;
/*!40000 ALTER TABLE `purchases` DISABLE KEYS */;
INSERT INTO `purchases` VALUES (1,'4344',NULL,1,'2026-08-21','سمینټ ',2000.000000000000000000,'پارسل',200.000000000000000000,400000.000000000000000000,'AFN','cancelled',NULL,1,'2026-08-21 20:44:02','2026-08-21 20:45:10'),(2,'4477',NULL,4,'2026-08-20','سمینټ',2000.000000000000000000,'پارسل',200.000000000000000000,400000.000000000000000000,'AFN','open',NULL,1,'2026-08-21 12:05:59','2026-08-21 12:05:59');
/*!40000 ALTER TABLE `purchases` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rental_receipts`
--

DROP TABLE IF EXISTS `rental_receipts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rental_receipts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `receiptNumber` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `rentalId` int NOT NULL,
  `receiptDate` date NOT NULL,
  `amount` decimal(36,18) NOT NULL,
  `previousBalance` decimal(36,18) DEFAULT NULL,
  `newBalance` decimal(36,18) DEFAULT NULL,
  `currencyCode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `method` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'cash',
  `cashAccountId` int DEFAULT NULL,
  `reference` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `receivedByUserId` int DEFAULT NULL,
  `voidedAt` datetime DEFAULT NULL,
  `voidReason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `receiptNumber` (`receiptNumber`),
  KEY `rentalId` (`rentalId`),
  KEY `cashAccountId` (`cashAccountId`),
  CONSTRAINT `rental_receipts_ibfk_1` FOREIGN KEY (`rentalId`) REFERENCES `rentals` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `rental_receipts_ibfk_2` FOREIGN KEY (`cashAccountId`) REFERENCES `cash_accounts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rental_receipts`
--

LOCK TABLES `rental_receipts` WRITE;
/*!40000 ALTER TABLE `rental_receipts` DISABLE KEYS */;
INSERT INTO `rental_receipts` VALUES (1,'دکرایېرسید-0001',1,'2026-08-16',100.000000000000000000,300.000000000000000000,200.000000000000000000,'USD','cash',NULL,NULL,'لومړنی رسید د کرایې د ثبت پر وخت درج شو',1,NULL,NULL,'2026-08-21 12:16:01','2026-08-21 12:16:01');
/*!40000 ALTER TABLE `rental_receipts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rentals`
--

DROP TABLE IF EXISTS `rentals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rentals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `rentalNumber` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `unitId` int NOT NULL,
  `tenantPartyId` int NOT NULL,
  `startDate` date NOT NULL,
  `endDate` date DEFAULT NULL,
  `rentAmount` decimal(36,18) NOT NULL,
  `frequency` enum('monthly','quarterly','yearly') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'monthly',
  `depositAmount` decimal(36,18) NOT NULL DEFAULT '0.000000000000000000',
  `currencyCode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('active','ended','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdByUserId` int DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rentalNumber` (`rentalNumber`),
  KEY `unitId` (`unitId`),
  KEY `tenantPartyId` (`tenantPartyId`),
  CONSTRAINT `rentals_ibfk_1` FOREIGN KEY (`unitId`) REFERENCES `units` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `rentals_ibfk_2` FOREIGN KEY (`tenantPartyId`) REFERENCES `parties` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rentals`
--

LOCK TABLES `rentals` WRITE;
/*!40000 ALTER TABLE `rentals` DISABLE KEYS */;
INSERT INTO `rentals` VALUES (1,'کرایه-0001',4,7,'2026-08-16',NULL,300.000000000000000000,'monthly',0.000000000000000000,'USD','active','یوباب دوکان سمیع الله ته دمیاشتی په کرایه ورکول سول ',1,'2026-08-21 12:16:01','2026-08-21 12:16:01');
/*!40000 ALTER TABLE `rentals` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `role_permissions`
--

DROP TABLE IF EXISTS `role_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `role_permissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `roleId` int NOT NULL,
  `permissionId` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `role_permissions_permissionId_roleId_unique` (`roleId`,`permissionId`),
  UNIQUE KEY `role_permissions_role_id_permission_id` (`roleId`,`permissionId`),
  KEY `permissionId` (`permissionId`),
  CONSTRAINT `role_permissions_ibfk_1` FOREIGN KEY (`roleId`) REFERENCES `roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `role_permissions_ibfk_2` FOREIGN KEY (`permissionId`) REFERENCES `permissions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=166 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `role_permissions`
--

LOCK TABLES `role_permissions` WRITE;
/*!40000 ALTER TABLE `role_permissions` DISABLE KEYS */;
INSERT INTO `role_permissions` VALUES (1,1,1),(2,1,2),(3,1,3),(4,1,4),(5,1,5),(6,1,6),(7,1,7),(8,1,8),(9,1,9),(10,1,10),(11,1,11),(12,1,12),(13,1,13),(14,1,14),(15,1,15),(16,1,16),(17,1,17),(18,1,18),(19,1,19),(20,1,20),(21,1,21),(22,1,22),(23,1,23),(24,1,24),(25,1,25),(26,1,26),(27,1,27),(28,1,28),(29,1,29),(30,1,30),(31,1,31),(32,1,32),(33,1,33),(34,1,34),(35,1,35),(36,1,36),(37,1,37),(38,1,38),(39,1,39),(40,1,40),(41,1,41),(42,2,1),(43,2,2),(44,2,5),(45,2,7),(46,2,10),(47,2,12),(48,2,14),(49,2,16),(50,2,18),(51,2,20),(52,2,22),(53,2,24),(54,2,26),(55,2,30),(56,2,31),(57,2,33),(58,3,1),(59,3,2),(60,3,3),(61,3,4),(62,3,5),(63,3,6),(67,3,10),(68,3,12),(66,3,14),(64,3,16),(65,3,17),(69,3,18),(70,3,20),(71,3,22),(72,3,30),(73,3,31),(74,3,32),(75,3,33),(76,4,1),(77,4,2),(78,4,3),(79,4,4),(80,4,29),(81,4,30),(82,4,31),(83,5,1),(84,5,7),(85,5,8),(86,5,9),(87,5,10),(88,5,12),(89,5,30),(90,6,1),(93,6,5),(94,6,6),(91,6,14),(92,6,15),(95,6,30),(96,6,31),(97,7,1),(102,7,5),(103,7,6),(98,7,10),(99,7,11),(100,7,12),(101,7,13),(104,7,30),(105,7,31),(106,8,1),(107,8,16),(108,8,17),(109,8,30),(110,8,31),(111,9,1),(112,9,24),(113,9,25),(114,9,26),(115,9,27),(116,9,28),(117,9,30),(118,9,31),(119,10,1),(122,10,5),(123,10,6),(120,10,18),(121,10,19),(124,10,30),(125,10,31),(126,11,1),(127,11,20),(128,11,21),(129,11,22),(130,11,23),(131,11,30),(132,11,31),(133,12,1),(134,12,30),(135,12,31),(136,13,1),(137,13,30),(138,13,31),(139,13,32),(140,13,39),(141,13,40),(142,14,1),(143,14,2),(144,14,3),(145,14,4),(146,14,5),(147,14,6),(148,14,7),(151,14,10),(152,14,11),(153,14,12),(154,14,13),(149,14,14),(150,14,15),(155,14,16),(156,14,17),(157,14,18),(158,14,19),(159,14,20),(160,14,22),(161,14,24),(162,14,26),(164,14,30),(165,14,31),(163,14,33);
/*!40000 ALTER TABLE `role_permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES (1,'admin','د سیستم بشپړ واک','2026-08-13 21:58:41','2026-08-13 21:58:41'),(2,'manager','د شرکت عمومي مسوول','2026-08-13 21:58:41','2026-08-13 21:58:41'),(3,'accountant','د حسابونو محاسب','2026-08-13 21:58:41','2026-08-13 21:58:41'),(4,'cashier','د صندوق او نغدو پیسو مسوول','2026-08-13 21:58:42','2026-08-13 21:58:42'),(5,'project_manager','د پروژو، بلاکونو او واحدونو مسوول','2026-08-13 21:58:42','2026-08-13 21:58:42'),(6,'purchase_manager','د اجناسو د خریداري مسوول','2026-08-13 21:58:42','2026-08-13 21:58:42'),(7,'sales_manager','د فروشاتو او کرایې مسوول','2026-08-13 21:58:42','2026-08-13 21:58:42'),(8,'expenses_manager','د مصارفاتو مسوول','2026-08-13 21:58:42','2026-08-13 21:58:42'),(9,'hr_manager','د کارکوونکو او حاضرۍ مسوول','2026-08-13 21:58:42','2026-08-13 21:58:42'),(10,'exchange_manager','د صرافۍ مسوول','2026-08-13 21:58:42','2026-08-13 21:58:42'),(11,'partners_manager','د شریکانو او حاجي صاحب کهاتې مسوول','2026-08-13 21:58:42','2026-08-13 21:58:42'),(12,'reports_viewer','یوازې د راپورونو لیدونکی','2026-08-13 21:58:42','2026-08-13 21:58:42'),(13,'auditor','د راپورونو او بدلونونو څارونکی','2026-08-13 21:58:42','2026-08-13 21:58:42'),(14,'kafil','د موقتي کفیل او استازي عملیاتي رول','2026-08-13 21:58:42','2026-08-13 21:58:42');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sale_credits`
--

DROP TABLE IF EXISTS `sale_credits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sale_credits` (
  `id` int NOT NULL AUTO_INCREMENT,
  `partyId` int NOT NULL,
  `sourceSaleId` int NOT NULL,
  `sourceReceiptId` int DEFAULT NULL,
  `currencyCode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(36,18) NOT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `voidedAt` datetime DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `partyId` (`partyId`),
  KEY `sourceSaleId` (`sourceSaleId`),
  CONSTRAINT `sale_credits_ibfk_1` FOREIGN KEY (`partyId`) REFERENCES `parties` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `sale_credits_ibfk_2` FOREIGN KEY (`sourceSaleId`) REFERENCES `sales` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sale_credits`
--

LOCK TABLES `sale_credits` WRITE;
/*!40000 ALTER TABLE `sale_credits` DISABLE KEYS */;
/*!40000 ALTER TABLE `sale_credits` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sale_documents`
--

DROP TABLE IF EXISTS `sale_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sale_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `saleId` int NOT NULL,
  `fileName` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `fileUrl` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `mimeType` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sizeBytes` int NOT NULL,
  `uploadedByUserId` int DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sale_documents_sale_id` (`saleId`),
  CONSTRAINT `sale_documents_ibfk_1` FOREIGN KEY (`saleId`) REFERENCES `sales` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sale_documents`
--

LOCK TABLES `sale_documents` WRITE;
/*!40000 ALTER TABLE `sale_documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `sale_documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sale_receipts`
--

DROP TABLE IF EXISTS `sale_receipts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sale_receipts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `receiptNumber` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `saleId` int NOT NULL,
  `receiptDate` date NOT NULL,
  `amount` decimal(36,18) NOT NULL,
  `previousBalance` decimal(36,18) DEFAULT NULL,
  `newBalance` decimal(36,18) DEFAULT NULL,
  `currencyCode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `method` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'cash',
  `cashAccountId` int DEFAULT NULL,
  `reference` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `receivedByUserId` int DEFAULT NULL,
  `voidedAt` datetime DEFAULT NULL,
  `voidReason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `receiptNumber` (`receiptNumber`),
  KEY `saleId` (`saleId`),
  KEY `cashAccountId` (`cashAccountId`),
  CONSTRAINT `sale_receipts_ibfk_1` FOREIGN KEY (`saleId`) REFERENCES `sales` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `sale_receipts_ibfk_2` FOREIGN KEY (`cashAccountId`) REFERENCES `cash_accounts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sale_receipts`
--

LOCK TABLES `sale_receipts` WRITE;
/*!40000 ALTER TABLE `sale_receipts` DISABLE KEYS */;
INSERT INTO `sale_receipts` VALUES (1,'رسید-0001',1,'2026-08-21',10000.000000000000000000,35000.000000000000000000,25000.000000000000000000,'USD','cash',NULL,NULL,'لومړنی رسید د فروش د ثبت پر وخت درج شو',1,'2026-08-21 20:51:40','غلط یا اړتیا نه لرونکی مشتری','2026-08-21 20:50:56','2026-08-21 20:51:40'),(2,'رسید-0002',2,'2026-08-21',10000.000000000000000000,35000.000000000000000000,25000.000000000000000000,'USD','cash',NULL,NULL,'لومړنی رسید د فروش د ثبت پر وخت درج شو',1,NULL,NULL,'2026-08-21 12:12:22','2026-08-21 12:12:22'),(3,'رسید-0003',3,'2026-08-20',5000.000000000000000000,14000.000000000000000000,9000.000000000000000000,'USD','cash',NULL,NULL,'لومړنی رسید د فروش د ثبت پر وخت درج شو',1,NULL,NULL,'2026-08-21 12:14:11','2026-08-21 12:14:11');
/*!40000 ALTER TABLE `sale_receipts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sales`
--

DROP TABLE IF EXISTS `sales`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sales` (
  `id` int NOT NULL AUTO_INCREMENT,
  `saleNumber` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `contractNumber` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unitId` int NOT NULL,
  `partyId` int NOT NULL,
  `price` decimal(36,18) NOT NULL,
  `discount` decimal(36,18) NOT NULL DEFAULT '0.000000000000000000',
  `finalPrice` decimal(36,18) NOT NULL,
  `currencyCode` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `saleDate` date NOT NULL,
  `paymentType` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('draft','reserved','active','fully_paid','cancelled','reversed') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdByUserId` int DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `saleNumber` (`saleNumber`),
  KEY `unitId` (`unitId`),
  KEY `partyId` (`partyId`),
  CONSTRAINT `sales_ibfk_1` FOREIGN KEY (`unitId`) REFERENCES `units` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `sales_ibfk_2` FOREIGN KEY (`partyId`) REFERENCES `parties` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sales`
--

LOCK TABLES `sales` WRITE;
/*!40000 ALTER TABLE `sales` DISABLE KEYS */;
INSERT INTO `sales` VALUES (1,'فروش-0001',NULL,1,2,35000.000000000000000000,0.000000000000000000,35000.000000000000000000,'USD','2026-08-21','installment','reversed','یوباب کور پر حاجی احمد باندی په فروش ورسید ',1,'2026-08-21 20:50:56','2026-08-21 20:51:40'),(2,'فروش-0002',NULL,2,5,35000.000000000000000000,0.000000000000000000,35000.000000000000000000,'USD','2026-08-21','installment','active','یو باب کور پر حاجی بسم الله باندی په فروش ورسید ',1,'2026-08-21 12:12:22','2026-08-21 12:12:22'),(3,'فروش-0003',NULL,3,6,14000.000000000000000000,0.000000000000000000,14000.000000000000000000,'USD','2026-08-20','installment','active','یوباب دوکان پر حاجی عمر احمدباندی په فروش ورسید ',1,'2026-08-21 12:14:11','2026-08-21 12:14:11');
/*!40000 ALTER TABLE `sales` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sequelizemeta`
--

DROP TABLE IF EXISTS `sequelizemeta`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sequelizemeta` (
  `name` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci NOT NULL,
  PRIMARY KEY (`name`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sequelizemeta`
--

LOCK TABLES `sequelizemeta` WRITE;
/*!40000 ALTER TABLE `sequelizemeta` DISABLE KEYS */;
INSERT INTO `sequelizemeta` VALUES ('001-user-lockout-fields'),('002-sale-credit-void-fields'),('003-sale-receipt-balance-fields'),('004-company-settings-contact-fields'),('005-user-last-login'),('006-exact-decimal-precision'),('007-trash-items'),('008-purchase-customer-bill-numbers'),('009-expense-category-name'),('010-expense-category-config'),('011-project-soft-delete-fields'),('012-sale-documents'),('013-employee-worker-type-end-date'),('014-employee-work-periods'),('015-employee-documents'),('016-employee-soft-delete-fields'),('017-daily-cash-target-fields'),('018-kafil-delegations'),('019-company-welcome-text'),('020-purchase-schema-compatibility'),('021-expense-schema-compatibility'),('022-exchange-schema-compatibility'),('023-employee-payment-schema-compatibility'),('024-partner-transaction-schema-compatibility'),('025-partner-schema-compatibility'),('026-purchase-return-legacy-column-compatibility'),('027-company-logo-longtext'),('028-company-partners'),('029-unit-room-count'),('030-floor-purpose'),('031-party-soft-delete-fields'),('032-trash-restore-fields'),('033-floor-unit-type'),('034-partner-transaction-description'),('035-party-company-name'),('036-employee-payment-debt-repayment-type'),('037-company-slogan');
/*!40000 ALTER TABLE `sequelizemeta` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `trash_items`
--

DROP TABLE IF EXISTS `trash_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `trash_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `entityType` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `entityId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `displayName` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sourcePath` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `snapshot` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `deleteReason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `deletedByUserId` int DEFAULT NULL,
  `deletedAt` datetime NOT NULL,
  `purgeAfter` datetime NOT NULL,
  `purgedAt` datetime DEFAULT NULL,
  `purgedByUserId` int DEFAULT NULL,
  `purgeReason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `restoredAt` datetime DEFAULT NULL,
  `restoredByUserId` int DEFAULT NULL,
  `restoreReason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `deletedByUserId` (`deletedByUserId`),
  KEY `purgedByUserId` (`purgedByUserId`),
  KEY `trash_items_entity_type_entity_id` (`entityType`,`entityId`),
  KEY `trash_items_purged_at_purge_after` (`purgedAt`,`purgeAfter`),
  KEY `trash_items_restored_at` (`restoredAt`),
  CONSTRAINT `trash_items_ibfk_1` FOREIGN KEY (`deletedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `trash_items_ibfk_2` FOREIGN KEY (`purgedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `trash_items`
--

LOCK TABLES `trash_items` WRITE;
/*!40000 ALTER TABLE `trash_items` DISABLE KEYS */;
INSERT INTO `trash_items` VALUES (1,'Employee','1','نعمت الله','/employees','{\"id\":1,\"employeeNumber\":\"کارکوونکی-0001\",\"name\":\"نعمت الله\",\"fatherName\":\"عنایت الله\",\"phone\":\"0708877666\",\"position\":\"منشی\",\"wageType\":\"monthly\",\"wageAmount\":\"12000.000000000000000000\",\"currencyCode\":\"AFN\",\"startDate\":\"2026-08-21\",\"endDate\":null,\"status\":\"active\",\"workerType\":\"regular\",\"notes\":null,\"deletedAt\":null,\"deletedByUserId\":null,\"deleteReason\":null,\"createdByUserId\":1,\"createdAt\":\"2026-08-21T03:25:33.000Z\",\"updatedAt\":\"2026-08-21T03:25:33.000Z\",\"attendances\":[{\"id\":1,\"employeeId\":1,\"date\":\"2026-08-21\",\"status\":\"present\",\"payableAmount\":\"400.000000000000000000\",\"currencyCode\":\"AFN\",\"notes\":null,\"createdByUserId\":1,\"createdAt\":\"2026-08-21T03:25:42.000Z\",\"updatedAt\":\"2026-08-21T03:25:42.000Z\"}],\"payments\":[{\"id\":1,\"paymentNumber\":\"معاش-0001\",\"employeeId\":1,\"paymentDate\":\"2026-08-21\",\"type\":\"salary\",\"amount\":\"2000.000000000000000000\",\"previousBalance\":\"400.000000000000000000\",\"newBalance\":\"-1600.000000000000000000\",\"currencyCode\":\"AFN\",\"method\":\"cash\",\"cashAccountId\":null,\"note\":null,\"paidByUserId\":1,\"voidedAt\":null,\"voidReason\":null,\"createdAt\":\"2026-08-21T03:26:02.000Z\",\"updatedAt\":\"2026-08-21T03:26:02.000Z\"}]}','sdsad',1,'2026-08-21 05:00:15','2026-09-20 05:00:15',NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-21 05:00:15','2026-08-21 05:00:15'),(2,'Employee','2','نعمت الله','/employees','{\"id\":2,\"employeeNumber\":\"کارکوونکی-0002\",\"name\":\"نعمت الله\",\"fatherName\":\"عنایت الله\",\"phone\":\"0709876543\",\"position\":\"منشی\",\"wageType\":\"monthly\",\"wageAmount\":\"12000.000000000000000000\",\"currencyCode\":\"AFN\",\"startDate\":\"2026-08-18\",\"endDate\":null,\"status\":\"active\",\"workerType\":\"regular\",\"notes\":null,\"deletedAt\":null,\"deletedByUserId\":null,\"deleteReason\":null,\"createdByUserId\":1,\"createdAt\":\"2026-08-21T20:40:19.000Z\",\"updatedAt\":\"2026-08-21T20:40:19.000Z\",\"attendances\":[{\"id\":2,\"employeeId\":2,\"date\":\"2026-08-18\",\"status\":\"present\",\"payableAmount\":\"400.000000000000000000\",\"currencyCode\":\"AFN\",\"notes\":\"پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو\",\"createdByUserId\":1,\"createdAt\":\"2026-08-21T20:40:24.000Z\",\"updatedAt\":\"2026-08-21T20:40:24.000Z\"},{\"id\":3,\"employeeId\":2,\"date\":\"2026-08-19\",\"status\":\"present\",\"payableAmount\":\"400.000000000000000000\",\"currencyCode\":\"AFN\",\"notes\":\"پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو\",\"createdByUserId\":1,\"createdAt\":\"2026-08-21T20:40:24.000Z\",\"updatedAt\":\"2026-08-21T20:40:24.000Z\"},{\"id\":4,\"employeeId\":2,\"date\":\"2026-08-20\",\"status\":\"present\",\"payableAmount\":\"400.000000000000000000\",\"currencyCode\":\"AFN\",\"notes\":\"پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو\",\"createdByUserId\":1,\"createdAt\":\"2026-08-21T20:40:24.000Z\",\"updatedAt\":\"2026-08-21T20:40:24.000Z\"},{\"id\":5,\"employeeId\":2,\"date\":\"2026-08-21\",\"status\":\"present\",\"payableAmount\":\"400.000000000000000000\",\"currencyCode\":\"AFN\",\"notes\":null,\"createdByUserId\":1,\"createdAt\":\"2026-08-21T20:40:24.000Z\",\"updatedAt\":\"2026-08-21T20:40:24.000Z\"}],\"payments\":[{\"id\":2,\"paymentNumber\":\"معاش-0002\",\"employeeId\":2,\"paymentDate\":\"2026-08-21\",\"type\":\"salary\",\"amount\":\"600.000000000000000000\",\"previousBalance\":\"1600.000000000000000000\",\"newBalance\":\"1000.000000000000000000\",\"currencyCode\":\"AFN\",\"method\":\"cash\",\"cashAccountId\":null,\"note\":null,\"paidByUserId\":1,\"voidedAt\":null,\"voidReason\":null,\"createdAt\":\"2026-08-21T20:41:02.000Z\",\"updatedAt\":\"2026-08-21T20:41:02.000Z\"}]}','sdfds',1,'2026-08-21 20:42:19','2026-09-20 20:42:19',NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-21 20:42:19','2026-08-21 20:42:19'),(3,'Purchase','1','4344','/purchases/1','{\"id\":1,\"purchaseNumber\":\"4344\",\"customerBillNumber\":null,\"supplierPartyId\":1,\"purchaseDate\":\"2026-08-21\",\"itemName\":\"سمینټ \",\"quantity\":\"2000.000000000000000000\",\"unitOfMeasure\":\"پارسل\",\"unitPrice\":\"200.000000000000000000\",\"totalAmount\":\"400000.000000000000000000\",\"currencyCode\":\"AFN\",\"status\":\"open\",\"notes\":null,\"createdByUserId\":1,\"createdAt\":\"2026-08-21T20:44:02.000Z\",\"updatedAt\":\"2026-08-21T20:44:02.000Z\"}','غلط یا اړتیا نه لرونکی مشتری',1,'2026-08-21 20:45:10','2026-09-20 20:45:10',NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-21 20:45:10','2026-08-21 20:45:10'),(4,'Party','1','احمد','/parties','{\"id\":1,\"type\":\"supplier\",\"name\":\"احمد\",\"companyName\":null,\"fatherName\":null,\"grandfatherName\":null,\"tazkiraNumber\":null,\"taxRegNumber\":null,\"phone1\":null,\"phone2\":null,\"address\":null,\"notes\":null,\"photoUrl\":null,\"isActive\":true,\"deletedAt\":null,\"deletedByUserId\":null,\"deleteReason\":null,\"createdAt\":\"2026-08-21T20:43:23.000Z\",\"updatedAt\":\"2026-08-21T20:43:23.000Z\",\"roles\":[{\"id\":1,\"partyId\":1,\"role\":\"supplier\"}]}','غلط یا اړتیا نه لرونکی مشتری',1,'2026-08-21 20:45:10','2026-09-20 20:45:10',NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-21 20:45:10','2026-08-21 20:45:10'),(5,'Employee','3','احمد','/employees','{\"id\":3,\"employeeNumber\":\"کارکوونکی-0003\",\"name\":\"احمد\",\"fatherName\":\"محمود\",\"phone\":\"0708888888\",\"position\":\"متفرقه کاریګر\",\"wageType\":\"daily\",\"wageAmount\":\"200.000000000000000000\",\"currencyCode\":\"AFN\",\"startDate\":\"2026-08-16\",\"endDate\":null,\"status\":\"active\",\"workerType\":\"misc\",\"notes\":null,\"deletedAt\":null,\"deletedByUserId\":null,\"deleteReason\":null,\"createdByUserId\":1,\"createdAt\":\"2026-08-21T20:46:38.000Z\",\"updatedAt\":\"2026-08-21T20:46:38.000Z\",\"attendances\":[],\"payments\":[{\"id\":3,\"paymentNumber\":\"معاش-0003\",\"employeeId\":3,\"paymentDate\":\"2026-08-21\",\"type\":\"salary\",\"amount\":\"200.000000000000000000\",\"previousBalance\":\"1200.000000000000000000\",\"newBalance\":\"1000.000000000000000000\",\"currencyCode\":\"AFN\",\"method\":\"cash\",\"cashAccountId\":null,\"note\":\"رسیده ګی د دفتر له طرفه و احمد ته \",\"paidByUserId\":1,\"voidedAt\":null,\"voidReason\":null,\"createdAt\":\"2026-08-21T20:47:21.000Z\",\"updatedAt\":\"2026-08-21T20:47:21.000Z\"}]}','یبیس',1,'2026-08-21 20:47:35','2026-09-20 20:47:35',NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-21 20:47:35','2026-08-21 20:47:35'),(6,'Sale','1','فروش-0001','/sales?customerType=sales_customer&salesDetail=1&allDates=1','{\"id\":1,\"saleNumber\":\"فروش-0001\",\"contractNumber\":null,\"unitId\":1,\"partyId\":2,\"price\":\"35000.000000000000000000\",\"discount\":\"0.000000000000000000\",\"finalPrice\":\"35000.000000000000000000\",\"currencyCode\":\"USD\",\"saleDate\":\"2026-08-21\",\"paymentType\":\"installment\",\"status\":\"active\",\"notes\":\"یوباب کور پر حاجی احمد باندی په فروش ورسید \",\"createdByUserId\":1,\"createdAt\":\"2026-08-21T20:50:56.000Z\",\"updatedAt\":\"2026-08-21T20:50:56.000Z\"}','غلط یا اړتیا نه لرونکی مشتری',1,'2026-08-21 20:51:40','2026-09-20 20:51:40',NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-21 20:51:40','2026-08-21 20:51:40'),(7,'Party','2','حاجی احمد','/parties','{\"id\":2,\"type\":\"sales_customer\",\"name\":\"حاجی احمد\",\"companyName\":null,\"fatherName\":\"حاجی محمود\",\"grandfatherName\":\"حاجی سردار احمد\",\"tazkiraNumber\":\"087668\",\"taxRegNumber\":null,\"phone1\":\"0700009988\",\"phone2\":null,\"address\":\"کندهار\",\"notes\":null,\"photoUrl\":null,\"isActive\":true,\"deletedAt\":null,\"deletedByUserId\":null,\"deleteReason\":null,\"createdAt\":\"2026-08-21T20:49:59.000Z\",\"updatedAt\":\"2026-08-21T20:49:59.000Z\",\"roles\":[{\"id\":2,\"partyId\":2,\"role\":\"sales_customer\"}]}','غلط یا اړتیا نه لرونکی مشتری',1,'2026-08-21 20:51:40','2026-09-20 20:51:40',NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-21 20:51:40','2026-08-21 20:51:40'),(8,'Project','1','MD ټاور','/projects/list','{\"id\":1,\"name\":\"MD ټاور\",\"code\":\"001\",\"status\":\"draft\",\"description\":null,\"deletedAt\":null,\"deletedByUserId\":null,\"deleteReason\":null,\"createdAt\":\"2026-08-21T20:48:08.000Z\",\"updatedAt\":\"2026-08-21T20:48:08.000Z\"}','سیس',1,'2026-08-21 20:51:57','2026-09-20 20:51:57',NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-21 20:51:57','2026-08-21 20:51:57'),(9,'Employee','4','احمد','/employees','{\"id\":4,\"employeeNumber\":\"کارکوونکی-0004\",\"name\":\"احمد\",\"fatherName\":\"محمود\",\"phone\":\"0708888888\",\"position\":\"منشی\",\"wageType\":\"monthly\",\"wageAmount\":\"12000.000000000000000000\",\"currencyCode\":\"AFN\",\"startDate\":\"2026-08-11\",\"endDate\":null,\"status\":\"active\",\"workerType\":\"regular\",\"notes\":null,\"deletedAt\":null,\"deletedByUserId\":null,\"deleteReason\":null,\"createdByUserId\":1,\"createdAt\":\"2026-08-21T11:37:41.000Z\",\"updatedAt\":\"2026-08-21T11:37:41.000Z\",\"attendances\":[{\"id\":6,\"employeeId\":4,\"date\":\"2026-08-11\",\"status\":\"present\",\"payableAmount\":\"400.000000000000000000\",\"currencyCode\":\"AFN\",\"notes\":\"پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو\",\"createdByUserId\":1,\"createdAt\":\"2026-08-21T11:37:46.000Z\",\"updatedAt\":\"2026-08-21T11:37:46.000Z\"},{\"id\":7,\"employeeId\":4,\"date\":\"2026-08-12\",\"status\":\"present\",\"payableAmount\":\"400.000000000000000000\",\"currencyCode\":\"AFN\",\"notes\":\"پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو\",\"createdByUserId\":1,\"createdAt\":\"2026-08-21T11:37:46.000Z\",\"updatedAt\":\"2026-08-21T11:37:46.000Z\"},{\"id\":8,\"employeeId\":4,\"date\":\"2026-08-13\",\"status\":\"present\",\"payableAmount\":\"400.000000000000000000\",\"currencyCode\":\"AFN\",\"notes\":\"پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو\",\"createdByUserId\":1,\"createdAt\":\"2026-08-21T11:37:46.000Z\",\"updatedAt\":\"2026-08-21T11:37:46.000Z\"},{\"id\":9,\"employeeId\":4,\"date\":\"2026-08-14\",\"status\":\"present\",\"payableAmount\":\"400.000000000000000000\",\"currencyCode\":\"AFN\",\"notes\":\"پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو\",\"createdByUserId\":1,\"createdAt\":\"2026-08-21T11:37:46.000Z\",\"updatedAt\":\"2026-08-21T11:37:46.000Z\"},{\"id\":10,\"employeeId\":4,\"date\":\"2026-08-15\",\"status\":\"present\",\"payableAmount\":\"400.000000000000000000\",\"currencyCode\":\"AFN\",\"notes\":\"پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو\",\"createdByUserId\":1,\"createdAt\":\"2026-08-21T11:37:46.000Z\",\"updatedAt\":\"2026-08-21T11:37:46.000Z\"},{\"id\":11,\"employeeId\":4,\"date\":\"2026-08-16\",\"status\":\"present\",\"payableAmount\":\"400.000000000000000000\",\"currencyCode\":\"AFN\",\"notes\":\"پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو\",\"createdByUserId\":1,\"createdAt\":\"2026-08-21T11:37:46.000Z\",\"updatedAt\":\"2026-08-21T11:37:46.000Z\"},{\"id\":12,\"employeeId\":4,\"date\":\"2026-08-17\",\"status\":\"present\",\"payableAmount\":\"400.000000000000000000\",\"currencyCode\":\"AFN\",\"notes\":\"پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو\",\"createdByUserId\":1,\"createdAt\":\"2026-08-21T11:37:46.000Z\",\"updatedAt\":\"2026-08-21T11:37:46.000Z\"},{\"id\":13,\"employeeId\":4,\"date\":\"2026-08-18\",\"status\":\"present\",\"payableAmount\":\"400.000000000000000000\",\"currencyCode\":\"AFN\",\"notes\":\"پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو\",\"createdByUserId\":1,\"createdAt\":\"2026-08-21T11:37:46.000Z\",\"updatedAt\":\"2026-08-21T11:37:46.000Z\"},{\"id\":14,\"employeeId\":4,\"date\":\"2026-08-19\",\"status\":\"present\",\"payableAmount\":\"400.000000000000000000\",\"currencyCode\":\"AFN\",\"notes\":\"پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو\",\"createdByUserId\":1,\"createdAt\":\"2026-08-21T11:37:46.000Z\",\"updatedAt\":\"2026-08-21T11:37:46.000Z\"},{\"id\":15,\"employeeId\":4,\"date\":\"2026-08-20\",\"status\":\"present\",\"payableAmount\":\"400.000000000000000000\",\"currencyCode\":\"AFN\",\"notes\":\"پخوانی حساب د لومړۍ حاضرۍ پر وخت اضافه شو\",\"createdByUserId\":1,\"createdAt\":\"2026-08-21T11:37:46.000Z\",\"updatedAt\":\"2026-08-21T11:37:46.000Z\"},{\"id\":16,\"employeeId\":4,\"date\":\"2026-08-21\",\"status\":\"present\",\"payableAmount\":\"400.000000000000000000\",\"currencyCode\":\"AFN\",\"notes\":null,\"createdByUserId\":1,\"createdAt\":\"2026-08-21T11:37:46.000Z\",\"updatedAt\":\"2026-08-21T11:37:46.000Z\"}],\"payments\":[{\"id\":4,\"paymentNumber\":\"معاش-0004\",\"employeeId\":4,\"paymentDate\":\"2026-08-21\",\"type\":\"salary\",\"amount\":\"4000.000000000000000000\",\"previousBalance\":\"4400.000000000000000000\",\"newBalance\":\"400.000000000000000000\",\"currencyCode\":\"AFN\",\"method\":\"cash\",\"cashAccountId\":null,\"note\":null,\"paidByUserId\":1,\"voidedAt\":null,\"voidReason\":null,\"createdAt\":\"2026-08-21T11:38:00.000Z\",\"updatedAt\":\"2026-08-21T11:38:00.000Z\"}]}','ssdfds',1,'2026-08-21 11:38:23','2026-09-20 11:38:23',NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-21 11:38:23','2026-08-21 11:38:23'),(10,'Employee','5','احمد','/employees','{\"id\":5,\"employeeNumber\":\"کارکوونکی-0005\",\"name\":\"احمد\",\"fatherName\":\"محمود\",\"phone\":\"0708888888\",\"position\":\"متفرقه کاریګر\",\"wageType\":\"daily\",\"wageAmount\":\"200.000000000000000000\",\"currencyCode\":\"AFN\",\"startDate\":\"2026-08-11\",\"endDate\":null,\"status\":\"active\",\"workerType\":\"misc\",\"notes\":null,\"deletedAt\":null,\"deletedByUserId\":null,\"deleteReason\":null,\"createdByUserId\":1,\"createdAt\":\"2026-08-21T11:40:54.000Z\",\"updatedAt\":\"2026-08-21T11:40:54.000Z\",\"attendances\":[],\"payments\":[{\"id\":5,\"paymentNumber\":\"معاش-0005\",\"employeeId\":5,\"paymentDate\":\"2026-08-21\",\"type\":\"salary\",\"amount\":\"2000.000000000000000000\",\"previousBalance\":\"2200.000000000000000000\",\"newBalance\":\"200.000000000000000000\",\"currencyCode\":\"AFN\",\"method\":\"cash\",\"cashAccountId\":null,\"note\":\"رسیده احمد ته \",\"paidByUserId\":1,\"voidedAt\":null,\"voidReason\":null,\"createdAt\":\"2026-08-21T11:41:14.000Z\",\"updatedAt\":\"2026-08-21T11:41:14.000Z\"}]}','لابا',1,'2026-08-21 11:41:31','2026-09-20 11:41:31',NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-21 11:41:31','2026-08-21 11:41:31'),(11,'Party','3','احمد','/parties','{\"id\":3,\"type\":\"supplier\",\"name\":\"احمد\",\"companyName\":null,\"fatherName\":null,\"grandfatherName\":null,\"tazkiraNumber\":null,\"taxRegNumber\":null,\"phone1\":null,\"phone2\":null,\"address\":null,\"notes\":null,\"photoUrl\":null,\"isActive\":true,\"deletedAt\":null,\"deletedByUserId\":null,\"deleteReason\":null,\"createdAt\":\"2026-08-21T11:57:50.000Z\",\"updatedAt\":\"2026-08-21T11:57:50.000Z\",\"roles\":[{\"id\":3,\"partyId\":3,\"role\":\"supplier\"}]}','غلط یا اړتیا نه لرونکی مشتری',1,'2026-08-21 11:58:01','2026-09-20 11:58:01',NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-21 11:58:01','2026-08-21 11:58:01');
/*!40000 ALTER TABLE `trash_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `unit_types`
--

DROP TABLE IF EXISTS `unit_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `unit_types` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `unit_types`
--

LOCK TABLES `unit_types` WRITE;
/*!40000 ALTER TABLE `unit_types` DISABLE KEYS */;
INSERT INTO `unit_types` VALUES (1,'کور',1),(2,'دوکان',1),(3,'موټر تمځای',1),(4,'رستورانت',1),(5,'کلینیک',1),(6,'سوپر مارکېټ',1),(7,'مسجد',1),(8,'دفتر',1),(9,'ګدام',1),(10,'نور',1),(11,'نور تجارتي',1);
/*!40000 ALTER TABLE `unit_types` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `units`
--

DROP TABLE IF EXISTS `units`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `units` (
  `id` int NOT NULL AUTO_INCREMENT,
  `floorId` int NOT NULL,
  `unitTypeId` int NOT NULL,
  `unitNumber` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('draft','available','reserved','sold','rented','blocked','cancelled','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `purpose` enum('for_sale','for_rent','both','not_available') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'not_available',
  `roomCount` int DEFAULT NULL,
  `areaSqm` decimal(36,18) DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `units_floor_id_unit_number` (`floorId`,`unitNumber`),
  KEY `unitTypeId` (`unitTypeId`),
  CONSTRAINT `units_ibfk_1` FOREIGN KEY (`floorId`) REFERENCES `floors` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `units_ibfk_2` FOREIGN KEY (`unitTypeId`) REFERENCES `unit_types` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `units`
--

LOCK TABLES `units` WRITE;
/*!40000 ALTER TABLE `units` DISABLE KEYS */;
INSERT INTO `units` VALUES (1,1,1,'01','available','for_sale',4,NULL,NULL),(2,2,1,'01','sold','for_sale',4,NULL,NULL),(3,3,2,'01','sold','for_sale',NULL,NULL,NULL),(4,4,2,'01','rented','for_rent',NULL,NULL,NULL);
/*!40000 ALTER TABLE `units` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_delegations`
--

DROP TABLE IF EXISTS `user_delegations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_delegations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `delegatedUserId` int NOT NULL,
  `delegatedByUserId` int DEFAULT NULL,
  `delegatedRole` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'kafil',
  `startDate` date NOT NULL,
  `endDate` date NOT NULL,
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `delegatedByUserId` (`delegatedByUserId`),
  KEY `user_delegations_delegated_user_id` (`delegatedUserId`),
  KEY `user_delegations_is_active_start_date_end_date` (`isActive`,`startDate`,`endDate`),
  CONSTRAINT `user_delegations_ibfk_1` FOREIGN KEY (`delegatedUserId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `user_delegations_ibfk_2` FOREIGN KEY (`delegatedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_delegations`
--

LOCK TABLES `user_delegations` WRITE;
/*!40000 ALTER TABLE `user_delegations` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_delegations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_roles`
--

DROP TABLE IF EXISTS `user_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `roleId` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_roles_roleId_userId_unique` (`userId`,`roleId`),
  UNIQUE KEY `user_roles_user_id_role_id` (`userId`,`roleId`),
  KEY `roleId` (`roleId`),
  CONSTRAINT `user_roles_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `user_roles_ibfk_2` FOREIGN KEY (`roleId`) REFERENCES `roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_roles`
--

LOCK TABLES `user_roles` WRITE;
/*!40000 ALTER TABLE `user_roles` DISABLE KEYS */;
INSERT INTO `user_roles` VALUES (1,1,1);
/*!40000 ALTER TABLE `user_roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `fullName` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `passwordHash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `failedLoginAttempts` int NOT NULL DEFAULT '0',
  `lockedUntil` datetime DEFAULT NULL,
  `lastLoginAt` datetime DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'MD','د سیستم اداره کوونکی','$2b$10$gpmeTaPsOnWUg4C54ZUU8.KaBHvlmRqZw0cR9/w4J/u4OPhjOWidu',1,0,NULL,'2026-08-21 11:57:35','2026-08-13 21:58:43','2026-08-21 11:57:35');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'arabian_d'
--

--
-- Dumping routines for database 'arabian_d'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-21  5:24:57
