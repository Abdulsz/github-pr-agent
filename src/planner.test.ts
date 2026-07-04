import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createTaskPlan,
  fallbackPlan,
  formatPlanForPrompt,
  parsePlanJson,
  routeTaskSize,
} from "./planner";

describe("parsePlanJson", () => {
  it("parses a well-formed plan", () => {
    const text = `Here is the plan:
{
  "summary": "Add a dark theme",
  "subtasks": [
    { "title": "Add dark styles", "files": ["app/globals.css"], "acceptance": ["body background becomes dark"] }
  ],
  "acceptanceCriteria": ["page renders dark", "existing font is preserved"]
}`;
    const plan = parsePlanJson(text);
    assert.ok(plan);
    assert.equal(plan!.subtasks.length, 1);
    assert.equal(plan!.subtasks[0].files[0], "app/globals.css");
    assert.equal(plan!.acceptanceCriteria.length, 2);
    assert.equal(typeof plan!.createdAt, "number");
  });

  it("returns null when no JSON object is present", () => {
    assert.equal(parsePlanJson("no json here"), null);
  });

  it("returns null for JSON without subtasks or criteria", () => {
    assert.equal(parsePlanJson('{"summary":"x"}'), null);
  });

  it("drops malformed subtasks and non-string files/criteria", () => {
    const text = `{
      "summary": 5,
      "subtasks": [
        { "title": "valid", "files": ["a.ts", 3], "acceptance": ["ok", null] },
        { "noTitle": true }
      ],
      "acceptanceCriteria": ["good", 7]
    }`;
    const plan = parsePlanJson(text);
    assert.ok(plan);
    assert.equal(plan!.summary, "");
    assert.equal(plan!.subtasks.length, 1);
    assert.deepEqual(plan!.subtasks[0].files, ["a.ts"]);
    assert.deepEqual(plan!.subtasks[0].acceptance, ["ok"]);
    assert.deepEqual(plan!.acceptanceCriteria, ["good"]);
  });
});

describe("fallbackPlan", () => {
  it("produces a single-subtask plan from the task", () => {
    const plan = fallbackPlan("Add dark mode");
    assert.equal(plan.subtasks.length, 1);
    assert.equal(plan.subtasks[0].title, "Add dark mode");
    assert.deepEqual(plan.acceptanceCriteria, ["Add dark mode"]);
  });

  it("handles empty task with a default", () => {
    const plan = fallbackPlan("   ");
    assert.match(plan.summary, /Implement the requested change/);
  });
});

describe("task-size routing", () => {
  const pantryPaths = ["app/layout.js", "app/page.js", "app/globals.css"];

  it("uses a focused plan for an unambiguous local page request", async () => {
    const ai = {
      run: async () => {
        throw new Error("planner should not run");
      },
    } as unknown as Ai;
    const plan = await createTaskPlan(ai, "Add dark mode to the home page", pantryPaths);
    assert.equal(plan.subtasks.length, 1);
    assert.deepEqual(plan.subtasks[0].files, ["app/page.js"]);
    assert.match(plan.summary, /app\/page\.js/);
  });

  it("uses a focused plan for a request that names one repository file", () => {
    assert.deepEqual(
      routeTaskSize("Fix the empty state in src/components/EmptyState.tsx", [
        "src/components/EmptyState.tsx",
        "src/components/List.tsx",
      ]),
      {
        kind: "focused",
        target: "src/components/EmptyState.tsx",
        reason: "request names one repository file",
      }
    );
  });

  it("recognizes an explicitly named Windows-style path", () => {
    assert.equal(
      routeTaskSize("Fix src\\components\\EmptyState.tsx", [
        "src/components/EmptyState.tsx",
      ]).kind,
      "focused"
    );
  });

  it("keeps explicit cross-cutting work with the full planner", () => {
    assert.deepEqual(
      routeTaskSize("Add a provider and persist the theme setting", pantryPaths),
      {
        kind: "planned",
        reason: "request is cross-cutting or names multiple files",
      }
    );
  });

  it("keeps ambiguous requests with the full planner", () => {
    assert.equal(routeTaskSize("Improve search performance", pantryPaths).kind, "planned");
  });
});

describe("formatPlanForPrompt", () => {
  it("renders summary, subtasks, and acceptance criteria", () => {
    const out = formatPlanForPrompt({
      summary: "Add dark theme",
      subtasks: [
        { title: "Edit layout", files: ["app/layout.js"], acceptance: ["body is dark"] },
      ],
      acceptanceCriteria: ["page renders dark"],
      createdAt: Date.now(),
    });
    assert.match(out, /IMPLEMENTATION PLAN/);
    assert.match(out, /Summary: Add dark theme/);
    assert.match(out, /1\. Edit layout \[files: app\/layout\.js\]/);
    assert.match(out, /acceptance: body is dark/);
    assert.match(out, /- page renders dark/);
  });
});
