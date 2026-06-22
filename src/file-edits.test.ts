import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applySearchReplaceEdits,
  findMatch,
  getLineNumber,
} from "./file-edits";

describe("findMatch", () => {
  it("matches exactly", () => {
    const r = findMatch("hello world", "world");
    assert.equal(r.type, "unique");
    if (r.type === "unique") {
      assert.equal(r.tier, "exact");
      assert.equal(r.index, 6);
    }
  });

  it("matches across CRLF vs LF", () => {
    const content = "line1\r\nline2\r\nline3";
    const search = "line1\nline2";
    const r = findMatch(content, search);
    assert.equal(r.type, "unique");
    if (r.type === "unique") {
      assert.equal(r.tier, "eol-normalized");
    }
  });

  it("matches with trimmed whitespace per line", () => {
    const content = "function foo() {\n    return 1;\n}\n";
    const search = "function foo() {\n  return 1;\n}";
    const r = findMatch(content, search);
    assert.equal(r.type, "unique");
    if (r.type === "unique") {
      assert.equal(r.tier, "line-trim");
    }
  });

  it("reports ambiguous matches with line numbers", () => {
    const content = "foo();\nbar();\nfoo();\n";
    const r = findMatch(content, "foo();");
    assert.equal(r.type, "ambiguous");
    if (r.type === "ambiguous") {
      assert.equal(r.count, 2);
      assert.deepEqual(
        r.occurrences.map((o) => o.line),
        [1, 3]
      );
    }
  });

  it("skips line-trim for short single-line when exact match fails", () => {
    const r = findMatch("\tfoo", "    foo");
    assert.equal(r.type, "not_found");
  });

  it("uses line-trim for long single-line indentation drift", () => {
    const token = "a".repeat(25);
    const r = findMatch(`\t${token}`, `    ${token}`);
    assert.equal(r.type, "unique");
    if (r.type === "unique") assert.equal(r.tier, "line-trim");
  });
});

describe("applySearchReplaceEdits", () => {
  it("applies EOL-normalized replacement in original buffer", () => {
    const original = "a\r\nb\r\nc";
    const result = applySearchReplaceEdits(original, [
      { search: "a\nb", replace: "X" },
    ]);
    assert.equal(result, "X\r\nc");
  });

  it("throws actionable error on ambiguous match", () => {
    assert.throws(
      () =>
        applySearchReplaceEdits("dup\ndup", [
          { search: "dup", replace: "x" },
        ]),
      /matched 2 times, at lines/
    );
  });
});

describe("getLineNumber", () => {
  it("counts CRLF as one line break", () => {
    assert.equal(getLineNumber("a\r\nb", 3), 2);
  });
});
