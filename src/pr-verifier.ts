import { extractWorkersAiText } from "./workers-ai-response";

export interface PatchFile {
  path: string;
  patch?: string;
  additions?: number;
  deletions?: number;
}

export type VerifyResult =
  | { pass: true }
  | { pass: false; reason: string; suggestedNext: string };

const STOP_WORDS = new Set([
  "a", "an", "the", "to", "for", "and", "or", "in", "on", "at", "of", "with",
  "add", "update", "change", "make", "implement", "create", "fix", "use",
  "this", "that", "from", "into", "by", "is", "it", "be", "as", "all",
]);

const UI_KEYWORDS = new Set([
  "dark", "light", "mode", "theme", "color", "colour", "style", "styling",
  "layout", "page", "ui", "ux", "css", "background", "font", "button",
  "component", "responsive", "design", "visual", "appearance",
]);

const NON_UI_DIFF_PATTERNS = [
  /^[\s]*\/\//m,
  /^[\s]*\/\*[\s\S]*?\*\//m,
  /firebase/i,
  /getStorage/i,
  /getFirestore/i,
  /import\s+/,
  /require\s*\(/,
];

const UI_DIFF_MARKERS = [
  "<",
  "sx=",
  "className",
  "bgcolor",
  "backgroundColor",
  "background:",
  "color:",
  "theme.",
  ".css",
  "styled",
  "darkMode",
  "ThemeProvider",
];

function extractTaskKeywords(task: string): string[] {
  return task
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function countPatchLines(patches: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of patches.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    else if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }
  return { added, removed };
}

/** Raw added/removed line bodies (prefix stripped, file headers excluded). */
function getChangedLines(patch: string): { added: string[]; removed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  for (const line of patch.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added.push(line.slice(1));
    else if (line.startsWith("-") && !line.startsWith("---")) removed.push(line.slice(1));
  }
  return { added, removed };
}

/** Multiset of non-empty, whitespace-trimmed lines. */
function trimmedMultiset(lines: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }
  return counts;
}

/**
 * Added lines that are genuinely new — i.e. whose trimmed content is not
 * accounted for by a removed line. This excludes pure whitespace/indentation
 * reformatting of existing lines, so UI-marker checks only credit real changes.
 */
function netAddedLines(patch: string): string[] {
  const { added, removed } = getChangedLines(patch);
  const removedCounts = trimmedMultiset(removed);
  const net: string[] = [];
  for (const line of added) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const remaining = removedCounts.get(trimmed);
    if (remaining && remaining > 0) {
      removedCounts.set(trimmed, remaining - 1);
      continue;
    }
    net.push(line);
  }
  return net;
}

/** Unchanged context lines in a unified diff (prefixed with a single space). */
function getContextLines(patch: string): string[] {
  const context: string[] = [];
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@") || line.startsWith("+") || line.startsWith("-")) continue;
    if (line.startsWith(" ")) {
      const body = line.slice(1).trim();
      if (body) context.push(body);
    }
  }
  return context;
}

/**
 * Detect a diff that re-inserts a near-duplicate of code that already exists in
 * the surrounding unchanged context. This is the PR #14 failure: the model
 * added a partial copy of the JSX block sitting right below it instead of
 * editing the existing block. Such a diff "adds UI markers" but produces broken,
 * duplicated output.
 */
function hasDuplicateInsertion(files: PatchFile[]): boolean {
  for (const file of files) {
    if (!file.patch) continue;
    const added = netAddedLines(file.patch)
      .map((l) => l.trim())
      .filter(Boolean);
    if (added.length < 3) continue;
    const context = new Set(getContextLines(file.patch));
    if (context.size === 0) continue;
    const duplicated = added.filter((l) => context.has(l)).length;
    if (duplicated >= 3 && duplicated / added.length >= 0.5) return true;
  }
  return false;
}

/**
 * Detect obviously malformed code in added lines — a strong signal the edit was
 * truncated or syntactically broken (e.g. `style={{}` instead of `style={{...}}`,
 * or a single added line with unbalanced parentheses). Kept deliberately narrow
 * to avoid rejecting legitimate multi-line edits whose closing token sits in
 * unchanged context.
 */
function findMalformedAddedSyntax(files: PatchFile[]): string | null {
  for (const file of files) {
    if (!file.patch) continue;
    for (const line of netAddedLines(file.patch)) {
      // `{{}` that is not a complete `{{}}` — e.g. the broken `style={{}`.
      if (/\{\{\}(?!\})/.test(line)) {
        return `Added line contains malformed JSX expression ("${line.trim().slice(0, 60)}").`;
      }
    }
  }
  return null;
}

/**
 * For a dark-mode task, detect diffs that look like dark mode but do not enable
 * it: either they hard-code the palette to light, or they define a theme that
 * is never applied via <ThemeProvider>. These are the two failure modes seen on
 * Pantry runs (light-mode createTheme; theme object created but never wired up).
 */
function findIncompleteDarkMode(
  task: string,
  files: PatchFile[]
): string | null {
  if (!/\bdark\b/i.test(task)) return null;

  const addedLines: string[] = [];
  const contextLines: string[] = [];
  for (const file of files) {
    if (!file.patch) continue;
    addedLines.push(...netAddedLines(file.patch));
    contextLines.push(...getContextLines(file.patch));
  }
  if (addedLines.length === 0) return null;
  const addedText = addedLines.join("\n");

  const mentionsDark = /['"]dark['"]/.test(addedText) || /\bdark\b/i.test(addedText);
  const setsLightMode = /mode\s*:\s*['"]light['"]/.test(addedText);
  if (setsLightMode && !mentionsDark) {
    return "The diff sets the theme palette mode to 'light' for a dark mode task — it does not enable a dark theme.";
  }

  const definesTheme =
    /createTheme\s*\(/.test(addedText) || /\bdarkMode\b/.test(addedText);
  const appliesTheme =
    /<ThemeProvider\b/.test(addedText) ||
    contextLines.some((line) => /<ThemeProvider\b/.test(line));
  if (definesTheme && !appliesTheme) {
    return "The diff defines a theme but never applies it (no <ThemeProvider> wraps the UI), so dark mode will not take effect.";
  }

  return null;
}

/**
 * True when a diff only reformats existing code (whitespace/indentation,
 * trailing newline, line reordering) without changing any real content. Such a
 * diff never implements a substantive task even though it may "touch" UI lines.
 */
function isReformattingOnly(files: PatchFile[]): boolean {
  const added: string[] = [];
  const removed: string[] = [];
  let anyChange = false;
  for (const file of files) {
    if (!file.patch) continue;
    const changed = getChangedLines(file.patch);
    if (changed.added.length || changed.removed.length) anyChange = true;
    added.push(...changed.added);
    removed.push(...changed.removed);
  }
  if (!anyChange) return false;
  const a = trimmedMultiset(added);
  const r = trimmedMultiset(removed);
  if (a.size !== r.size) return false;
  for (const [key, value] of a) {
    if (r.get(key) !== value) return false;
  }
  return true;
}

/** A patch "has UI markers" only if a genuinely new line contains one. */
function patchHasUIMarkers(patch: string): boolean {
  return netAddedLines(patch).some((line) =>
    UI_DIFF_MARKERS.some((m) => line.includes(m))
  );
}

function patchIsOnlyNonUI(patch: string): boolean {
  const changedLines = patch
    .split("\n")
    .filter(
      (l) =>
        (l.startsWith("+") || l.startsWith("-")) &&
        !l.startsWith("+++") &&
        !l.startsWith("---")
    );

  if (changedLines.length === 0) return true;

  return changedLines.every((line) => {
    const body = line.slice(1).trim();
    if (!body) return true;
    return NON_UI_DIFF_PATTERNS.some((p) => p.test(body));
  });
}

function patchIntroducesBrokenRef(patch: string): string | null {
  const addedLines = patch
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1));

  const addedText = addedLines.join("\n");
  if (/\bgetStorage\s*\(/.test(addedText)) {
    const importContext = patch.includes("getStorage") &&
      (patch.includes("import") && patch.includes("getStorage") ||
        patch.includes("from \"firebase/storage\"") ||
        patch.includes("from 'firebase/storage'"));
    if (!importContext && !patch.match(/^\+.*import.*getStorage/m)) {
      return "Patch calls getStorage() but does not add a matching import";
    }
  }
  return null;
}

function taskExpectsUI(task: string): boolean {
  const lower = task.toLowerCase();
  return [...UI_KEYWORDS].some((kw) => lower.includes(kw));
}

/** Deterministic pre-flight checks on a diff before opening a PR. */
export function runDeterministicVerifier(
  task: string,
  files: PatchFile[]
): VerifyResult {
  const withPatches = files.filter((f) => f.patch && f.patch.trim().length > 0);
  if (withPatches.length === 0) {
    return {
      pass: false,
      reason: "No file changes with diffs found.",
      suggestedNext: "Use apply_file_edits or commit_files to implement the requested change before creating a PR.",
    };
  }

  if (task.trim().length > 0 && isReformattingOnly(withPatches)) {
    return {
      pass: false,
      reason:
        "Diff only reformats existing code (whitespace, indentation, or trailing newline) without changing any real content.",
      suggestedNext:
        "Make the actual change the task requires — edit the relevant JSX/CSS/logic, not just formatting. Use grep_in_file + read_file_section to find the code, then apply_file_edits with a real change.",
    };
  }

  if (hasDuplicateInsertion(withPatches)) {
    return {
      pass: false,
      reason:
        "Diff inserts a near-duplicate of code that already exists in the surrounding context, rather than editing the existing block.",
      suggestedNext:
        "Do NOT re-add an existing block. Use read_file_section to load the exact lines, then apply_file_edits with a multi-line search that matches the existing code and a replace that modifies it in place.",
    };
  }

  const malformed = findMalformedAddedSyntax(withPatches);
  if (malformed) {
    return {
      pass: false,
      reason: `${malformed} The edit appears truncated or syntactically broken.`,
      suggestedNext:
        "Re-read the target region with read_file_section, then apply_file_edits with a complete, balanced replacement (matching braces/brackets).",
    };
  }

  const incompleteDarkMode = findIncompleteDarkMode(task, withPatches);
  if (incompleteDarkMode) {
    return {
      pass: false,
      reason: incompleteDarkMode,
      suggestedNext:
        "Apply a real dark theme: set the palette mode to 'dark' (or a dark-defaulting toggle) and wrap the rendered UI in <ThemeProvider theme={...}>, or apply dark background/text colors directly to the page's top-level element.",
    };
  }

  let totalAdded = 0;
  let totalRemoved = 0;
  const allPatches = withPatches.map((f) => f.patch!).join("\n");

  for (const file of withPatches) {
    const counts = countPatchLines(file.patch!);
    totalAdded += counts.added;
    totalRemoved += counts.removed;
  }

  const totalChanged = totalAdded + totalRemoved;
  const hasUIMarkers = withPatches.some((f) => patchHasUIMarkers(f.patch!));
  if (totalChanged <= 2 && task.trim().length > 20 && !hasUIMarkers) {
    return {
      pass: false,
      reason:
        `Change is too trivial (${totalChanged} line(s) changed) for the requested task.`,
      suggestedNext:
        "Use grep_in_file to locate the relevant UI section, read_file_section to load it, then apply_file_edits with meaningful changes.",
    };
  }

  const brokenRef = patchIntroducesBrokenRef(allPatches);
  if (brokenRef) {
    return {
      pass: false,
      reason: brokenRef,
      suggestedNext: "Fix the edit to use existing imports or add the required import alongside the usage.",
    };
  }

  if (taskExpectsUI(task)) {
    const hasUI = withPatches.some((f) => patchHasUIMarkers(f.patch!));
    const onlyNonUI = withPatches.every((f) => patchIsOnlyNonUI(f.patch!));

    if (!hasUI && onlyNonUI) {
      const keywords = extractTaskKeywords(task).slice(0, 5).join(", ");
      return {
        pass: false,
        reason:
          `Task appears UI-related (${keywords || "styling/layout"}) but the diff only touches imports, comments, or init code — no UI/styling changes.`,
        suggestedNext:
          "grep_in_file for JSX/CSS patterns (e.g. '<Box', 'className', 'return ('), read_file_section around those lines, then apply_file_edits on the UI code.",
      };
    }
  }

  return { pass: true };
}

const VERIFIER_MODEL_ID = "@cf/zai-org/glm-4.7-flash";

function parseVerifierJson(text: string): VerifyResult | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      pass?: boolean;
      reason?: string;
      suggestedNext?: string;
    };
    if (parsed.pass === true) return { pass: true };
    return {
      pass: false,
      reason: parsed.reason || "LLM verifier rejected the changes.",
      suggestedNext:
        parsed.suggestedNext ||
        "Review the diff against the task and apply additional edits before creating a PR.",
    };
  } catch {
    return null;
  }
}

/** LLM second-opinion verifier (no tools). */
export async function runLLMVerifier(
  ai: Ai,
  task: string,
  files: PatchFile[],
  acceptanceCriteria?: string[]
): Promise<VerifyResult> {
  const patchSummary = files
    .filter((f) => f.patch)
    .map((f) => `### ${f.path}\n${f.patch}`)
    .join("\n\n");

  const criteriaBlock =
    acceptanceCriteria && acceptanceCriteria.length
      ? `\nAcceptance criteria (ALL must be satisfied by the diff):\n${acceptanceCriteria
          .map((c) => `- ${c}`)
          .join("\n")}\n`
      : "";

  const prompt = `You are a meticulous senior code reviewer. Verify whether a code diff COMPLETELY and CORRECTLY satisfies a user task. Output ONLY valid JSON.

User task: ${task}
${criteriaBlock}
Diff:
${patchSummary.slice(0, 6000)}

Respond with exactly this JSON shape:
{"pass": true}
OR
{"pass": false, "reason": "why it fails", "suggestedNext": "concrete next step for the coding agent"}

Rules:
- pass false if the diff is unrelated, trivial, or does not implement the task
- pass false if ANY acceptance criterion above is not satisfied by the diff
- pass false if the diff only changes comments/imports/init code for a UI task
- pass false if it deletes existing functionality or references an undefined symbol/class
- pass true only if the diff plausibly implements the full requested change`;

  try {
    const response = await ai.run(VERIFIER_MODEL_ID, {
      prompt,
      max_tokens: 512,
    });

    const text = extractWorkersAiText(response);

    const parsed = parseVerifierJson(text);
    if (parsed) return parsed;

    return {
      pass: false,
      reason: "LLM verifier returned unparseable output.",
      suggestedNext: "Ensure edits implement the full task, then retry create_pull_request.",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      pass: false,
      reason: `LLM verifier error: ${msg}`,
      suggestedNext: "Retry create_pull_request after confirming edits match the task.",
    };
  }
}

/** Run deterministic then LLM verification. Both must pass. */
export async function verifyTaskCompletion(
  ai: Ai,
  task: string,
  files: PatchFile[],
  acceptanceCriteria?: string[]
): Promise<VerifyResult> {
  const deterministic = runDeterministicVerifier(task, files);
  if (!deterministic.pass) return deterministic;

  return runLLMVerifier(ai, task, files, acceptanceCriteria);
}
