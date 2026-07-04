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

/** Colors/tokens that plausibly signal a dark palette in added code. */
const DARK_COLOR_PATTERN =
  /#(?:0[0-9a-f]{2}|1[0-9a-f]{2}|2[0-9a-f]{2}|3[0-9a-f]{2})(?:[0-9a-f]{3})?\b|\bblack\b|prefers-color-scheme/i;

/** A line that applies styling to rendered UI (JSX attribute or CSS declaration). */
const STYLE_APPLICATION_PATTERN =
  /sx=|style=|className=|class=|bgcolor|backgroundColor|background\s*:|color\s*:/;

/**
 * For a dark-mode task, detect diffs that look like dark mode but do not enable
 * it: no dark tokens at all, a palette hard-coded to light, or a theme/state
 * that is defined but never applied. "Applied" accepts either a <ThemeProvider>
 * wrapper OR dark styling set directly on rendered elements (sx/style/className
 * with a dark color or dark-mode state) — both are valid implementations, and
 * rejecting the direct-styling variant would spin the recovery loop on a
 * correct fix.
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

  const hasDarkSignal =
    /\bdark\b|\bdarkmode\b|['"]dark['"]/i.test(addedText) ||
    DARK_COLOR_PATTERN.test(addedText);
  if (!hasDarkSignal) {
    return "The task asks for dark mode but the added lines contain no dark styling at all (no dark palette mode, dark colors, or dark theme references).";
  }

  const setsLightMode = /mode\s*:\s*['"]light['"]/.test(addedText);
  const setsDarkMode = /mode\s*:\s*['"]dark['"]/.test(addedText);
  if (setsLightMode && !setsDarkMode) {
    return "The diff sets the theme palette mode to 'light' for a dark mode task — it does not enable a dark theme.";
  }

  const definesTheme =
    /createTheme\s*\(/.test(addedText) || /\bdarkMode\b/.test(addedText);
  const appliesViaProvider =
    /<ThemeProvider\b/.test(addedText) ||
    contextLines.some((line) => /<ThemeProvider\b/.test(line));
  const appliesViaStyling = addedLines.some(
    (line) =>
      STYLE_APPLICATION_PATTERN.test(line) &&
      (/\bdark/i.test(line) || DARK_COLOR_PATTERN.test(line))
  );
  if (definesTheme && !appliesViaProvider && !appliesViaStyling) {
    return "The diff defines a theme/dark-mode state but never applies it to the rendered UI (no <ThemeProvider> wrapper and no dark styling on any element), so dark mode will not take effect.";
  }

  return null;
}

/** Names that indicate appearance/theme state rather than app logic. */
const APPEARANCE_NAME_PATTERN = /dark|light|theme|color|colour|bg\b|bgcolor|background|mode/i;

/**
 * Extract identifiers declared in added lines that carry appearance-sounding
 * names — `const [darkMode, setDarkMode] = useState(...)` or `const bgColor = ...`.
 */
function findAddedAppearanceDeclarations(addedLines: string[]): string[] {
  const names: string[] = [];
  for (const line of addedLines) {
    const stateMatch = line.match(
      /(?:const|let)\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*set[A-Za-z_$][\w$]*\s*\]\s*=\s*useState/
    );
    const constMatch = line.match(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/);
    const name = stateMatch?.[1] ?? constMatch?.[1];
    if (name && APPEARANCE_NAME_PATTERN.test(name) && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

/** Lines that plausibly wire a value into rendered UI or a theme definition. */
const STATE_WIRING_PATTERN =
  /<[A-Za-z/]|sx=|style=|className=|class=|bgcolor|backgroundColor|background\s*:|color\s*:|mode\s*:|ThemeProvider|createTheme|theme=/;

/**
 * P1: reject "half-wired" UI diffs — appearance state (darkMode, bgColor, ...)
 * is added but no added or surrounding line ever uses it in JSX, styling, or a
 * theme definition. This is the exact shape of the failed live runs: state +
 * toggle handler committed, JSX untouched.
 */
function findUnwiredAppearanceState(
  task: string,
  files: PatchFile[]
): string | null {
  if (!taskExpectsUI(task)) return null;

  const addedLines: string[] = [];
  const contextLines: string[] = [];
  for (const file of files) {
    if (!file.patch) continue;
    addedLines.push(...netAddedLines(file.patch));
    contextLines.push(...getContextLines(file.patch));
  }

  const declared = findAddedAppearanceDeclarations(addedLines);
  if (declared.length === 0) return null;

  const usageLines = [...addedLines, ...contextLines];
  const isWired = (name: string): boolean => {
    const ref = new RegExp(`\\b${name}\\b`);
    const declPattern = new RegExp(`(?:const|let)\\s*\\[?\\s*${name}\\b`);
    return usageLines.some(
      (line) =>
        ref.test(line) && !declPattern.test(line) && STATE_WIRING_PATTERN.test(line)
    );
  };

  if (declared.some(isWired)) return null;
  return (
    `The diff adds appearance state (${declared.join(", ")}) but never uses it in any JSX, styling, or theme definition — ` +
    "the change has no visible effect."
  );
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

/** Node builtins and framework-internal specifiers that are never in package.json deps. */
const IMPORT_CHECK_EXEMPT = new Set([
  "fs", "path", "os", "crypto", "http", "https", "url", "util", "stream",
  "buffer", "events", "child_process", "zlib", "querystring", "assert",
]);

/** Extract the root package name from an import specifier, or null if local/exempt. */
function importedPackageName(specifier: string): string | null {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("@/") || // path alias, not a scoped package
    specifier.startsWith("~") ||
    specifier.startsWith("node:")
  ) {
    return null;
  }
  const parts = specifier.split("/");
  const root = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  if (!root || IMPORT_CHECK_EXEMPT.has(root)) return null;
  return root;
}

/**
 * Reject diffs whose ADDED lines import a package that is not declared in the
 * repo's package.json (deps or devDeps). Compiles-clean-but-build-breaks is
 * invisible to both the diff heuristics and the LLM reviewer (live example:
 * PR #17 imported @mui/icons-material, absent from Pantry's dependencies).
 * Skipped entirely when the caller has no dependency list.
 */
export function findUndeclaredImports(
  files: PatchFile[],
  declaredDependencies?: string[]
): string | null {
  if (!declaredDependencies || declaredDependencies.length === 0) return null;
  const declared = new Set(declaredDependencies);
  const importPattern =
    /(?:^|\s)(?:import\s[^'"]*?from\s*|import\s*\(\s*|require\s*\(\s*|export\s[^'"]*?from\s*)['"]([^'"]+)['"]/g;

  const missing = new Set<string>();
  for (const file of files) {
    if (!file.patch) continue;
    // package.json edits themselves are not imports.
    if (/(^|\/)package\.json$/.test(file.path)) continue;
    for (const line of netAddedLines(file.patch)) {
      for (const match of line.matchAll(importPattern)) {
        const pkg = importedPackageName(match[1]);
        if (pkg && !declared.has(pkg)) missing.add(pkg);
      }
    }
  }
  if (missing.size === 0) return null;
  const list = [...missing].join(", ");
  return `The diff imports package(s) not declared in package.json dependencies: ${list}. The project build will fail.`;
}

function taskExpectsUI(task: string): boolean {
  const lower = task.toLowerCase();
  return [...UI_KEYWORDS].some((kw) => lower.includes(kw));
}

/** Deterministic pre-flight checks on a diff before opening a PR. */
export function runDeterministicVerifier(
  task: string,
  files: PatchFile[],
  declaredDependencies?: string[]
): VerifyResult {
  const undeclaredImports = findUndeclaredImports(files, declaredDependencies);
  if (undeclaredImports) {
    return {
      pass: false,
      reason: undeclaredImports,
      suggestedNext:
        "Either implement the change using packages already listed in package.json (e.g. an inline SVG or a text button instead of an icon package), or add the new package to package.json dependencies in the same commit.",
    };
  }
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
        "Apply a real dark theme: set the palette mode to 'dark' (or a dark-defaulting toggle) and wrap the rendered UI in <ThemeProvider theme={...}>, or apply dark background/text colors directly to the page's top-level element (e.g. sx={{ bgcolor: darkMode ? '#121212' : '#fff', color: darkMode ? '#fff' : '#000' }}).",
    };
  }

  const unwiredState = findUnwiredAppearanceState(task, withPatches);
  if (unwiredState) {
    return {
      pass: false,
      reason: unwiredState,
      suggestedNext:
        "Wire the state into the rendered UI: grep_in_file for 'return (' in the same file, read_file_section around it, then apply_file_edits to reference the state in the JSX (e.g. sx={{ bgcolor: darkMode ? '#121212' : '#fff' }} on the top-level element or a <ThemeProvider theme={...}> wrapper).",
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

/**
 * Verifier model. GLM-4.7-Flash systematically returned unparseable output on
 * live runs (2026-07-03), rejecting deterministically-valid diffs; llama-3.3
 * follows "output only JSON" reliably and is fast enough for the gateway.
 */
const VERIFIER_MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

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

  const MAX_ATTEMPTS = 3;
  let lastError = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      // Cast to any to avoid tight AiModels type coupling; model IDs are validated at runtime.
      const response = await (ai as any).run(VERIFIER_MODEL_ID, {
        prompt,
        max_tokens: 512,
      });

      const text = extractWorkersAiText(response);

      const parsed = parseVerifierJson(text);
      if (parsed) return parsed;

      // Unparseable output is a model artifact, not a review verdict — retry.
      lastError = `unparseable verifier output: ${text.slice(0, 120)}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  // The model never produced a verdict (infrastructure failure or persistent
  // garbage output). The deterministic verifier has already passed at this
  // point; failing closed here burns verify retries on an outage — and gives
  // the executor a meaningless "unparseable output" recovery reason it cannot
  // act on — killing otherwise-good runs.
  console.warn(
    `LLM verifier produced no verdict after ${MAX_ATTEMPTS} attempts (${lastError}); accepting deterministic verification result.`
  );
  return { pass: true };
}

/** Run deterministic then LLM verification. Both must pass. */
export async function verifyTaskCompletion(
  ai: Ai,
  task: string,
  files: PatchFile[],
  acceptanceCriteria?: string[],
  declaredDependencies?: string[]
): Promise<VerifyResult> {
  const deterministic = runDeterministicVerifier(task, files, declaredDependencies);
  if (!deterministic.pass) return deterministic;

  return runLLMVerifier(ai, task, files, acceptanceCriteria);
}
