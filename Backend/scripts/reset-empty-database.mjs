import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDir, "..");
const envFile = path.join(backendRoot, ".env");

function readEnvFile(file) {
  const values = {};
  if (!fs.existsSync(file)) return values;
  const content = fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, "");
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    values[key.trim()] = rest.join("=").trim();
  }
  return values;
}

function envValue(env, key, fallback = "") {
  return process.env[key] || env[key] || fallback;
}

function escapeIdentifier(name) {
  return String(name).replaceAll("`", "``");
}

function escapeQuoted(name) {
  return String(name).replaceAll("'", "''");
}

function resolveMysqlBin(env) {
  const configured = envValue(env, "MYSQL_BIN").trim();
  if (configured) return configured;

  const candidates = [
    "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysql.exe",
    "C:\\Program Files\\MySQL\\MySQL Server 8.3\\bin\\mysql.exe",
    "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe",
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "mysql";
}

function mysqlArgs(env, includeDatabase) {
  const args = [
    "--batch",
    "--skip-column-names",
    "--default-character-set=utf8mb4",
    `--host=${envValue(env, "DB_HOST", "127.0.0.1")}`,
    `--port=${envValue(env, "DB_PORT", "3306")}`,
    `--user=${envValue(env, "DB_USER", "root")}`,
  ];
  if (includeDatabase) {
    args.push(envValue(env, "DB_NAME", "arabian_d"));
  }
  return args;
}

function readableMysqlError(error) {
  if (error?.code === "ENOENT") {
    return new Error("mysql command ونه موندل شو. MySQL Server نصب کړئ، یا MYSQL_BIN په Backend/.env کې mysql.exe ته برابر کړئ.");
  }
  return error instanceof Error ? error : new Error(String(error));
}

async function runMysql(env, sql, includeDatabase = true) {
  const child = spawn(resolveMysqlBin(env), mysqlArgs(env, includeDatabase), {
    env: { ...process.env, MYSQL_PWD: envValue(env, "DB_PASSWORD") },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  child.stdin.end(sql);

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", (error) => reject(readableMysqlError(error)));
    child.on("close", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`Database reset failed: ${stderr.trim() || `mysql exited with code ${exitCode}`}`);
  }
  return stdout.trim();
}

function normalizeCommand(value) {
  return String(value || "").toLowerCase().replaceAll("\\", "/");
}

function runPowerShell(command) {
  const result = spawnSync("powershell", ["-NoProfile", "-Command", command], {
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    return "";
  }

  return String(result.stdout || "").trim();
}

function findWindowsPortOwner(port) {
  const output = runPowerShell(`
$conn = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($conn.OwningProcess)"
  if ($proc) {
    [pscustomobject]@{
      ProcessId = $proc.ProcessId
      Name = $proc.Name
      CommandLine = $proc.CommandLine
    } | ConvertTo-Json -Compress
  }
}
`);

  if (!output) {
    return null;
  }

  try {
    const parsed = JSON.parse(output);
    return {
      pid: Number(parsed.ProcessId),
      name: parsed.Name || "",
      commandLine: parsed.CommandLine || "",
    };
  } catch {
    return null;
  }
}

function findUnixPortOwner(port) {
  const pidResult = spawnSync(
    "sh",
    ["-lc", `lsof -nP -iTCP:${port} -sTCP:LISTEN -t 2>/dev/null | head -n 1`],
    { encoding: "utf8" },
  );
  const pid = Number(String(pidResult.stdout || "").trim());
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }

  const commandResult = spawnSync("ps", ["-p", String(pid), "-o", "command="], {
    encoding: "utf8",
  });
  return {
    pid,
    name: "",
    commandLine: String(commandResult.stdout || "").trim(),
  };
}

function findPortOwner(port) {
  return process.platform === "win32" ? findWindowsPortOwner(port) : findUnixPortOwner(port);
}

function isManagedBackendProcess(owner) {
  const command = normalizeCommand(owner?.commandLine);
  const projectRoot = normalizeCommand(backendRoot);

  return (
    command.includes("node") &&
    command.includes("dist/index.mjs") &&
    (command.includes("--env-file=../.env") ||
      command.includes(projectRoot) ||
      command.includes("api-server"))
  );
}

function stopOwner(owner) {
  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell",
      ["-NoProfile", "-Command", `Stop-Process -Id ${owner.pid} -Force`],
      { stdio: "inherit" },
    );
    return !result.error && result.status === 0;
  }

  try {
    process.kill(owner.pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

async function waitForPortFree(port, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!findPortOwner(port)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return !findPortOwner(port);
}

async function stopRunningBackend(port) {
  const owner = findPortOwner(port);
  if (!owner) {
    return;
  }

  if (!isManagedBackendProcess(owner)) {
    console.warn(`Port ${port} is in use by PID ${owner.pid}, but it does not look like this project's backend.`);
    console.warn("Continuing without stopping it. Close it if the database wipe hangs.");
    return;
  }

  console.log(`Backend is running (PID ${owner.pid}); stopping it first so the wipe cannot be blocked.`);
  if (!stopOwner(owner) || !(await waitForPortFree(port))) {
    throw new Error(`Could not stop the running backend (PID ${owner.pid}). Close it and run reset:empty again.`);
  }
  console.log("Backend stopped.");
}

if (!process.argv.includes("--yes")) {
  console.error("This command deletes every table in the configured database.");
  console.error("Use: npm run reset:empty");
  process.exit(1);
}

const fileEnv = readEnvFile(envFile);
const dialect = envValue(fileEnv, "DB_DIALECT", "mysql");
if (dialect !== "mysql") {
  throw new Error("reset:empty یوازې د MySQL لپاره دی. DB_DIALECT باید mysql وي.");
}

const database = envValue(fileEnv, "DB_NAME", "arabian_d");
const port = Number(envValue(fileEnv, "PORT", "17879"));

try {
  await stopRunningBackend(port);

  console.log(`Wiping database '${database}' completely...`);
  await runMysql(fileEnv, `DROP DATABASE IF EXISTS \`${escapeIdentifier(database)}\`;`, false);
  await runMysql(fileEnv, `CREATE DATABASE \`${escapeIdentifier(database)}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, false);
  console.log(`Database '${database}' was dropped and recreated empty.`);
} catch (error) {
  console.warn(`Full database wipe did not work (${error instanceof Error ? error.message : error}).`);
  console.warn("Falling back to dropping every table one by one...");

  const resetSql = `
SET FOREIGN_KEY_CHECKS = 0;
SET GROUP_CONCAT_MAX_LEN = 1048576;
SELECT CONCAT('DROP TABLE IF EXISTS ', GROUP_CONCAT(CONCAT('\`', REPLACE(TABLE_NAME, '\`', '\`\`'), '\`') SEPARATOR ', '))
  INTO @drop_sql
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_TYPE = 'BASE TABLE';
SET @drop_sql = IF(@drop_sql IS NULL OR @drop_sql = '', 'DO 0', @drop_sql);
PREPARE drop_stmt FROM @drop_sql;
EXECUTE drop_stmt;
DEALLOCATE PREPARE drop_stmt;
SET FOREIGN_KEY_CHECKS = 1;
`;

  try {
    await runMysql(fileEnv, resetSql, true);
  } catch (fallbackError) {
    try {
      await runMysql(fileEnv, "SET FOREIGN_KEY_CHECKS = 1;", true);
    } catch {
      // Ignore cleanup errors after a failed reset.
    }
    console.error(fallbackError instanceof Error ? fallbackError.message : fallbackError);
    process.exit(1);
  }
  console.log("All tables were dropped.");
}

const remainingTables = await runMysql(
  fileEnv,
  `SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${escapeQuoted(database)}' AND TABLE_TYPE = 'BASE TABLE';`,
  false,
);

console.log(`Database '${database}' is now empty. Remaining tables: ${remainingTables || "0"}.`);
console.log("Start the backend again; it will recreate the clean schema and first admin user.");
