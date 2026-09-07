import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadBoard, resolveSources } from "./board.js";

describe("resolveSources", () => {
  it("reads a real Claude tasks dir when it exists", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "apb-claude-"));
    const listDir = path.join(tmp, "tasks", "live");
    await fs.mkdir(listDir, { recursive: true });
    await fs.writeFile(
      path.join(listDir, "9.json"),
      JSON.stringify({
        id: "9",
        subject: "real task",
        status: "in_progress",
        blocks: [],
        blockedBy: [],
      }),
    );
    const sources = await resolveSources({
      argv: [],
      env: { ...process.env, CLAUDE_CONFIG_DIR: tmp, AGENT_PROGRESS_USE_FIXTURES: "" },
    });
    assert.equal(sources.usingFixtures, false);
    assert.equal(sources.claudeRoot, path.join(tmp, "tasks"));
    const board = await loadBoard(sources);
    assert.equal(board.items.some((i) => i.title === "real task"), true);
    assert.equal(board.meta.claudeMode, "real");
  });

  it("degrades when Cursor plan dirs are absent", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "apb-empty-"));
    await fs.mkdir(path.join(tmp, "tasks"), { recursive: true });
    const sources = await resolveSources({
      argv: [],
      env: {
        ...process.env,
        CLAUDE_CONFIG_DIR: tmp,
        AGENT_PROGRESS_USE_FIXTURES: "",
        CURSOR_HOME: path.join(tmp, "no-cursor"),
        AGENT_PROGRESS_WORKSPACE: path.join(tmp, "no-ws"),
        CODEX_HOME: path.join(tmp, "no-codex"),
      },
    });
    const board = await loadBoard(sources);
    assert.equal(board.meta.claudeMode, "real");
    assert.equal(board.items.filter((i) => i.source.tool === "cursor").length, 0);
    assert.equal(board.sessions.length, 0);
  });
});
