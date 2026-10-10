import app from "./app";
import { logger } from "./lib/logger";
import { ensureDatabaseReady, requireJwtSecret } from "@workspace/db-sequelize";

requireJwtSecret();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

try {
  await ensureDatabaseReady();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error({ message }, "Database startup failed");
  console.error("");
  console.error("شا برخه چالانه نه شوه.");
  console.error(`علت: ${message}`);
  console.error("MySQL Server چالان کړه، بيا DB/mysql-create-database.sql د root له لارې وچلوه.");
  console.error("وروسته Backend/.env کې DB_HOST، DB_PORT، DB_NAME، DB_USER او DB_PASSWORD وګوره.");
  console.error("");
  process.exit(1);
}
logger.info("Database ready");
console.log("Database connected successfully.");

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  console.log(`Backend server is running: http://localhost:${port}`);
});
