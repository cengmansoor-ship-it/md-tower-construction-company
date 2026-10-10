# Backend

دا شا برخه د Node.js + Express.js له لارې چلېږي او اصلي ډيټابېس يې MySQL دی.

## چالانول

1. MySQL Server چالان وي.
2. `arabian_d` ډيټابېس جوړ او `Backup/latest.sql` import شوی وي.
3. په دې فولډر کې command prompt خلاص کړه:

```powershell
cd Backend
npm run dev
```

که ډيټابېس سم وصل شي، شا برخه به د `Database ready` او `Server listening` پیغام ورکړي.

شا برخه په دې پته چلېږي:

```text
http://localhost:17879/api/healthz
```

## د ډيټابېس معلومات

فعال `.env` بايد عموما داسې وي:

```env
DB_DIALECT=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=arabian_d
DB_USER=arabian_d_user
DB_PASSWORD=ArabianD@12345
PORT=17879
```

دا کارن د `DB/mysql-create-database.sql` له لارې جوړېږي. root یوازې د ډيټابېس جوړولو او import لپاره کاروه.
