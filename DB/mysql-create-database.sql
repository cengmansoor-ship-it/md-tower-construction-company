-- که د ډيټابیس نوم بدلول غواړئ، په دې فایل کې `arabian_d` د خپل نوم سره بدل کړئ.
-- بیا په Backend/.env کې هم DB_NAME هماغه نوم وټاکئ.
-- Backup/latest.sql د ډيټابیس نوم نه لري؛ نو د import کمانډ په پای کې هر جوړ شوی ډيټابیس نوم کارولای شئ.

CREATE DATABASE IF NOT EXISTS arabian_d
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'arabian_d_user'@'localhost' IDENTIFIED BY 'ArabianD@12345';
CREATE USER IF NOT EXISTS 'arabian_d_user'@'127.0.0.1' IDENTIFIED BY 'ArabianD@12345';

GRANT ALL PRIVILEGES ON arabian_d.* TO 'arabian_d_user'@'localhost';
GRANT ALL PRIVILEGES ON arabian_d.* TO 'arabian_d_user'@'127.0.0.1';
FLUSH PRIVILEGES;

USE arabian_d;
