/**
 * Task planner (AD-004).
 *
 * Before any edits, the agent produces a structured plan: a short summary,
 * ordered subtasks (each with target files + checkable acceptance), and overall
 * acceptance criteria. The plan is persisted in agent state, injected into the
 * executor prompt, and its acceptance criteria are fed to the verifier so
 * verification checks completeness against the plan rather than generic
 * heuristics. This is the foundation for handling more complex, multi-file work.
 */

import type { TaskPlan } from "./types";
import { extractWorkersAiText } from "./workers-ai-response";

/**
 * Planner model. Same catalog model as the executor for now; swap to an
 * agentic-coding model (e.g. "@cf/zai-org/glm-5.2") when validated.
 */
const PLANNER_MODEL_ID = "@cf/zai-org/glm-4.7-flash";
/** Cap the file list injected into the planner prompt to bound tokens. */
const MAX_PLAN_FILES = 200;

const HOME_PAGE_PATHS = [
  "app/page.tsx",
  "app/page.jsx",
  "app/page.js",
  "src/app/page.tsx",
  "src/app/page.jsx",
  "src/app/page.js",
  "pages/index.tsx",
  "pages/index.jsx",
  "pages/index.js",
];

export type TaskSizeRoute =
  | { kind: "focused"; target: string; reason: string }
  | { kind: "planned"; reason: string };

const CROSS_CUTTING_TASK_PATTERN =
  /\b(across|multiple|all\s+(?:pages|components|files)|shared|provider|context|api|database|schema|migration|authentication|authorization|persist(?:ence|ent)?|integration|backend|frontend|configuration)\b/i;

function findExplicitTaskPaths(task: string, filePaths: string[]): string[] {
  const normalizedTask = task.replace(/\\/g, "/").toLowerCase();
  return filePaths.filter((path) => normalizedTask.includes(path.toLowerCase()));
}

/**
 * Select an unambiguous existing entry point for a request that explicitly
 * refers to a home or landing page. This is one evidence source used by the
 * generic task-size router, not a page-only planning mode.
 */
function findKnownPageEntryTarget(
  task: string,
  filePaths: string[]
): string | null {
  const normalizedTask = task.toLowerCase();
  const namesHomePage = /\b(home|landing)\s+page\b/.test(normalizedTask);
  const candidates = HOME_PAGE_PATHS.filter((path) => filePaths.includes(path));

  return namesHomePage && candidates.length === 1 ? candidates[0] : null;
}

/**
 * Route requests by scope before planning. Focused routing is only used when
 * the request maps to one existing file without cross-cutting intent; every
 * ambiguous or dependency-heavy request keeps the full LLM planner.
 */
export function routeTaskSize(task: string, filePaths: string[]): TaskSizeRoute {
  const explicitPaths = findExplicitTaskPaths(task, filePaths);
  if (explicitPaths.length > 1 || CROSS_CUTTING_TASK_PATTERN.test(task)) {
    return { kind: "planned", reason: "request is cross-cutting or names multiple files" };
  }
  if (explicitPaths.length === 1) {
    return { kind: "focused", target: explicitPaths[0], reason: "request names one repository file" };
  }

  const pageTarget = findKnownPageEntryTarget(task, filePaths);
  if (pageTarget) {
    return { kind: "focused", target: pageTarget, reason: "request maps to one known page entry point" };
  }
  return { kind: "planned", reason: "no unambiguous local target was found" };
}

/** Build a focused initial plan for a local, evidence-backed target. */
export function focusedTaskPlan(task: string, path: string): TaskPlan {
  const trimmed = task.trim() || "Implement the requested change";
  return {
    summary: `Start by implementing the requested change in ${path}; expand only if reading the code establishes a dependency.`,
    subtasks: [
      {
        title: trimmed,
        files: [path],
        acceptance: [
          `The requested change is implemented in ${path}, or any additional files justified by discovered dependencies.`,
          "Existing behavior is preserved.",
        ],
      },
    ],
    acceptanceCriteria: [
      `${trimmed} is implemented without unrelated changes.`,
      "Existing behavior is preserved.",
    ],
    createdAt: Date.now(),
  };
}

/** Minimal single-subtask plan used when planning is unavailable or unparseable. */
export function fallbackPlan(task: string): TaskPlan {
  const trimmed = task.trim() || "Implement the requested change";
  return {
    summary: trimmed,
    subtasks: [{ title: trimmed, files: [], acceptance: [trimmed] }],
    acceptanceCriteria: [trimmed],
    createdAt: Date.now(),
  };
}

/** Parse a TaskPlan out of a model response that should contain a JSON object. */
export function parsePlanJson(text: string): TaskPlan | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as {
      summary?: unknown;
      subtasks?: unknown;
      acceptanceCriteria?: unknown;
    };

    const subtasks = Array.isArray(parsed.subtasks)
      ? parsed.subtasks
          .filter(
            (s): s is { title: string; files?: unknown; acceptance?: unknown } =>
              !!s && typeof (s as { title?: unknown }).title === "string"
          )
          .map((s) => ({
            title: String(s.title),
            files: Array.isArray(s.files)
              ? s.files.filter((f): f is string => typeof f === "string")
              : [],
            acceptance: Array.isArray(s.acceptance)
              ? s.acceptance.filter((a): a is string => typeof a === "string")
              : [],
          }))
      : [];

    const acceptanceCriteria = Array.isArray(parsed.acceptanceCriteria)
      ? parsed.acceptanceCriteria.filter((a): a is string => typeof a === "string")
      : [];

    if (subtasks.length === 0 && acceptanceCriteria.length === 0) return null;

    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      subtasks,
      acceptanceCriteria,
      createdAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Produce a task plan from the description and the repository file list.
 * Never throws — returns a fallback single-subtask plan on any failure.
 */
export async function createTaskPlan(
  ai: Ai,
  task: string,
  filePaths: string[]
): Promise<TaskPlan> {
  const route = routeTaskSize(task, filePaths);
  if (route.kind === "focused") return focusedTaskPlan(task, route.target);

  const files = filePaths.slice(0, MAX_PLAN_FILES);
  const fileList = files.length
    ? files.map((f) => `- ${f}`).join("\n")
    : "(file list unavailable)";

  const prompt = `You are a senior software engineer planning a code change BEFORE any edits are made. Output ONLY valid JSON, no prose.

Repository files (reference EXACT paths from this list):
${fileList}

Task: ${task}

Respond with exactly this JSON shape:
{
  "summary": "one sentence describing the approach",
  "subtasks": [
    { "title": "what to do", "files": ["path/from/list"], "acceptance": ["observable check this subtask is done"] }
  ],
  "acceptanceCriteria": ["overall checks that prove the task is COMPLETELY and CORRECTLY implemented, including not breaking existing behavior"]
}

Rules:
- Reference only paths from the list. If a new file is required, describe it in the title and use a sensible path.
- acceptanceCriteria MUST be concrete and checkable (e.g. "the rendered page background becomes dark", "the existing font className is preserved", "no undefined CSS class is referenced", "the project still type-checks").
- Scope from evidence: default to one focused target when the requested behavior can be local. Add files/subtasks only when the request or a direct dependency requires them. This plan is an initial hypothesis; the executor may expand it after reading code proves a dependency.
- Keep it tight: 1-5 subtasks.`;

  try {
    const res = await (ai as unknown as {
      run: (model: string, opts: Record<string, unknown>) => Promise<unknown>;
    }).run(PLANNER_MODEL_ID, { prompt, max_tokens: 1024 });

    const text = extractWorkersAiText(res);

    return parsePlanJson(text) ?? fallbackPlan(task);
  } catch {
    return fallbackPlan(task);
  }
}

/** Render a plan as a prompt section for the executor. */
export function formatPlanForPrompt(plan: TaskPlan): string {
  const lines: string[] = [
    "IMPLEMENTATION PLAN (follow it; refine as you learn — do not blindly trust file guesses):",
  ];
  if (plan.summary) lines.push(`Summary: ${plan.summary}`);
  if (plan.subtasks.length) {
    lines.push("Subtasks:");
    plan.subtasks.forEach((s, i) => {
      const files = s.files.length ? ` [files: ${s.files.join(", ")}]` : "";
      lines.push(`${i + 1}. ${s.title}${files}`);
      for (const a of s.acceptance) lines.push(`   - acceptance: ${a}`);
    });
  }
  if (plan.acceptanceCriteria.length) {
    lines.push(
      "Acceptance criteria (ALL must hold before create_pull_request; the verifier checks these):"
    );
    for (const c of plan.acceptanceCriteria) lines.push(`- ${c}`);
  }
  return lines.join("\n");
}
