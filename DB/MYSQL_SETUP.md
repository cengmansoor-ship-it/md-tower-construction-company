# MySQL Setup

دا پروژه مستقیم MySQL Server کاروي. ډيټابېس بايد په MySQL command کې جوړ او import شي.

## د پټنوم لرونکي MySQL لپاره

```powershell
mysql -u root -p < DB\mysql-create-database.sql
mysql -u root -p arabian_d < Backup\latest.sql
```

## که MySQL پټنوم نه لري

```powershell
mysql -u root < DB\mysql-create-database.sql
mysql -u root arabian_d < Backup\latest.sql
```

## Backend `.env`

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=arabian_d
DB_USER=arabian_d_user
DB_PASSWORD=ArabianD@12345
```

دا کارن د `DB/mysql-create-database.sql` له لارې جوړېږي. root یوازې د ډيټابېس جوړولو او import لپاره کاروه.
