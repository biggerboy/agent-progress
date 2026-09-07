import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyBlocked, asStringArray, coerceStatus } from "./index.js";
import { loopbackHost } from "./home.js";

describe("coerceStatus", () => {
  it("maps known aliases", () => {
    assert.equal(coerceStatus("in-progress"), "in_progress");
    assert.equal(coerceStatus("open"), "pending");
    assert.equal(coerceStatus("resolved"), "completed");
    assert.equal(coerceStatus("error"), "blocked");
    assert.equal(coerceStatus("mystery"), undefined);
  });
});

describe("applyBlocked", () => {
  it("marks unfinished tasks with live blockers as blocked", () => {
    const result = applyBlocked({
      status: "pending",
      blockedBy: ["1", "2"],
      completedIds: new Set(["1"]),
    });
    assert.equal(result.status, "blocked");
    assert.deepEqual(result.blockedBy, ["2"]);
  });

  it("does not block when every blocker is completed", () => {
    const result = applyBlocked({
      status: "pending",
      blockedBy: ["1"],
      completedIds: new Set(["1"]),
    });
    assert.equal(result.status, "pending");
    assert.deepEqual(result.blockedBy, []);
  });

  it("keeps completed tasks completed", () => {
    const result = applyBlocked({
      status: "completed",
      blockedBy: ["9"],
      completedIds: new Set(),
    });
    assert.equal(result.status, "completed");
  });
});

describe("loopbackHost", () => {
  it("rejects wildcard binds", () => {
    assert.equal(loopbackHost("0.0.0.0").host, "127.0.0.1");
    assert.equal(loopbackHost("0.0.0.0").forced, true);
    assert.equal(loopbackHost("127.0.0.1").forced, false);
  });
});

describe("asStringArray", () => {
  it("drops empties", () => {
    assert.deepEqual(asStringArray(["1", "", null, 2]), ["1", "2"]);
    assert.deepEqual(asStringArray("nope"), []);
  });
});
