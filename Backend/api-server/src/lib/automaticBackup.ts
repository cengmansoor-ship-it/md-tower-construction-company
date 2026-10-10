import { createWriteStream, existsSync, type WriteStream } from "node:fs";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { sequelize } from "@workspace/db-sequelize";
import { logger } from "./logger";

export interface BackupResult {
  file: string;
  latest: string;
  bytes: number;
  createdAt: string;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function portableRoot(): string {
  const cwd = process.cwd();
  if (path.basename(cwd).toLowerCase() === "api-server") return path.resolve(cwd, "..", "..");
  if (path.basename(cwd).toLowerCase() === "backend") return path.resolve(cwd, "..");
  return path.resolve(cwd);
}

function backupDirectory(): string {
  return path.join(portableRoot(), "Backup");
}

function resolveMysqlDumpBin(): string {
  const configured = process.env["MYSQLDUMP_BIN"]?.trim();
  if (configured) return configured;
  const candidates = [
    "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe",
    "C:\\Program Files\\MySQL\\MySQL Server 8.3\\bin\\mysqldump.exe",
    "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe",
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? "mysqldump";
}

function mysqlDumpArgs(): string[] {
  return [
    "--single-transaction",
    "--routines",
    "--triggers",
    "--events",
    "--hex-blob",
    "--default-character-set=utf8mb4",
    `--host=${process.env["DB_HOST"] || "localhost"}`,
    `--port=${process.env["DB_PORT"] || "3306"}`,
    `--user=${process.env["DB_USER"] || "root"}`,
    "--databases",
    process.env["DB_NAME"] || "arabian_d",
  ];
}

function readableBackupError(error: unknown): Error {
  const err = error as NodeJS.ErrnoException;
  if (err?.code === "EPERM" || err?.code === "EACCES") {
    const target = err.path ? ` (${err.path})` : "";
    return new Error(`د Backup فولډر ته د بیکپ فایل لیکلو اجازه نشته${target}. د پروژې فولډر داسې ځای ته یوسئ چې د لیکلو اجازه ولري، یا د Backup فولډر Read-only/لاک حالت بند کړئ.`);
  }
  if (err?.code === "ENOENT") {
    return new Error("د MySQL د بیکپ وسیله ونه موندل شوه. MySQL Server نصب کړئ یا MYSQLDUMP_BIN په Backend/.env کې سم مسیر ته برابر کړئ.");
  }
  return error instanceof Error ? error : new Error(String(error));
}

type MysqlDumpProcess = ChildProcessByStdio<null, Readable, Readable>;

function stopDump(child: MysqlDumpProcess, output: WriteStream): void {
  if (!child.killed) child.kill();
  output.destroy();
}

async function runMysqlDumpToFile(file: string): Promise<void> {
  const output = createWriteStream(file, { encoding: "utf8" });
  const child = spawn(resolveMysqlDumpBin(), mysqlDumpArgs(), {
    env: { ...process.env, MYSQL_PWD: process.env["DB_PASSWORD"] || "" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  let childClosed = false;
  let outputFinished = false;
  let settled = false;

  await new Promise<void>((resolve, reject) => {
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      stopDump(child, output);
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

function normalizeMysqlDumpForPortableMysql(sql: string): string {
  return sql
    .replace(/utf8mb4_0900_[a-z0-9_]+/gi, "utf8mb4_unicode_ci")
    .replace(/\s*\/\*!80016\s+DEFAULT\s+ENCRYPTION='N'\s*\*\//gi, "");
}

async function makeDumpPortable(file: string): Promise<void> {
  const original = await readFile(file, "utf8");
  const normalized = normalizeMysqlDumpForPortableMysql(original);
  if (normalized !== original) {
    await writeFile(file, normalized, "utf8");
  }
}

async function backupMysql(dir: string): Promise<BackupResult> {
  if (sequelize.getDialect() !== "mysql") {
    throw new Error("اصلي بیکپ یوازې د MySQL لپاره جوړېږي. DB_DIALECT باید mysql وي.");
  }
  const createdAt = new Date().toISOString();
  const file = path.join(dir, `arabian-d-${timestamp()}.sql`);
  const latest = path.join(dir, "latest.sql");
  await runMysqlDumpToFile(file);
  await makeDumpPortable(file);
  await copyFile(file, latest);
  const bytes = (await stat(file)).size;
  logger.info({ file, bytes }, "manual MySQL backup completed");
  return { file, latest, bytes, createdAt };
}

export async function runManualMysqlBackup(): Promise<BackupResult> {
  const dir = backupDirectory();
  await mkdir(dir, { recursive: true });
  return backupMysql(dir);
}

export function latestMysqlBackupPath(): string {
  return path.join(backupDirectory(), "latest.sql");
}
