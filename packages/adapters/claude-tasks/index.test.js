import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { loadClaudeTasks, parseClaudeTaskJson } from "./index.js";

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/claude/tasks",
);

describe("parseClaudeTaskJson", () => {
  it("keeps unknown fields in rest and treats all known fields as optional", () => {
    const parsed = parseClaudeTaskJson({
      extraUnknown: "kept",
      blockedBy: [2],
    });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.blockedBy, ["2"]);
    assert.equal(parsed.rest.extraUnknown, "kept");
    assert.equal(parsed.subject, undefined);
  });

  it("rejects non-objects", () => {
    assert.equal(parseClaudeTaskJson([]).ok, false);
    assert.equal(parseClaudeTaskJson(null).ok, false);
  });
});

describe("loadClaudeTasks fixtures", () => {
  it("produces all four board statuses", async () => {
    const { items } = await loadClaudeTasks(fixtures);
    const byId = Object.fromEntries(items.map((item) => [item.id, item]));
    assert.equal(byId["claude:mvp-demo:1"].status, "completed");
    assert.equal(byId["claude:mvp-demo:2"].status, "in_progress");
    assert.equal(byId["claude:mvp-demo:3"].status, "pending");
    assert.equal(byId["claude:mvp-demo:4"].status, "blocked");
    assert.deepEqual(byId["claude:mvp-demo:4"].blockedBy, ["2"]);
    assert.equal(byId["claude:mvp-demo:5"].status, "pending");
    const statuses = new Set(items.map((item) => item.status));
    assert.deepEqual([...statuses].sort(), ["blocked", "completed", "in_progress", "pending"]);
  });
});
