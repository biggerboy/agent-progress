import assert from "node:assert/strict";
import http from "node:http";
import { describe, it, after } from "node:test";
import { createApp } from "./server.js";
import { loadBoard, resolveSources } from "./board.js";

describe("fixtures board", () => {
  it("exposes four Claude statuses and keeps Codex off the task board", async () => {
    const sources = await resolveSources({
      argv: ["--fixtures"],
      env: { ...process.env, AGENT_PROGRESS_USE_FIXTURES: "1" },
    });
    const board = await loadBoard(sources);
    const claude = board.items.filter((i) => i.source.tool === "claude");
    const cursor = board.items.filter((i) => i.source.tool === "cursor");
    const statuses = new Set(claude.map((i) => i.status));
    assert.deepEqual([...statuses].sort(), ["blocked", "completed", "in_progress", "pending"]);
    assert.ok(cursor.length >= 1);
    assert.equal(board.items.some((i) => i.source.tool === "codex"), false);
    assert.ok(board.sessions.length >= 1);
    assert.equal(board.meta.claudeMode, "fixtures");
  });
});

describe("http server", () => {
  it("binds handlers for board JSON and the page", async () => {
    const app = await createApp({ argv: ["--fixtures"] });
    after(() => app.close());
    await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const { port } = app.server.address();
    const board = await getJson(`http://127.0.0.1:${port}/api/board`);
    assert.ok(Array.isArray(board.items));
    const page = await getText(`http://127.0.0.1:${port}/`);
    assert.match(page, /干到哪了/);
    const health = await getJson(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.bind, "127.0.0.1");
    assert.equal(health.readonly, true);
  });
});

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (err) {
          reject(err);
        }
      });
    }).on("error", reject);
  });
}

function getText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    }).on("error", reject);
  });
}
