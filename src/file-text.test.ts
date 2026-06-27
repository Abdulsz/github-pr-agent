import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  grepInText,
  isSearchInReadContent,
  readLineRange,
  splitLines,
  stripLineNumberPrefixes,
} from "./file-text";

describe("splitLines", () => {
  it("handles CRLF", () => {
    assert.deepEqual(splitLines("a\r\nb"), ["a", "b"]);
  });
});

describe("readLineRange", () => {
  it("returns 1-indexed inclusive range with line numbers", () => {
    const content = "line1\nline2\nline3\nline4";
    const r = readLineRange(content, 2, 3);
    assert.equal(r.startLine, 2);
    assert.equal(r.endLine, 3);
    assert.deepEqual(r.lines, ["line2", "line3"]);
    assert.equal(r.totalLines, 4);
  });

  it("clamps out-of-range requests", () => {
    const r = readLineRange("only", 1, 100);
    assert.equal(r.endLine, 1);
  });
});

describe("grepInText", () => {
  it("finds matches with line numbers", () => {
    const content = "foo();\nbar();\nfoo();";
    const matches = grepInText(content, "foo\\(\\)");
    assert.equal(matches.length, 2);
    assert.deepEqual(
      matches.map((m) => m.line),
      [1, 3]
    );
  });

  it("treats invalid regex as literal search", () => {
    const matches = grepInText("hello (world)", "(world");
    assert.equal(matches.length, 1);
  });
});

describe("isSearchInReadContent", () => {
  it("accepts exact substring", () => {
    assert.equal(isSearchInReadContent("hello", "say hello there"), true);
  });

  it("accepts line-trimmed multi-line match", () => {
    const read = "function foo() {\n    return 1;\n}";
    const search = "function foo() {\n  return 1;\n}";
    assert.equal(isSearchInReadContent(search, read), true);
  });

  it("rejects search not in read content", () => {
    assert.equal(isSearchInReadContent("<Box>", "import React"), false);
  });
});

describe("stripLineNumberPrefixes", () => {
  it("removes leading LINE| prefixes when every line carries one", () => {
    assert.equal(
      stripLineNumberPrefixes("140|foo\n141|bar"),
      "foo\nbar"
    );
  });

  it("preserves indentation after the prefix", () => {
    assert.equal(
      stripLineNumberPrefixes("12|  return (\n13|    <Box>"),
      "  return (\n    <Box>"
    );
  });

  it("leaves genuine code with pipes untouched", () => {
    const code = "const x = a | b;";
    assert.equal(stripLineNumberPrefixes(code), code);
  });

  it("leaves search untouched when only some lines are numbered", () => {
    const mixed = "140|foo\nplain line";
    assert.equal(stripLineNumberPrefixes(mixed), mixed);
  });
});
