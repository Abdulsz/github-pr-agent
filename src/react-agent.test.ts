import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAmbiguousEditRecoveryMessage,
  normalizeToolArguments,
} from "./react-agent";

describe("buildAmbiguousEditRecoveryMessage", () => {
  it("turns candidate lines into a targeted multi-line patch recovery", () => {
    const message = buildAmbiguousEditRecoveryMessage(
      "app/page.js",
      "Edit 1: search string matched 3 times, at lines 146, 352, 389. Add a line of surrounding context."
    );
    assert.ok(message);
    assert.match(message!, /146, 352, 389/);
    assert.match(message!, /read_file_section\("app\/page\.js", 140, 158\)/);
    assert.match(message!, /multi-line search/);
  });

  it("does not intercept unrelated edit errors", () => {
    assert.equal(
      buildAmbiguousEditRecoveryMessage("app/page.js", "Search string not found"),
      null
    );
  });
});

describe("normalizeToolArguments", () => {
  it("unwraps model-emitted typed scalar values recursively", () => {
    assert.deepEqual(
      normalizeToolArguments({
        branchName: { type: "string", value: "feature/test" },
        edits: [
          {
            search: { type: "string", value: "before" },
            replace: { type: "string", value: "after" },
          },
        ],
      }),
      {
        branchName: "feature/test",
        edits: [{ search: "before", replace: "after" }],
      }
    );
  });
});
