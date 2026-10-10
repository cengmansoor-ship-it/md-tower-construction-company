import { createReadStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptsDir, "..", "..");
const backendDir = path.join(rootDir, "Backend");
const backupDir = path.join(rootDir, "Backup");

function loadEnvFile() {
  const envFile = path.join(backendDir, ".env");
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = rest.join("=");
  }
}

function mysqlArgs() {
  return [
    `--host=${process.env.DB_HOST || "localhost"}`,
    `--port=${process.env.DB_PORT || "3306"}`,
    `--user=${process.env.DB_USER || "root"}`,
  ];
}

async function restoreMysql() {
  const latest = path.join(backupDir, "latest.sql");
  if (!existsSync(latest)) throw new Error(`Backup not found: ${latest}`);
  const child = spawn(process.env.MYSQL_BIN || "mysql", mysqlArgs(), {
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || "" },
    stdio: ["pipe", "inherit", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  createReadStream(latest, { encoding: "utf8" }).pipe(child.stdin);
  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (exitCode !== 0) throw new Error(`mysql import failed with code ${exitCode}: ${stderr.trim()}`);
  console.log(`وروستی MySQL بیکپ راوګرځېد: ${latest}`);
}

async function main() {
  loadEnvFile();
  await restoreMysql();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
