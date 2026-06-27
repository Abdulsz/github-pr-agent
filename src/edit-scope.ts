import type { TaskPlan } from "./types";

/**
 * Deferrable cross-cutting files. The agent tends to drift into theming and
 * global layout before completing the planned page-level target, producing
 * layout-only diffs that do not implement the task. We block these until at
 * least one planned primary file has been edited.
 */
const SECONDARY_PATH_PATTERN =
  /(^|\/)(layout\.[jt]sx?|globals\.css|theme\.[jt]sx?|_app\.[jt]sx?)$|(^|\/)public\//i;

/** Files the plan explicitly targets; the agent should edit these first. */
export function primaryPlanPaths(plan?: TaskPlan): string[] {
  if (!plan) return [];
  const paths = plan.subtasks.flatMap((subtask) => subtask.files);
  return [...new Set(paths.filter((path) => path.trim().length > 0))];
}

/** A secondary path is a cross-cutting file not named in the plan. */
export function isSecondaryPath(path: string, primaryPaths: string[]): boolean {
  if (primaryPaths.includes(path)) return false;
  return SECONDARY_PATH_PATTERN.test(path);
}

/**
 * Decide whether editing `path` is allowed yet. Secondary cross-cutting files
 * are blocked until at least one planned primary file has been edited. When the
 * plan names no files, nothing is blocked.
 */
export function isEditAllowed(
  path: string,
  plan: TaskPlan | undefined,
  editedPaths: ReadonlySet<string>
): { allowed: true } | { allowed: false; reason: string } {
  const primaryPaths = primaryPlanPaths(plan);
  if (primaryPaths.length === 0) return { allowed: true };
  if (!isSecondaryPath(path, primaryPaths)) return { allowed: true };

  const primaryEdited = primaryPaths.some((primary) =>
    editedPaths.has(primary)
  );
  if (primaryEdited) return { allowed: true };

  return {
    allowed: false,
    reason:
      `Editing "${path}" is blocked: it is a cross-cutting layout/theme/global file and ` +
      `you have not yet edited the planned target file(s): ${primaryPaths.join(", ")}. ` +
      `Implement the change in ${primaryPaths[0]} first, then expand here only if a real dependency requires it.`,
  };
}
