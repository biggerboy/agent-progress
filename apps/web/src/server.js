import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loopbackHost } from "../../../packages/normalize/home.js";
import { loadBoard, resolveSources } from "./board.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(here, "../public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

/**
 * @param {{ argv?: string[], env?: NodeJS.ProcessEnv }} [opts]
 */
export async function createApp({ argv = process.argv.slice(2), env = process.env } = {}) {
  const sources = await resolveSources({ argv, env });
  /** @type {Set<http.ServerResponse>} */
  const sseClients = new Set();
  let debounce = null;
  let lastPayload = await loadBoard(sources);

  const refresh = async () => {
    try {
      lastPayload = await loadBoard(sources);
      const frame = `data: ${JSON.stringify({ type: "update", generatedAt: lastPayload.generatedAt })}\n\n`;
      for (const res of sseClients) {
        try {
          res.write(frame);
        } catch {
          sseClients.delete(res);
        }
      }
    } catch (err) {
      console.error("[board] refresh failed:", err);
    }
  };

  const watchers = [];
  for (const dir of sources.watchDirs) {
    try {
      const watcher = fs.watch(dir, { recursive: true }, () => {
        clearTimeout(debounce);
        debounce = setTimeout(refresh, 200);
      });
      watcher.on("error", () => {});
      watchers.push(watcher);
    } catch {
      // Directory may vanish; client polling still works.
    }
  }

  const pollMs = Number(env.AGENT_PROGRESS_POLL_MS || 4000);
  const pollTimer = setInterval(refresh, Number.isFinite(pollMs) ? Math.max(pollMs, 1000) : 4000);
  pollTimer.unref?.();

  const server = http.createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      console.error(err);
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("internal error");
    }
  });

  async function handle(req, res) {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/api/board") {
      json(res, lastPayload);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      json(res, {
        ok: true,
        bind: "127.0.0.1",
        readonly: true,
        generatedAt: lastPayload.generatedAt,
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/stream") {
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify({ type: "hello", generatedAt: lastPayload.generatedAt })}\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      await sendFile(res, path.join(PUBLIC_DIR, "index.html"));
      return;
    }
    if (req.method === "GET") {
      const safe = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
      const filePath = path.join(PUBLIC_DIR, safe);
      if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      await sendFile(res, filePath);
      return;
    }
    res.writeHead(405).end("method not allowed");
  }

  function close() {
    clearInterval(pollTimer);
    for (const watcher of watchers) watcher.close();
    for (const res of sseClients) {
      try {
        res.end();
      } catch {
        /* ignore */
      }
    }
    sseClients.clear();
    server.close();
  }

  return { server, sources, refresh, close, getBoard: () => lastPayload };
}

function json(res, body) {
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

async function sendFile(res, filePath) {
  try {
    const data = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  }
}

async function main() {
  const { host, forced, requested } = loopbackHost(process.env.AGENT_PROGRESS_HOST);
  const port = Number(process.env.AGENT_PROGRESS_PORT || process.env.PORT || 4173);
  const app = await createApp();
  if (forced) {
    console.warn(`[agent-progress] refusing to bind ${requested}; using 127.0.0.1`);
  }
  app.server.listen(port, host, () => {
    const meta = app.sources.meta;
    console.log(`干到哪了 / Agent Progress Board`);
    console.log(`  http://${host}:${port}/`);
    console.log(`  bind     ${host}:${port} (loopback only, read-only)`);
    console.log(`  claude   ${meta.claudeRoot}  [${meta.claudeMode}]`);
    console.log(`  cursor   ${meta.cursorDirs.join(", ") || "(none)"}`);
    console.log(`  codex    ${meta.codexRoot}  [${meta.codexMode}] (session meta only)`);
    if (meta.claudeMode === "fixtures") {
      console.log(`  hint     ~/.claude/tasks not found — serving fixtures. Pass --fixtures to force.`);
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
