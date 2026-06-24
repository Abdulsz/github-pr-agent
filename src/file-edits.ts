import { splitLines } from "./file-text";

/** Files above this size should use apply_file_edits instead of full rewrites. */
export const LARGE_FILE_THRESHOLD = 8000;

/** Minimum trimmed length for single-line whitespace-insensitive matching. */
const MIN_LINE_TRIM_SINGLE_LINE_CHARS = 20;

export interface SearchReplaceEdit {
  search: string;
  replace: string;
}

export type MatchTier = "exact" | "eol-normalized" | "line-trim";

export interface MatchOccurrence {
  line: number;
  snippet: string;
}

export type FindMatchResult =
  | { type: "unique"; index: number; length: number; tier: MatchTier }
  | { type: "ambiguous"; count: number; occurrences: MatchOccurrence[] }
  | { type: "not_found" };

export type ValidateUpdateResult =
  | { valid: true }
  | { valid: false; error: string };

/** Decode base64 GitHub file content to UTF-8 text. */
export function decodeGitHubFileContent(base64Content?: string): string {
  if (!base64Content) return "";
  return decodeURIComponent(escape(atob(base64Content.replace(/\n/g, ""))));
}

/**
 * Detect placeholder-only stubs like "// Add feature\n// ..."
 * that LLMs emit when output is truncated.
 */
export function hasPlaceholderContent(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return true;

  const stubLinePattern = /^\s*(\/\/|\/\*|#|<!--).*\.{2,3}/;
  const allLinesAreStubComments = lines.every(
    (line) => stubLinePattern.test(line) || /^\s*\.{2,3}\s*$/.test(line)
  );
  if (lines.length <= 5 && allLinesAreStubComments) return true;

  const hasCode =
    /[{}();]|^(import|export|const|let|var|function|class|return|if|for)\b/m.test(
      trimmed
    );
  if (lines.length <= 3 && /\.{3}/.test(trimmed) && !hasCode) return true;

  return false;
}

/**
 * Reject updates that look truncated or wipe large files.
 */
export function validateUpdateContent(
  original: string,
  updated: string
): ValidateUpdateResult {
  if (hasPlaceholderContent(updated)) {
    return {
      valid: false,
      error:
        "Updated content appears to be a placeholder stub (e.g. '// ...'). " +
        "Use apply_file_edits with targeted search/replace hunks instead of rewriting the whole file.",
    };
  }

  if (original.length > 500) {
    if (updated.length < original.length * 0.6) {
      return {
        valid: false,
        error:
          `Update rejected: new content (${updated.length} chars) is much smaller than ` +
          `original (${original.length} chars). Content may be truncated. Use apply_file_edits instead.`,
      };
    }

    const originalLines = original.split(/\r?\n/).length;
    const updatedLines = updated.split(/\r?\n/).length;
    if (updatedLines < originalLines * 0.4) {
      return {
        valid: false,
        error:
          `Update rejected: line count dropped from ${originalLines} to ${updatedLines}. ` +
          "Use apply_file_edits instead.",
      };
    }
  }

  return { valid: true };
}

function computeLineStarts(content: string): number[] {
  const starts = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\r" && content[i + 1] === "\n") {
      starts.push(i + 2);
      i++;
    } else if (content[i] === "\n") {
      starts.push(i + 1);
    }
  }
  return starts;
}

export function getLineNumber(content: string, index: number): number {
  const clamped = Math.max(0, Math.min(index, content.length));
  let line = 1;
  for (let i = 0; i < clamped; i++) {
    if (content[i] === "\n") line++;
    else if (content[i] === "\r" && content[i + 1] === "\n") {
      line++;
      i++;
    }
  }
  return line;
}

function snippetAt(content: string, index: number, length: number): string {
  const lineStart = content.lastIndexOf("\n", index - 1) + 1;
  const nextNewline = content.indexOf("\n", index);
  const lineEnd = nextNewline === -1 ? content.length : nextNewline;
  const line = content.slice(lineStart, lineEnd).trim();
  const preview = line.length > 80 ? `${line.slice(0, 77)}...` : line;
  return preview || "(blank line)";
}

function findAllExactIndices(content: string, needle: string): number[] {
  if (!needle.length) return [];
  const indices: number[] = [];
  let start = 0;
  while (start <= content.length) {
    const idx = content.indexOf(needle, start);
    if (idx === -1) break;
    indices.push(idx);
    start = idx + 1;
  }
  return indices;
}

function eolVariants(search: string): string[] {
  const variants: string[] = [];
  const seen = new Set<string>();
  for (const v of [
    search,
    search.replace(/\r\n/g, "\n"),
    search.replace(/\n/g, "\r\n"),
  ]) {
    if (!seen.has(v)) {
      seen.add(v);
      variants.push(v);
    }
  }
  return variants;
}

function lineRangeSpan(
  content: string,
  startLineIndex: number,
  numLines: number
): { index: number; length: number } {
  const starts = computeLineStarts(content);
  const index = starts[startLineIndex] ?? 0;
  const endLine = startLineIndex + numLines;
  const endIndex =
    endLine < starts.length ? starts[endLine] : content.length;
  return { index, length: endIndex - index };
}

function toOccurrences(
  content: string,
  indices: { index: number; length: number }[]
): MatchOccurrence[] {
  return indices.map(({ index, length }) => ({
    line: getLineNumber(content, index),
    snippet: snippetAt(content, index, length),
  }));
}

function formatAmbiguousError(
  editIndex: number,
  result: Extract<FindMatchResult, { type: "ambiguous" }>
): string {
  const lines = result.occurrences.map((o) => o.line).join(", ");
  const previews = result.occurrences
    .map((o) => `L${o.line}: ${o.snippet}`)
    .join("; ");
  return (
    `Edit ${editIndex + 1}: search string matched ${result.count} times, at lines ${lines}. ` +
    `Add a line of surrounding context to disambiguate. Matches: ${previews}`
  );
}

function findLineTrimMatches(
  content: string,
  search: string
): Extract<FindMatchResult, { type: "unique" | "ambiguous" | "not_found" }> {
  const normSearch = search.replace(/\r\n/g, "\n");
  const searchLines = normSearch.split("\n").map((l) => l.trim());
  const nonEmptyTrimmed = searchLines.filter((l) => l.length > 0);

  if (nonEmptyTrimmed.length === 0) {
    return { type: "not_found" };
  }

  const allowSingleLine =
    searchLines.length === 1 &&
    nonEmptyTrimmed[0].length >= MIN_LINE_TRIM_SINGLE_LINE_CHARS;
  if (searchLines.length === 1 && !allowSingleLine) {
    return { type: "not_found" };
  }

  const contentLines = splitLines(content);
  const matches: number[] = [];

  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    const window = contentLines
      .slice(i, i + searchLines.length)
      .map((l) => l.trim());
    if (window.every((line, j) => line === searchLines[j])) {
      matches.push(i);
    }
  }

  if (matches.length === 0) return { type: "not_found" };
  if (matches.length === 1) {
    const span = lineRangeSpan(content, matches[0], searchLines.length);
    return { type: "unique", ...span, tier: "line-trim" };
  }

  return {
    type: "ambiguous",
    count: matches.length,
    occurrences: matches.map((lineIdx) => {
      const span = lineRangeSpan(content, lineIdx, searchLines.length);
      return {
        line: lineIdx + 1,
        snippet: snippetAt(content, span.index, span.length),
      };
    }),
  };
}

/**
 * Tiered deterministic match: exact → EOL variants → whitespace-insensitive lines.
 */
export function findMatch(content: string, search: string): FindMatchResult {
  const exactIndices = findAllExactIndices(content, search);
  if (exactIndices.length === 1) {
    return {
      type: "unique",
      index: exactIndices[0],
      length: search.length,
      tier: "exact",
    };
  }
  if (exactIndices.length > 1) {
    return {
      type: "ambiguous",
      count: exactIndices.length,
      occurrences: toOccurrences(
        content,
        exactIndices.map((index) => ({ index, length: search.length }))
      ),
    };
  }

  for (const variant of eolVariants(search)) {
    if (variant === search) continue;
    const indices = findAllExactIndices(content, variant);
    if (indices.length === 1) {
      return {
        type: "unique",
        index: indices[0],
        length: variant.length,
        tier: "eol-normalized",
      };
    }
    if (indices.length > 1) {
      return {
        type: "ambiguous",
        count: indices.length,
        occurrences: toOccurrences(
          content,
          indices.map((index) => ({ index, length: variant.length }))
        ),
      };
    }
  }

  return findLineTrimMatches(content, search);
}

/** Apply ordered search/replace edits; each search must match exactly once. */
export function applySearchReplaceEdits(
  original: string,
  edits: SearchReplaceEdit[]
): string {
  if (!edits.length) {
    throw new Error('At least one edit is required. Each edit needs "search" and "replace".');
  }

  let result = original;
  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];
    const search = edit?.search;
    const replace = edit?.replace;

    if (typeof search !== "string" || !search.length) {
      throw new Error(`Edit ${i + 1}: "search" must be a non-empty string.`);
    }
    if (typeof replace !== "string") {
      throw new Error(`Edit ${i + 1}: "replace" must be a string.`);
    }

    const match = findMatch(result, search);
    if (match.type === "not_found") {
      throw new Error(
        `Edit ${i + 1}: search string not found in file (exact, line-ending, and trimmed line matching all failed). ` +
          "Use a substring copied from read_file, or add surrounding context lines."
      );
    }
    if (match.type === "ambiguous") {
      throw new Error(formatAmbiguousError(i, match));
    }

    result =
      result.slice(0, match.index) +
      replace +
      result.slice(match.index + match.length);
  }

  return result;
}
