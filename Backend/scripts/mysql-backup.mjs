import { createWriteStream, existsSync } from "node:fs";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const backupDir = path.join(rootDir, "Backup");
const latestFile = path.join(backupDir, "latest.sql");

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function mysqlDumpArgs() {
  const database = process.env.DB_NAME || "arabian_d";
  return [
    "--single-transaction",
    "--routines",
    "--triggers",
    "--events",
    "--hex-blob",
    "--default-character-set=utf8mb4",
    `--host=${process.env.DB_HOST || "localhost"}`,
    `--port=${process.env.DB_PORT || "3306"}`,
    `--user=${process.env.DB_USER || "root"}`,
    "--databases",
    database,
  ];
}

function resolveMysqlDumpBin() {
  if (process.env.MYSQLDUMP_BIN?.trim()) return process.env.MYSQLDUMP_BIN.trim();
  const candidates = [
    "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe",
    "C:\\Program Files\\MySQL\\MySQL Server 8.3\\bin\\mysqldump.exe",
    "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe",
  ];
  return candidates.find((candidate) => existsSync(candidate)) || "mysqldump";
}

function readableBackupError(error) {
  if (error?.code === "EPERM" || error?.code === "EACCES") {
    const target = error.path ? ` (${error.path})` : "";
    return new Error(`د Backup فولډر ته د بیکپ فایل لیکلو اجازه نشته${target}. د پروژې فولډر داسې ځای ته یوسئ چې د لیکلو اجازه ولري، یا د Backup فولډر Read-only/لاک حالت بند کړئ.`);
  }
  if (error?.code === "ENOENT") {
    return new Error("د MySQL د بیکپ وسیله ونه موندل شوه. MySQL Server نصب کړئ یا MYSQLDUMP_BIN په Backend/.env کې سم مسیر ته برابر کړئ.");
  }
  return error instanceof Error ? error : new Error(String(error));
}

async function runMysqlDumpToFile(file) {
  const output = createWriteStream(file, { encoding: "utf8" });
  const child = spawn(resolveMysqlDumpBin(), mysqlDumpArgs(), {
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || "" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  let childClosed = false;
  let outputFinished = false;
  let settled = false;

  await new Promise((resolve, reject) => {
    const fail = (error) => {
      if (settled) return;
      settled = true;
      if (!child.killed) child.kill();
      output.destroy();
      reject(readableBackupError(error));
    };

    const maybeDone = () => {
      if (!settled && childClosed && outputFinished) {
        settled = true;
        resolve();
      }
    };

    output.on("error", fail);
    child.on("error", fail);
    child.stdout.on("error", fail);
    child.stderr.on("error", fail);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("close", (exitCode) => {
      childClosed = true;
      if (exitCode !== 0) {
        fail(new Error(`د MySQL بیکپ جوړ نه شو: ${stderr.trim() || `mysqldump کوډ ${exitCode}`}`));
        return;
      }
      maybeDone();
    });

    output.on("finish", () => {
      outputFinished = true;
      maybeDone();
    });

    child.stdout.pipe(output);
  });
}

function normalizeMysqlDumpForPortableMysql(sql) {
  return sql
    .replace(/utf8mb4_0900_[a-z0-9_]+/gi, "utf8mb4_unicode_ci")
    .replace(/\s*\/\*!80016\s+DEFAULT\s+ENCRYPTION='N'\s*\*\//gi, "");
}

async function makeDumpPortable(file) {
  const original = await readFile(file, "utf8");
  const normalized = normalizeMysqlDumpForPortableMysql(original);
  if (normalized !== original) {
    await writeFile(file, normalized, "utf8");
  }
}

async function runBackup() {
  await mkdir(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `arabian-d-${timestamp()}.sql`);
  await runMysqlDumpToFile(backupFile);
  await makeDumpPortable(backupFile);
  await copyFile(backupFile, latestFile);
  const size = (await stat(backupFile)).size;
  console.log(`Backup written: ${backupFile}`);
  console.log(`Latest backup refreshed: ${latestFile}`);
  console.log(`Bytes: ${size}`);
}

async function main() {
  await runBackup();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
