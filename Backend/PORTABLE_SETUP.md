# د انتقال ساده لاره

دا نسخه يوازې MySQL Server، Node.js، Backend او Frontend کاروي.

## په بل کمپيوټر کې

1. Node.js نصب کړه.
2. MySQL Server نصب او چالان کړه.
3. پروژه extract کړه.
4. د MySQL command prompt يا عادي command prompt کې ډيټابېس جوړ کړه:

```powershell
mysql -u root -p < DB\mysql-create-database.sql
```

5. د اصلي ډيټا فایل import کړه:

```powershell
mysql -u root -p arabian_d < Backup\latest.sql
```

که ستا MySQL پټنوم نه لري، `-p` مه کاروه:

```powershell
mysql -u root arabian_d < Backup\latest.sql
```

6. `DB/mysql-create-database.sql` د سیستم لپاره `arabian_d_user` جوړوي؛ `Backend/.env` مخکې له مخکې همدې کارن ته برابر دی.
7. د `Backend` فولډر کې:

```powershell
npm run dev
```

8. د `Frontend` فولډر کې:

```powershell
npm run dev
```

9. Frontend چې کوم لينک درکړي، لکه `http://localhost:5000` يا `http://localhost:5001`، هماغه خلاص کړه.

## مهم ټکي

- د وېب سرور جلا پروګرام ته اړتيا نشته.
- د ډيټابېس import د `mysql` command له لارې کېږي.
- `DB_PORT` عادي MySQL لپاره `3306` دی.
- د کار پر وخت دواړه command prompt کړکۍ خلاصې پرېږده.
