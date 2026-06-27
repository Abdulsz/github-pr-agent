export interface GrepMatch {
  line: number;
  text: string;
  match: string;
}

export interface LineRangeResult {
  startLine: number;
  endLine: number;
  totalLines: number;
  content: string;
  lines: string[];
}

/** Split content into lines preserving line content without trailing newlines. */
export function splitLines(content: string): string[] {
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\r" && content[i + 1] === "\n") {
      lines.push(content.slice(start, i));
      start = i + 2;
      i++;
    } else if (content[i] === "\n") {
      lines.push(content.slice(start, i));
      start = i + 1;
    }
  }
  lines.push(content.slice(start));
  return lines;
}

/** Read a 1-indexed inclusive line range from content. */
export function readLineRange(
  content: string,
  startLine: number,
  endLine: number
): LineRangeResult {
  const lines = splitLines(content);
  const totalLines = lines.length;
  const start = Math.max(1, Math.min(startLine, totalLines || 1));
  const end = Math.max(start, Math.min(endLine, totalLines || start));
  const slice = lines.slice(start - 1, end);
  return {
    startLine: start,
    endLine: end,
    totalLines,
    content: slice.join("\n"),
    lines: slice,
  };
}

/** Search content with a regex pattern; returns line-numbered matches. */
export function grepInText(
  content: string,
  pattern: string,
  maxMatches = 50
): GrepMatch[] {
  if (!pattern.trim()) return [];

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "gm");
  } catch {
    regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gm");
  }

  const lines = splitLines(content);
  const matches: GrepMatch[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      matches.push({
        line: i + 1,
        text: line.trim(),
        match: match[0],
      });
      if (matches.length >= maxMatches) return matches;
      if (!regex.global) break;
    }
  }

  return matches;
}

/**
 * Check whether a search string appears in content the model has read.
 * Accepts exact substring, EOL variants, or line-trimmed multi-line match.
 */
export function isSearchInReadContent(search: string, readContent: string): boolean {
  if (!search.length || !readContent.length) return false;

  if (readContent.includes(search)) return true;

  const eolVariants = [
    search.replace(/\r\n/g, "\n"),
    search.replace(/\n/g, "\r\n"),
  ];
  for (const variant of eolVariants) {
    if (variant !== search && readContent.includes(variant)) return true;
  }

  const normSearch = search.replace(/\r\n/g, "\n");
  const searchLines = normSearch.split("\n").map((l) => l.trim());
  if (searchLines.every((l) => l.length === 0)) return false;

  const readLines = splitLines(readContent).map((l) => l.trim());
  for (let i = 0; i <= readLines.length - searchLines.length; i++) {
    const window = readLines.slice(i, i + searchLines.length);
    if (window.every((line, j) => line === searchLines[j])) return true;
  }

  return false;
}

/**
 * Strip leading "LINE|" prefixes that models sometimes copy verbatim from
 * numbered read_file_section output into apply_file_edits search strings.
 * Only strips when every non-empty line carries a numeric prefix, so genuine
 * code containing a pipe character is left untouched.
 */
export function stripLineNumberPrefixes(search: string): string {
  const lines = search.split("\n");
  const prefix = /^\s*\d+\|/;
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  if (nonEmpty.length === 0 || !nonEmpty.every((line) => prefix.test(line))) {
    return search;
  }
  return lines.map((line) => line.replace(prefix, "")).join("\n");
}

/** Append new read content to the per-path cache. */
export function appendToReadCache(
  cache: Map<string, string>,
  path: string,
  content: string
): void {
  const existing = cache.get(path) ?? "";
  cache.set(path, existing ? `${existing}\n${content}` : content);
}
