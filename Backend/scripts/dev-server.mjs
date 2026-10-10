import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDir, "..");
const apiServerDir = path.join(backendRoot, "api-server");
const envPath = path.join(backendRoot, ".env");

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce((values, rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        return values;
      }

      const equalIndex = line.indexOf("=");
      if (equalIndex === -1) {
        return values;
      }

      const key = line.slice(0, equalIndex).trim();
      let value = line.slice(equalIndex + 1).trim();
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      values[key] = value;
      return values;
    }, {});
}

const envValues = readEnvFile(envPath);
const port = Number(process.env.PORT || envValues.PORT || 17879);

if (!Number.isInteger(port) || port <= 0) {
  console.error(`Invalid PORT value: ${process.env.PORT || envValues.PORT}`);
  process.exit(1);
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

function findWindowsPortOwner() {
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

function findUnixPortOwner() {
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

function findPortOwner() {
  return process.platform === "win32" ? findWindowsPortOwner() : findUnixPortOwner();
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

async function waitForPortFree(timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!findPortOwner()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return !findPortOwner();
}

async function ensurePortFree() {
  const owner = findPortOwner();
  if (!owner) {
    return;
  }

  if (!isManagedBackendProcess(owner)) {
    console.error(`Port ${port} is already in use by PID ${owner.pid}.`);
    console.error(`Command: ${owner.commandLine || owner.name || "unknown"}`);
    console.error("Close that program or change PORT in Backend/.env.");
    process.exit(1);
  }

  console.log(`Port ${port} had an old backend process (PID ${owner.pid}); stopping it first.`);
  if (!stopOwner(owner) || !(await waitForPortFree())) {
    console.error(`Could not free port ${port}. Please close PID ${owner.pid} and try again.`);
    process.exit(1);
  }
}

await ensurePortFree();

const child = spawn(
  process.execPath,
  ["--env-file=../.env", "--enable-source-maps", "./dist/index.mjs"],
  {
    cwd: apiServerDir,
    env: process.env,
    stdio: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}

child.on("error", (error) => {
  console.error(`Could not start backend dev server: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(0);
  }
  process.exit(code ?? 0);
});
