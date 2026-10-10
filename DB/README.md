# DB

اصلي ډيټابېس يوازې MySQL دی.

د ډيټابېس نوم:

```text
arabian_d
```

charset/collation:

```text
utf8mb4 / utf8mb4_unicode_ci
```

## جوړول او import

د پروژې له اصلي فولډر څخه:

```powershell
mysql -u root -p < DB\mysql-create-database.sql
mysql -u root -p arabian_d < Backup\latest.sql
```

که MySQL پټنوم نه لري:

```powershell
mysql -u root < DB\mysql-create-database.sql
mysql -u root arabian_d < Backup\latest.sql
```

دا SQL فایل د سیستم لپاره دا MySQL کارن هم جوړوي:

```text
arabian_d_user
```

پټنوم:

```text
ArabianD@12345
```
