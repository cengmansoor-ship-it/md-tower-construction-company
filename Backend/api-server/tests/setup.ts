import path from "node:path";
import fs from "node:fs";
import { beforeAll, afterAll } from "vitest";

const TEST_DB_PATH = path.join(process.cwd(), "data", `test-${process.pid}.sqlite`);

// Set a test-specific SESSION_SECRET so JWT signing works during tests.
if (!process.env["SESSION_SECRET"]) {
  process.env["SESSION_SECRET"] = "test-session-secret-for-vitest";
}

// Point the shared Sequelize connection at a dedicated test database file
// BEFORE any module imports `@workspace/db-sequelize`, so the singleton
// connection created at import time uses it instead of the dev database.
process.env["SQLITE_STORAGE"] = TEST_DB_PATH;
process.env["DB_DIALECT"] = "sqlite";
process.env["NODE_ENV"] = process.env["NODE_ENV"] ?? "test";

beforeAll(async () => {
  fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
  fs.rmSync(TEST_DB_PATH, { force: true });
  const { ensureDatabaseReady } = await import("@workspace/db-sequelize");
  await ensureDatabaseReady();
});

afterAll(async () => {
  const { sequelize } = await import("@workspace/db-sequelize");
  await sequelize.close();
  fs.rmSync(TEST_DB_PATH, { force: true });
});

export { TEST_DB_PATH };
