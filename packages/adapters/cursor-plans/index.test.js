import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { aggregatePlanStatus, loadCursorPlans, parsePlanMarkdown } from "./index.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("parsePlanMarkdown", () => {
  it("reads name, overview and todo statuses", () => {
    const parsed = parsePlanMarkdown(`---
name: Demo
overview: Hello
todos:
  - id: a
    content: One
    status: completed
  - id: b
    content: Two
    status: in-progress
isProject: false
---

# Body
`);
    assert.equal(parsed.name, "Demo");
    assert.equal(parsed.todos.length, 2);
    assert.equal(parsed.todos[1].status, "in-progress");
  });
});

describe("aggregatePlanStatus", () => {
  it("prefers in_progress over leftover pending", () => {
    assert.equal(aggregatePlanStatus(["completed", "in-progress", "pending"]), "in_progress");
    assert.equal(aggregatePlanStatus(["completed", "completed"]), "completed");
    assert.equal(aggregatePlanStatus(["pending", "completed"]), "pending");
  });
});

describe("loadCursorPlans fixtures", () => {
  it("loads user-level and workspace plans", async () => {
    const { items, presentDirs } = await loadCursorPlans([
      path.join(repo, "fixtures/cursor/plans"),
      path.join(repo, "fixtures/workspace/.cursor/plans"),
      path.join(repo, "fixtures/missing-plans"),
    ]);
    assert.equal(items.length, 2);
    assert.equal(presentDirs.length, 2);
    const ship = items.find((i) => i.title.includes("Ship"));
    const notes = items.find((i) => i.title.includes("Workspace"));
    assert.equal(ship.status, "in_progress");
    assert.equal(notes.status, "completed");
    assert.equal(ship.source.tool, "cursor");
  });
});
