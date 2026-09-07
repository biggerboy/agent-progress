import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { loadCodexSessions } from "./index.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/codex/sessions",
);

describe("loadCodexSessions", () => {
  it("lists cwd metadata and never invents board statuses", async () => {
    const { sessions, present } = await loadCodexSessions(root);
    assert.equal(present, true);
    assert.ok(sessions.length >= 2);
    const jsonl = sessions.find((s) => s.id.includes("abc123"));
    const meta = sessions.find((s) => s.id === "sess_old");
    assert.equal(jsonl.cwd, "/tmp/demo-repo");
    assert.equal(meta.cwd, "/home/demo/other-project");
    for (const session of sessions) {
      assert.equal("status" in session, false);
    }
  });
});
