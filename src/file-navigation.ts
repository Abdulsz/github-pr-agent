import { grepInText, readLineRange, type GrepMatch } from "./file-text";

export const MAX_SECTION_LINES = 150;
export const MAX_GREP_MATCHES = 50;

export interface GrepInFileResult {
  path: string;
  pattern: string;
  matchCount: number;
  truncated: boolean;
  matches: GrepMatch[];
}

export interface FileSectionResult {
  path: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  lineCount: number;
  content: string;
}

/** Grep a file's content with match cap. */
export function grepInFileContent(
  content: string,
  pattern: string,
  path: string
): GrepInFileResult {
  const matches = grepInText(content, pattern, MAX_GREP_MATCHES);
  return {
    path,
    pattern,
    matchCount: matches.length,
    truncated: matches.length >= MAX_GREP_MATCHES,
    matches,
  };
}

/** Format lines with 1-indexed line numbers for model readability. */
export function formatSectionContent(lines: string[], startLine: number): string {
  return lines
    .map((line, i) => `${startLine + i}|${line}`)
    .join("\n");
}

/** Read a line range and return numbered section content. */
export function readFileSectionContent(
  content: string,
  path: string,
  startLine: number,
  endLine: number
): FileSectionResult {
  const clampedEnd =
    endLine - startLine + 1 > MAX_SECTION_LINES
      ? startLine + MAX_SECTION_LINES - 1
      : endLine;

  const range = readLineRange(content, startLine, clampedEnd);
  const numbered = formatSectionContent(range.lines, range.startLine);

  return {
    path,
    startLine: range.startLine,
    endLine: range.endLine,
    totalLines: range.totalLines,
    lineCount: range.lines.length,
    content: numbered,
  };
}
