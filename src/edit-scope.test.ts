import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isEditAllowed, isSecondaryPath, primaryPlanPaths } from "./edit-scope";
import type { TaskPlan } from "./types";

function planFor(files: string[]): TaskPlan {
  return {
    summary: "test",
    subtasks: [{ title: "t", files, acceptance: [] }],
    acceptanceCriteria: [],
    createdAt: 0,
  };
}

describe("primaryPlanPaths", () => {
  it("returns the union of subtask files without blanks or duplicates", () => {
    const plan: TaskPlan = {
      summary: "",
      subtasks: [
        { title: "a", files: ["app/page.js", ""], acceptance: [] },
        { title: "b", files: ["app/page.js", "lib/x.js"], acceptance: [] },
      ],
      acceptanceCriteria: [],
      createdAt: 0,
    };
    assert.deepEqual(primaryPlanPaths(plan), ["app/page.js", "lib/x.js"]);
  });

  it("returns empty for an undefined plan", () => {
    assert.deepEqual(primaryPlanPaths(undefined), []);
  });
});

describe("isSecondaryPath", () => {
  it("flags layout, globals, and public files as secondary", () => {
    const primary = ["app/page.js"];
    assert.equal(isSecondaryPath("app/layout.js", primary), true);
    assert.equal(isSecondaryPath("app/globals.css", primary), true);
    assert.equal(isSecondaryPath("public/index.html", primary), true);
  });

  it("never flags a planned primary path as secondary", () => {
    assert.equal(isSecondaryPath("app/layout.js", ["app/layout.js"]), false);
  });

  it("does not flag ordinary source files", () => {
    assert.equal(isSecondaryPath("app/page.js", ["app/page.js"]), false);
    assert.equal(isSecondaryPath("components/Card.jsx", ["app/page.js"]), false);
  });
});

describe("isEditAllowed", () => {
  it("blocks a secondary file before the primary target is edited", () => {
    const result = isEditAllowed("app/layout.js", planFor(["app/page.js"]), new Set());
    assert.equal(result.allowed, false);
  });

  it("allows a secondary file after the primary target is edited", () => {
    const result = isEditAllowed(
      "app/layout.js",
      planFor(["app/page.js"]),
      new Set(["app/page.js"])
    );
    assert.equal(result.allowed, true);
  });

  it("always allows the primary target itself", () => {
    const result = isEditAllowed("app/page.js", planFor(["app/page.js"]), new Set());
    assert.equal(result.allowed, true);
  });

  it("allows anything when the plan names no files", () => {
    const result = isEditAllowed("app/layout.js", planFor([]), new Set());
    assert.equal(result.allowed, true);
  });
});
