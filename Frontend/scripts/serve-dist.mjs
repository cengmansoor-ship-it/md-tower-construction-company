import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, "..");
const projectRoot = path.resolve(frontendRoot, "..");
const distDir = path.join(frontendRoot, "dist");
const backendEnvFile = path.join(projectRoot, "Backend", ".env");
const frontendEnvFile = path.join(frontendRoot, ".env");

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

const backendEnv = readEnvFile(backendEnvFile);
const frontendEnv = readEnvFile(frontendEnvFile);
const backendPort = process.env.API_PORT || backendEnv.PORT || "17879";
const backendHost = process.env.API_HOST || "127.0.0.1";
const backendBase = `http://${backendHost}:${backendPort}`;

const preferredPort = Number(process.env.PORT || frontendEnv.PORT || "5000");
const noCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
  "Surrogate-Control": "no-store",
  "Clear-Site-Data": "\"cache\"",
};
const welcomeBadgeCss = `
.welcome-copy > span,
.welcome-kicker {
  display: none !important;
  visibility: hidden !important;
  position: absolute !important;
  width: 0 !important;
  height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  pointer-events: none !important;
}
`;
const welcomeBadgeCleanupScript = `
;(() => {
  const cleanWelcomeBadges = () => {
    if (!location.pathname.includes("/welcome")) return;
    document.querySelectorAll(".welcome-copy > span, .welcome-kicker").forEach((element) => element.remove());
  };
  cleanWelcomeBadges();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cleanWelcomeBadges);
  }
  new MutationObserver(cleanWelcomeBadges).observe(document.documentElement, { childList: true, subtree: true });
})();
`;
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function safeDistPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] || "/");
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(distDir, normalized);
  if (!filePath.startsWith(distDir)) return null;
  return filePath;
}

function serveStatic(req, res) {
  let filePath = safeDistPath(req.url || "/");
  if (!filePath) return send(res, 403, "Forbidden");
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  if (!fs.existsSync(filePath)) {
    filePath = path.join(distDir, "index.html");
  }
  if (!fs.existsSync(filePath)) {
    return send(res, 500, "Frontend/dist/index.html was not found.");
  }

  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    ...noCacheHeaders,
  };

  if (ext === ".html" || ext === ".css" || ext === ".js") {
    let body = fs.readFileSync(filePath, "utf8");
    if (ext === ".html") {
      body = body.replace("</head>", `<style>${welcomeBadgeCss}</style></head>`);
      body = body.replace("</body>", `<script>${welcomeBadgeCleanupScript}</script></body>`);
    } else if (ext === ".css") {
      body = `${body}\n${welcomeBadgeCss}`;
    } else if (ext === ".js") {
      body = `${body}\n${welcomeBadgeCleanupScript}`;
    }
    return send(res, 200, body, headers);
  }

  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

function proxyToBackend(req, res) {
  const target = new URL(req.url || "/", backendBase);
  const headers = { ...req.headers, host: `${backendHost}:${backendPort}` };
  const proxyReq = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", () => {
    send(
      res,
      502,
      JSON.stringify({
        error: "Backend is not running. First open Backend folder and run: npm run dev",
        backend: backendBase,
      }),
      { "Content-Type": "application/json; charset=utf-8" },
    );
  });

  req.pipe(proxyReq);
}

function createServer() {
  return http.createServer((req, res) => {
    const url = req.url || "/";
    if (url.startsWith("/api") || url.startsWith("/uploads")) {
      proxyToBackend(req, res);
      return;
    }
    serveStatic(req, res);
  });
}

async function listenWithFallback(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    const server = createServer();
    const result = await new Promise((resolve) => {
      server.once("error", (err) => resolve({ ok: false, err }));
      server.listen(port, "0.0.0.0", () => resolve({ ok: true, server, port }));
    });
    if (result.ok) return result;
    if (result.err?.code !== "EADDRINUSE") throw result.err;
  }
  throw new Error(`No free port found from ${startPort} to ${startPort + 19}.`);
}

const result = await listenWithFallback(Number.isFinite(preferredPort) ? preferredPort : 5000);
console.log("");
console.log("Frontend is running.");
console.log(`Open: http://localhost:${result.port}/login`);
console.log(`Backend expected at: ${backendBase}`);
console.log("Keep this window open while using the system.");
console.log("");
