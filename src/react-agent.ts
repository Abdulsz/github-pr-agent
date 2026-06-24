/**
 * ReAct Agent - Full autonomous reasoning for GitHub PR creation
 *
 * Implements the ReAct paradigm (Reasoning + Acting) on top of
 * Cloudflare Workers AI's native function calling:
 * 1. Thought  - LLM reasons about what to do next
 * 2. Action   - Agent executes a tool (GitHub operation)
 * 3. Observe  - Agent processes the result and continues
 *
 * This version uses env.AI.run directly (no workers-ai-provider)
 * with traditional function calling and a small control loop.
 */

import type { PRRequest, TaskPlan } from "./types";
import type { CompareCommitsResult } from "./github-types";
import { createTaskPlan, formatPlanForPrompt } from "./planner";
import {
  LARGE_FILE_THRESHOLD,
  applySearchReplaceEdits,
  decodeGitHubFileContent,
  validateUpdateContent,
} from "./file-edits";
import {
  appendToReadCache,
  isSearchInReadContent,
} from "./file-text";
import {
  grepInFileContent,
  readFileSectionContent,
} from "./file-navigation";
import { verifyTaskCompletion } from "./pr-verifier";

/** Safe string for prompts/display; Workers AI or clients may send non-string. */
function safeStr(value: unknown): string {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

/**
 * LLMs sometimes stringify nested objects/arrays in function call arguments.
 * This helper parses a value that should be an array but might arrive as a
 * JSON string, and returns the parsed array or null if unparseable.
 */
function parseIfStringified<T>(value: unknown): T[] | null {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed as T[];
      } catch {
        // Not valid JSON
      }
    }
  }
  return null;
}

/** Unwrap the { type, value } scalar shape occasionally emitted by the model. */
export function normalizeToolArguments(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeToolArguments);
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 2 && keys.includes("type") && keys.includes("value")) {
    return normalizeToolArguments(record.value);
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, normalizeToolArguments(item)])
  );
}

export interface CodeSearchHit {
  path: string;
  fragments: string[];
}

/** GitHub API interface - methods used by ReAct tools */
export interface GitHubAPIForReAct {
  getRepoContents(owner: string, repo: string, path?: string): Promise<{ path: string; type: string }[]>;
  getRepoTree(owner: string, repo: string, ref: string): Promise<{ path: string; type: string }[]>;
  getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<{ content?: string; sha?: string }>;
  getRef(owner: string, repo: string, ref: string): Promise<{ object: { sha: string } }>;
  createRef(owner: string, repo: string, ref: string, sha: string): Promise<unknown>;
  createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string,
    sha?: string
  ): Promise<unknown>;
  createPullRequest(
    owner: string,
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string
  ): Promise<{ html_url: string; number: number }>;
  compareCommits(
    owner: string,
    repo: string,
    base: string,
    head: string
  ): Promise<CompareCommitsResult>;
  searchCode(
    owner: string,
    repo: string,
    query: string,
    perPage?: number
  ): Promise<CodeSearchHit[]>;
}

/** Context passed to tool executions */
export interface ReActContext {
  github: GitHubAPIForReAct;
  repoInfo: { owner: string; repo: string };
  request: PRRequest;
  addProgress: (msg: string) => void;
  workingBranch: string;
  readCache: Map<string, string>;
  fullFilePaths: Set<string>;
  /** Paths the agent has successfully committed edits to (via apply_file_edits / commit_files). */
  editedPaths: Set<string>;
  /** Paths observed from get_repo_structure listings; used to suggest recovery targets. */
  knownPaths: Set<string>;
  /** AD-004: task plan (subtasks + acceptance criteria), set before the loop runs. */
  plan?: TaskPlan;
  /** AD-004: persist the plan to agent state for visibility via /status. */
  recordPlan?: (plan: TaskPlan) => void;
}

function isValidationError(message: string): boolean {
  return (
    message.includes("Update rejected") ||
    message.includes("placeholder stub") ||
    message.includes("appears to be a placeholder")
  );
}

async function fetchFileText(
  ctx: ReActContext,
  path: string,
  ref?: string
): Promise<string> {
  const content = await ctx.github.getFileContent(
    ctx.repoInfo.owner,
    ctx.repoInfo.repo,
    path,
    ref ?? ctx.workingBranch
  );
  return decodeGitHubFileContent(content.content);
}

/**
 * Suggest real paths from knownPaths when the model references a missing file.
 * Prefers files sharing the same basename, then files under the same intended
 * directory, then a short sample of known files.
 */
function suggestKnownPaths(missingPath: string, ctx: ReActContext): string {
  const known = [...ctx.knownPaths];
  if (known.length === 0) return "";
  const base = missingPath.split("/").pop()?.toLowerCase() ?? "";
  const baseNoExt = base.replace(/\.[^.]+$/, "");
  const dir = missingPath.includes("/")
    ? missingPath.slice(0, missingPath.lastIndexOf("/")).toLowerCase()
    : "";

  const byBasename = known.filter((p) => {
    const b = p.split("/").pop()?.toLowerCase() ?? "";
    return b === base || b.replace(/\.[^.]+$/, "") === baseNoExt;
  });
  const byDir = dir
    ? known.filter((p) => p.toLowerCase().startsWith(dir + "/"))
    : [];

  const ranked = [...new Set([...byBasename, ...byDir])].slice(0, 15);
  const list = ranked.length ? ranked : known.slice(0, 15);
  return ` Valid paths you can use include: ${list.join(", ")}.`;
}

function assertSearchReadable(
  path: string,
  search: string,
  ctx: ReActContext
): void {
  const readContent = ctx.readCache.get(path);
  if (!readContent) {
    throw new Error(
      `You must read "${path}" first using read_file or read_file_section before apply_file_edits.`
    );
  }
  if (ctx.fullFilePaths.has(path)) return;
  if (!isSearchInReadContent(search, readContent)) {
    throw new Error(
      `Search string not found in previously read content for "${path}". ` +
        `Use grep_in_file to locate the code, then read_file_section around those lines before editing.`
    );
  }
}

/**
 * Internal representation of a ReAct tool for traditional function calling.
 */
type ReActTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  execute: (args: any) => Promise<unknown>;
};

/**
 * Create tools for the ReAct agent. Each tool wraps a GitHub operation
 * so the agent can autonomously explore the repo and create the PR.
 *
 * The `parameters` field follows the Workers AI traditional function
 * calling JSON schema format.
 */
function createReActTools(ctx: ReActContext, env: { AI: Ai }): ReActTool[] {
  return [
    {
      name: "get_repo_structure",
      description:
        "Get the file and directory structure of the repository. Returns a list of paths with their types (file or dir). Use this first to understand the project layout.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Subpath to list (e.g. 'src' or '' for root)",
          },
        },
        required: [],
      },
      execute: async ({ path }: { path?: string }) => {
        const effectivePath = path || "";
        ctx.addProgress(`Listing repository structure at ${effectivePath || "root"}...`);
        const contents = await ctx.github.getRepoContents(
          ctx.repoInfo.owner,
          ctx.repoInfo.repo,
          effectivePath
        );
        const structure = contents.map((item) => ({
          path: item.path,
          type: item.type,
        }));
        for (const item of structure) {
          if (item.type === "file") ctx.knownPaths.add(item.path);
        }
        ctx.addProgress(`Found ${structure.length} items`);
        return { structure };
      },
    },

    {
      name: "read_file",
      description:
        "Read the contents of a file from the repository. IMPORTANT: You MUST only use paths that were returned by get_repo_structure. NEVER guess or invent paths like 'public/index.html' - always call get_repo_structure first. Always read a file BEFORE modifying it to preserve existing code.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Full path to the file (e.g. 'index.html' or 'src/main.ts')",
          },
          ref: {
            type: "string",
            description: "Optional: branch/ref to read from (defaults to main or current branch)",
          },
        },
        required: ["path"],
      },
      execute: async ({ path, ref }: { path: string; ref?: string }) => {
        ctx.addProgress(`Reading ${path}${ref ? ` from ${ref}` : ""}...`);
        try {
          const text = await fetchFileText(ctx, path, ref);
          const isLarge = text.length > LARGE_FILE_THRESHOLD;
          if (isLarge) {
            ctx.addProgress(`File ${path} is very large (${text.length} chars)`);
          }
          if (isLarge) {
            const head = text.slice(0, 3000);
            const tail = text.slice(-1500);
            const excerpt = `${head}\n\n... [${text.length - 4500} chars omitted] ...\n\n${tail}`;
            appendToReadCache(ctx.readCache, path, excerpt);
            return {
              path,
              length: text.length,
              truncated: true,
              contentExcerpt: excerpt,
              recommendation:
                "Middle of file omitted. Use grep_in_file to find relevant lines, then read_file_section before apply_file_edits.",
            };
          }
          ctx.fullFilePaths.add(path);
          appendToReadCache(ctx.readCache, path, text);
          return {
            path,
            content: text,
            truncated: false,
            length: text.length,
          };
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          // If the file was not found, nudge the LLM back to get_repo_structure
          // so it stops guessing paths.
          if (errMsg.includes("404") || errMsg.includes("Not Found")) {
            throw new Error(
              `File "${path}" does not exist in the repository. ` +
              `Do NOT guess another path.` +
              suggestKnownPaths(path, ctx)
            );
          }
          throw new Error(`Failed to read ${path}: ${errMsg}`);
        }
      },
    },

    {
      name: "grep_in_file",
      description:
        "Search for a regex pattern in a single file. Returns matching line numbers and snippets. Use this to LOCATE code before read_file_section and apply_file_edits, especially in large files.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to search",
          },
          pattern: {
            type: "string",
            description: "Regex pattern (e.g. '<Box|return \\(|bgcolor')",
          },
          ref: {
            type: "string",
            description: "Optional branch/ref (defaults to working branch)",
          },
        },
        required: ["path", "pattern"],
      },
      execute: async ({
        path,
        pattern,
        ref,
      }: {
        path: string;
        pattern: string;
        ref?: string;
      }) => {
        ctx.addProgress(`Searching ${path} for /${pattern}/...`);
        let text: string;
        try {
          text = await fetchFileText(ctx, path, ref);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          if (errMsg.includes("404") || errMsg.includes("Not Found")) {
            throw new Error(
              `File "${path}" does not exist in the repository. Do NOT guess another path.` +
                suggestKnownPaths(path, ctx)
            );
          }
          throw error;
        }
        const result = grepInFileContent(text, pattern, path);
        ctx.addProgress(`Found ${result.matchCount} match(es) in ${path}`);
        return result;
      },
    },

    {
      name: "read_file_section",
      description:
        "Read a specific line range from a file (1-indexed, inclusive). Returns numbered lines. REQUIRED before apply_file_edits on large files — use after grep_in_file to load the exact region you will edit.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path",
          },
          startLine: {
            type: "number",
            description: "First line to read (1-indexed)",
          },
          endLine: {
            type: "number",
            description: "Last line to read (1-indexed, max 150 lines per call)",
          },
          ref: {
            type: "string",
            description: "Optional branch/ref (defaults to working branch)",
          },
        },
        required: ["path", "startLine", "endLine"],
      },
      execute: async ({
        path,
        startLine,
        endLine,
        ref,
      }: {
        path: string;
        startLine: number;
        endLine: number;
        ref?: string;
      }) => {
        ctx.addProgress(`Reading ${path} lines ${startLine}-${endLine}...`);
        const text = await fetchFileText(ctx, path, ref);
        const section = readFileSectionContent(text, path, startLine, endLine);
        appendToReadCache(ctx.readCache, path, section.content);
        return section;
      },
    },

    {
      name: "grep_in_repo",
      description:
        "Search code across the repository using GitHub code search. Use to find which files contain relevant patterns before grep_in_file and read_file_section.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Search terms or pattern (e.g. 'dark mode page Box')",
          },
        },
        required: ["pattern"],
      },
      execute: async ({ pattern }: { pattern: string }) => {
        ctx.addProgress(`Searching repo for "${pattern}"...`);
        try {
          const hits = await ctx.github.searchCode(
            ctx.repoInfo.owner,
            ctx.repoInfo.repo,
            pattern
          );
          if (hits.length === 0) {
            return {
              matchCount: 0,
              hits: [],
              hint: "No results. Try get_repo_structure to find candidate files, then grep_in_file on a specific path.",
            };
          }
          return { matchCount: hits.length, hits };
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          return {
            matchCount: 0,
            hits: [],
            hint: `Code search failed (${err}). Use get_repo_structure and grep_in_file instead.`,
          };
        }
      },
    },

    {
      name: "create_branch",
      description:
        "Create a new branch from the target branch. Must be called before committing any changes.",
      parameters: {
        type: "object",
        properties: {
          branchName: {
            type: "string",
            description: "Name for the new branch (e.g. 'feature/dark-mode')",
          },
          fromBranch: {
            type: "string",
            description: "Branch to create from (default: main)",
          },
        },
        required: ["branchName"],
      },
      execute: async ({
        branchName,
        fromBranch,
      }: {
        branchName: string;
        fromBranch?: string;
      }) => {
        const source = fromBranch || "main";
        ctx.addProgress(`Creating branch ${branchName} from ${source}...`);
        try {
          const targetRef = await ctx.github.getRef(
            ctx.repoInfo.owner,
            ctx.repoInfo.repo,
            source
          );
          await ctx.github.createRef(
            ctx.repoInfo.owner,
            ctx.repoInfo.repo,
            branchName,
            targetRef.object.sha
          );
          ctx.addProgress(`Branch ${branchName} created successfully`);
          return { success: true, branchName };
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          // If the branch already exists, treat it as success so we can continue.
          if (errMsg.includes("already exists") || errMsg.includes("422")) {
            ctx.addProgress(`Branch ${branchName} already exists, continuing...`);
            return { success: true, branchName, alreadyExists: true };
          }
          throw new Error(`Failed to create branch: ${errMsg}`);
        }
      },
    },

    {
      name: "apply_file_edits",
      description:
        "Apply targeted search/replace edits to an EXISTING file and commit the result. PREFERRED for modifying existing files, especially large ones (>8KB). Each edit replaces exactly one occurrence of 'search' with 'replace'. Search strings MUST come from read_file or read_file_section output.",
      parameters: {
        type: "object",
        properties: {
          branchName: {
            type: "string",
            description: "Branch to commit to",
          },
          path: {
            type: "string",
            description: "File path to update",
          },
          edits: {
            type: "array",
            description: "Ordered list of search/replace edits",
            items: {
              type: "object",
              properties: {
                search: {
                  type: "string",
                  description: "Exact substring to find (must match once)",
                },
                replace: {
                  type: "string",
                  description: "Replacement text",
                },
              },
              required: ["search", "replace"],
            },
          },
        },
        required: ["branchName", "path", "edits"],
      },
      execute: async (rawArgs: {
        branchName: string;
        path: string;
        edits: unknown;
      }) => {
        const { branchName, path } = rawArgs;
        const edits = parseIfStringified<{ search: string; replace: string }>(
          rawArgs.edits
        );

        if (!path?.trim()) {
          throw new Error('"path" must be a non-empty string.');
        }
        if (!edits?.length) {
          throw new Error(
            '"edits" must be a non-empty JSON array of { search, replace } objects.'
          );
        }

        for (const edit of edits) {
          assertSearchReadable(path, edit.search, ctx);
        }

        ctx.addProgress(`Applying ${edits.length} edit(s) to ${path}...`);

        const existing = await ctx.github.getFileContent(
          ctx.repoInfo.owner,
          ctx.repoInfo.repo,
          path,
          branchName
        );
        const original = decodeGitHubFileContent(existing.content);
        if (!original) {
          throw new Error(
            `File "${path}" is empty or not found on ${branchName}. Use commit_files with action "create" for new files.`
          );
        }

        const merged = applySearchReplaceEdits(original, edits);
        const validation = validateUpdateContent(original, merged);
        if (!validation.valid) {
          throw new Error(validation.error);
        }

        await ctx.github.createOrUpdateFile(
          ctx.repoInfo.owner,
          ctx.repoInfo.repo,
          path,
          merged,
          `update: ${path} - ${safeStr(ctx.request.description).slice(0, 50)}`,
          branchName,
          existing.sha
        );

        ctx.editedPaths.add(path);
        ctx.addProgress(`${path} updated successfully via apply_file_edits`);
        return {
          success: true,
          path,
          editsApplied: edits.length,
          originalLength: original.length,
          newLength: merged.length,
        };
      },
    },

    {
      name: "commit_files",
      description:
        "Commit one or more file changes to a branch. Use for NEW files or SMALL existing files (<8KB). For larger existing files, use apply_file_edits instead. For 'update' actions on small files, include the COMPLETE file content with modifications.",
      parameters: {
        type: "object",
        properties: {
          branchName: {
            type: "string",
            description: "Branch to commit to",
          },
          changes: {
            type: "array",
            description: "List of file changes to apply",
            items: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "File path to create or update",
                },
                content: {
                  type: "string",
                  description:
                    "Complete file content (for updates: existing code + modifications)",
                },
                action: {
                  type: "string",
                  enum: ["create", "update"],
                  description: "Whether to create a new file or update an existing one",
                },
              },
              required: ["path", "content", "action"],
            },
          },
        },
        required: ["branchName", "changes"],
      },
      execute: async (rawArgs: {
        branchName: string;
        changes: unknown;
      }) => {
        const branchName = rawArgs.branchName;
        // LLMs often stringify the changes array — parse it defensively.
        const changes = parseIfStringified<{ path: string; content: string; action: "create" | "update" }>(
          rawArgs.changes
        );

        if (!changes || changes.length === 0) {
          throw new Error(
            "No changes provided or the 'changes' value could not be parsed. " +
            "Ensure 'changes' is a JSON array (not a string) with entries like: " +
            '[{"path":"file.css","content":"body{background:black}","action":"update"}]'
          );
        }

        // Filter out malformed entries (LLM sometimes sends undefined paths)
        const validChanges = changes.filter((c) => {
          if (!c || typeof c.path !== "string" || !c.path.trim()) {
            ctx.addProgress(`Skipping invalid change entry (missing path)`);
            return false;
          }
          if (typeof c.content !== "string") {
            ctx.addProgress(`Skipping ${c.path}: missing content`);
            return false;
          }
          return true;
        });

        if (validChanges.length === 0) {
          throw new Error(
            "All change entries were invalid (missing path or content). " +
            "Each entry must have: path (string), content (string), action ('create' | 'update')."
          );
        }

        // Cap to a reasonable number to prevent runaway commits
        const MAX_CHANGES = 10;
        if (validChanges.length > MAX_CHANGES) {
          ctx.addProgress(
            `Warning: ${validChanges.length} changes requested, limiting to first ${MAX_CHANGES}. ` +
            `Commit in smaller batches if you need more.`
          );
        }
        const batch = validChanges.slice(0, MAX_CHANGES);

        const results: { path: string; status: string }[] = [];
        for (const change of batch) {
          ctx.addProgress(
            `${change.action === "create" ? "Creating" : "Updating"} ${
              change.path
            }...`
          );
          try {
            let sha: string | undefined;
            let existingContent = "";
            if (change.action === "update") {
              try {
                const existing = await ctx.github.getFileContent(
                  ctx.repoInfo.owner,
                  ctx.repoInfo.repo,
                  change.path,
                  branchName
                );
                sha = existing.sha;
                existingContent = decodeGitHubFileContent(existing.content);
                ctx.addProgress(`Found existing file ${change.path}, updating...`);

                const validation = validateUpdateContent(
                  existingContent,
                  change.content
                );
                if (!validation.valid) {
                  throw new Error(validation.error);
                }
              } catch (e) {
                if (e instanceof Error && isValidationError(e.message)) {
                  throw e;
                }
                ctx.addProgress(
                  `File ${change.path} not found on ${branchName}, will create instead`
                );
              }
            }
            await ctx.github.createOrUpdateFile(
              ctx.repoInfo.owner,
              ctx.repoInfo.repo,
              change.path,
              change.content,
              `${change.action}: ${change.path} - ${safeStr(
                ctx.request.description
              ).slice(0, 50)}`,
              branchName,
              sha
            );
            ctx.editedPaths.add(change.path);
            results.push({ path: change.path, status: "ok" });
            ctx.addProgress(`${change.path} committed successfully`);
          } catch (e) {
            const err = e instanceof Error ? e.message : String(e);
            results.push({ path: change.path, status: `error: ${err}` });
            ctx.addProgress(`Error: ${change.path} failed - ${err}`);
          }
        }
        const successCount = results.filter((r) => r.status === "ok").length;
        const errorCount = results.filter((r) =>
          r.status.startsWith("error")
        ).length;
        ctx.addProgress(
          `Committed ${successCount} file(s), ${errorCount} error(s)`
        );
        return { results, successCount, errorCount };
      },
    },

    {
      name: "create_pull_request",
      description:
        "Create a pull request from a branch to the target branch. Call this after all files are committed.",
      parameters: {
        type: "object",
        properties: {
          branchName: {
            type: "string",
            description: "Source branch for the PR",
          },
          targetBranch: {
            type: "string",
            description: "Target branch (default: main)",
          },
          title: {
            type: "string",
            description: "PR title (defaults to description)",
          },
        },
        required: ["branchName"],
      },
      execute: async ({
        branchName,
        targetBranch,
        title,
      }: {
        branchName: string;
        targetBranch?: string;
        title?: string;
      }) => {
        const base = targetBranch || "main";
        if (ctx.editedPaths.size === 0) {
          throw new Error(
            "No successful file edits were made in this run. Use apply_file_edits or commit_files to make a real change before creating a PR."
          );
        }
        ctx.addProgress("Checking for commits between base and feature branch...");
        let cmp: CompareCommitsResult;
        try {
          cmp = await ctx.github.compareCommits(
            ctx.repoInfo.owner,
            ctx.repoInfo.repo,
            base,
            branchName
          );
          if (typeof cmp.ahead_by !== "number") {
            throw new Error("Could not compare branches");
          }
          if (cmp.ahead_by <= 0) {
            throw new Error(
              `No commits between ${base} and ${branchName}. Use commit_files or apply_file_edits to create at least one commit before creating a PR.`
            );
          }
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          throw new Error(`Preflight check failed: ${err}`);
        }

        ctx.addProgress("Verifying changes match the requested task...");
        const patchFiles = (cmp.files ?? []).map((f) => ({
          path: f.filename,
          patch: f.patch,
          additions: f.additions,
          deletions: f.deletions,
        }));
        const verification = await verifyTaskCompletion(
          env.AI,
          safeStr(ctx.request.description),
          patchFiles,
          ctx.plan?.acceptanceCriteria
        );
        if (!verification.pass) {
          // Return a structured, non-terminal failure so the control loop can
          // inject targeted recovery guidance and let the agent try again,
          // rather than surfacing this as a generic (potentially terminal) error.
          ctx.addProgress(`Verification failed: ${verification.reason}`);
          return {
            success: false,
            verificationFailed: true,
            reason: verification.reason,
            suggestedNext: verification.suggestedNext,
            changedFiles: patchFiles.map((f) => f.path),
          };
        }
        ctx.addProgress("Verification passed — creating pull request...");
        try {
          const pr = await ctx.github.createPullRequest(
            ctx.repoInfo.owner,
            ctx.repoInfo.repo,
            title || safeStr(ctx.request.description).slice(0, 100),
            `## Summary\n\n${safeStr(
              ctx.request.description
            )}\n\n---\n*Created by ReAct GitHub PR Agent on Cloudflare*`,
            branchName,
            base
          );
          ctx.addProgress("Pull request created successfully!");
          return {
            success: true,
            prUrl: pr.html_url,
            branchName,
            prNumber: pr.number,
          };
        } catch (prError) {
          const prErrMsg = prError instanceof Error ? prError.message : String(prError);
          // If a PR already exists for this branch, treat it as success
          if (prErrMsg.includes("already exists") || prErrMsg.includes("A pull request already exists")) {
            ctx.addProgress("A pull request already exists for this branch - treating as success.");
            return {
              success: true,
              prUrl: `https://github.com/${ctx.repoInfo.owner}/${ctx.repoInfo.repo}/pulls`,
              branchName,
              alreadyExists: true,
            };
          }
          throw prError;
        }
      },
    },
  ];
}

export type ReActTools = ReturnType<typeof createReActTools>;

const REACT_MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_STEPS = 30;
/** Max consecutive identical tool calls before we inject a nudge message. */
const MAX_REPEATED_CALLS = 2;
/** Max times create_pull_request can fail verification before we give up. */
const MAX_VERIFY_RETRIES = 3;
/** Max times the model may stop emitting tool calls (without a PR) before we give up. */
const MAX_NO_TOOL_NUDGES = 3;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call Workers AI with simple retry logic for transient errors like 502s.
 */
async function callModelWithRetry(
  ai: Ai,
  modelId: string,
  options: Record<string, unknown>,
  maxRetries = 3
): Promise<any> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Cast to any to avoid tight AiModels type coupling; model IDs are validated at runtime.
      return await (ai as any).run(modelId, options);
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      // Handle transient upstream/502-style failures with a short backoff.
      const isTransient =
        msg.includes("502") ||
        msg.includes("Bad Gateway") ||
        msg.includes("upstream") ||
        msg.includes("temporarily") ||
        msg.includes("1031") ||
        msg.includes("overloaded") ||
        msg.includes("rate limit");
      if (!isTransient || attempt === maxRetries) {
        throw error;
      }
      const delay = 1000 * (attempt + 1);
      console.warn(
        `Workers AI call failed (attempt ${attempt + 1}/${maxRetries + 1}): ${msg} - retrying in ${delay}ms`
      );
      await sleep(delay);
    }
  }
  throw lastError ?? new Error("Unknown error calling Workers AI");
}

/**
 * Ensure the working branch exists, creating it from the target branch if needed.
 */
async function ensureBranchExists(
  ctx: ReActContext,
  sourceBranch: string,
  workingBranch: string
) {
  ctx.addProgress(
    `Ensuring working branch ${workingBranch} exists (source: ${sourceBranch})...`
  );
  try {
    // If this succeeds, branch already exists.
    await ctx.github.getRef(
      ctx.repoInfo.owner,
      ctx.repoInfo.repo,
      workingBranch
    );
    ctx.addProgress(`Branch ${workingBranch} already exists.`);
    return;
  } catch {
    // Fall through and attempt to create from sourceBranch.
  }

  const baseRef = await ctx.github.getRef(
    ctx.repoInfo.owner,
    ctx.repoInfo.repo,
    sourceBranch
  );
  await ctx.github.createRef(
    ctx.repoInfo.owner,
    ctx.repoInfo.repo,
    workingBranch,
    baseRef.object.sha
  );
  ctx.addProgress(`Branch ${workingBranch} created from ${sourceBranch}.`);
}

/**
 * Pick the most likely file the agent still needs to edit after a verification
 * failure. Prefers Next.js App Router / Pages Router home-page entry points that
 * the agent has seen (in repo structure or read cache) but not yet edited, then
 * falls back to any read-but-unedited file.
 */
function pickRecoveryTarget(ctx: ReActContext): string | null {
  const homePageCandidates = [
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
  const seen = new Set<string>([...ctx.knownPaths, ...ctx.readCache.keys()]);
  for (const candidate of homePageCandidates) {
    if (seen.has(candidate) && !ctx.editedPaths.has(candidate)) return candidate;
  }
  for (const path of ctx.readCache.keys()) {
    if (!ctx.editedPaths.has(path)) return path;
  }
  return null;
}

/**
 * Build a targeted recovery message for the agent after create_pull_request
 * fails verification. Combines the verifier's reason/suggestedNext with a
 * concrete file target and ready-to-run grep/read/edit commands.
 */
function buildRecoveryMessage(
  ctx: ReActContext,
  reason: string,
  suggestedNext: string,
  changedFiles: string[],
  attempt: number,
  maxAttempts: number
): string {
  const target = pickRecoveryTarget(ctx);
  const lines = [
    `SYSTEM: Your pull request was REJECTED by verification (attempt ${attempt}/${maxAttempts}). A PR was NOT created.`,
    `Reason: ${reason}`,
    `Suggested next step: ${suggestedNext}`,
    "",
    `Diff so far only touched: ${changedFiles.length ? changedFiles.join(", ") : "(no files)"}.`,
    "Do NOT call create_pull_request again until you have made a real change that implements the task.",
  ];
  if (target) {
    lines.push(
      "",
      `The likely real target you have NOT edited yet is "${target}". Work it like this:`,
      `1. grep_in_file("${target}", "<|return \\\\(|className|style")`,
      `2. read_file_section("${target}", <line near a match>, <that line + 60>)`,
      `3. apply_file_edits on "${target}" with the actual UI/code change (search strings copied from the read output).`
    );
  } else {
    lines.push(
      "",
      "Re-run get_repo_structure to find the real source file for this task, then grep_in_file + read_file_section before apply_file_edits."
    );
  }
  return lines.join("\n");
}

/**
 * Turn an ambiguous patch error into an immediate, concrete next action. The
 * patch helper already reports candidate lines; repeating the same hunk wastes
 * the limited ReAct step budget, so force a targeted re-read and multi-line
 * anchor instead.
 */
export function buildAmbiguousEditRecoveryMessage(
  path: string,
  errorMessage: string
): string | null {
  const match = errorMessage.match(/at lines ([\d,\s]+)/);
  if (!match) return null;
  const lines = match[1]
    .split(",")
    .map((line) => Number(line.trim()))
    .filter((line) => Number.isInteger(line) && line > 0);
  if (!lines.length) return null;

  const start = Math.max(1, lines[0] - 6);
  const end = lines[0] + 12;
  return [
    `SYSTEM: Your patch search in "${path}" was ambiguous at lines ${lines.join(", ")}. Do NOT retry the same search.`,
    `Read the candidate that implements the task: read_file_section("${path}", ${start}, ${end}).`,
    "Then retry apply_file_edits with a multi-line search copied from that read output, including a distinctive parent element and at least one surrounding line so it matches exactly once.",
  ].join("\n");
}

function buildNoEditRecoveryMessage(ctx: ReActContext): string {
  const target = ctx.plan?.subtasks.flatMap((subtask) => subtask.files)[0];
  if (target) {
    return [
      "SYSTEM: PR creation is blocked because you have not committed an edit. Do NOT call create_pull_request again yet.",
      `Your next action is grep_in_file("${target}", "<Box|return \\\\(") — do not search for the natural-language task phrase.`,
      "Then read_file_section around the relevant UI match and use apply_file_edits with a unique multi-line search copied from that output.",
    ].join("\n");
  }
  return "SYSTEM: PR creation is blocked because you have not committed an edit. Locate, read, and edit a task-relevant file before trying again.";
}

const MAX_TREE_FILES = 250;

/**
 * Load the full recursive file tree once at startup. Seeds `knownPaths` so the
 * model sees real paths (and the recovery/404 logic can suggest them) instead
 * of guessing nonexistent files like "app/pages/index.js". Returns a formatted
 * file-list section for the prompt, or "" if the tree could not be loaded.
 */
async function loadRepoTreeSection(
  ctx: ReActContext,
  ref: string
): Promise<string> {
  try {
    const tree = await ctx.github.getRepoTree(
      ctx.repoInfo.owner,
      ctx.repoInfo.repo,
      ref
    );
    const files = tree.filter((t) => t.type === "file").map((t) => t.path);
    for (const f of files) ctx.knownPaths.add(f);
    if (!files.length) return "";
    const shown = files.slice(0, MAX_TREE_FILES);
    const omitted = files.length - shown.length;
    ctx.addProgress(`Loaded ${files.length} file path(s) from the repo tree.`);
    return (
      `\nRepository files (these are the ONLY valid paths — use them EXACTLY, never invent paths):\n` +
      shown.map((f) => `- ${f}`).join("\n") +
      (omitted > 0 ? `\n- ... and ${omitted} more file(s)` : "") +
      "\n"
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ctx.addProgress(`Could not load repo tree (${msg}); will explore manually.`);
    return "";
  }
}

/**
 * Run the ReAct agent to autonomously create a PR using traditional function
 * calling with env.AI.run and a lightweight control loop.
 */
export async function runReActAgent(
  env: { AI: Ai },
  ctx: ReActContext
): Promise<{
  success: boolean;
  text?: string;
  prUrl?: string;
  branchName?: string;
  error?: string;
  steps?: number;
}> {
  const description = safeStr(ctx.request.description);

  const targetBranch = ctx.request.targetBranch || "main";
  const suggestedBranchName =
    ctx.request.branchName ||
    `feature/${Date.now()}-${description
      .slice(0, 20)
      .replace(/[^a-z0-9]/gi, "-")
      .toLowerCase()}`;

  ctx.workingBranch = suggestedBranchName;
  if (!ctx.readCache) ctx.readCache = new Map();
  if (!ctx.fullFilePaths) ctx.fullFilePaths = new Set();
  if (!ctx.editedPaths) ctx.editedPaths = new Set();
  if (!ctx.knownPaths) ctx.knownPaths = new Set();

  const tools = createReActTools(ctx, env);
  const toolSpecs = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  // Load the full file tree up-front so the model never has to guess paths.
  const repoTreeSection = await loadRepoTreeSection(ctx, targetBranch);

  // AD-004: decompose the task into a plan with acceptance criteria before
  // editing. Persist it and inject it into the executor prompt; the verifier
  // later checks the diff against plan.acceptanceCriteria.
  ctx.addProgress("Planning the change before editing...");
  const plan = await createTaskPlan(env.AI, description, [...ctx.knownPaths]);
  ctx.plan = plan;
  ctx.recordPlan?.(plan);
  ctx.addProgress(
    `Plan ready: ${plan.subtasks.length} subtask(s), ${plan.acceptanceCriteria.length} acceptance criteria.`
  );
  const planSection = `\n${formatPlanForPrompt(plan)}\n`;

  const systemPrompt = `You are an autonomous GitHub PR agent. Create a pull request based on the user's description.

WORKFLOW (follow strictly in order):
1. EXPLORE: The full list of repository files is provided in the user message. Use ONLY those exact paths. Call get_repo_structure(path) only if you need to confirm a directory's contents. NEVER invent paths that are not in the provided list.
2. LOCATE: Find relevant files and code regions using grep_in_repo and/or grep_in_file.
3. READ: For large files (>8KB), read_file returns only head/tail — you MUST call read_file_section on the lines you will edit before patching.
4. EDIT: apply_file_edits for existing files (especially large ones); commit_files for NEW or small files (<8KB).
5. VERIFY: create_pull_request runs automatic verification. If rejected, read more context, fix edits, and retry.

LOCATE + READ (critical for large files):
- grep_in_file(path, "<Box|return \\(") → get line numbers
- read_file_section(path, startLine, endLine) → numbered content for exact search strings
- apply_file_edits search strings MUST come from read_file or read_file_section output

APPLY_FILE_EDITS FORMAT:
- Each edit: { "search": "exact substring from read output", "replace": "new text" }
- search must match EXACTLY ONCE in the file
- Example:
  apply_file_edits({
    "branchName": "${suggestedBranchName}",
    "path": "app/page.js",
    "edits": [
      { "search": "<Box>", "replace": "<Box sx={{ bgcolor: 'black' }}>" }
    ]
  })

COMMIT_FILES FORMAT (new or small files only):
- "changes" MUST be a proper JSON array, NOT a string.
- Each element: {"path":"file.css","content":"...full file content...","action":"update"}

FRAMEWORK ROUTING (Next.js / React):
- In a Next.js 13+ App Router repo (an "app/" or "src/app/" directory exists), the home/landing page is "app/page.{js,jsx,tsx}" (layout is "app/layout.*"). The Pages Router equivalent is "pages/index.*".
- NEVER create or edit "public/index.html" in an App Router project — it is not the rendered page and will be rejected.
- If the task mentions "home", "landing", or "page" and the structure contains "app/page.*" (or "pages/index.*"), you MUST grep_in_file that page file and read_file_section it before editing "app/layout.*" or anything under "public/".

FILE UPDATE RULES:
- ALWAYS read before modifying. Preserve ALL existing code.
- NEVER use "// ..." or placeholder comments — they will be rejected.
- Do NOT patch imports/comments when the task is about UI/styling — edit the JSX/CSS.

ERROR RECOVERY:
- If create_pull_request fails verification, follow suggestedNext (grep → read_file_section → apply_file_edits).
- If commit_files is rejected as truncated, switch to apply_file_edits.
- NEVER repeat the same failing tool call with the same arguments.

PR RULE:
- You MUST make at least one successful apply_file_edits or commit_files change before create_pull_request. Do not use PR creation as a preflight probe.
- create_pull_request verifies the diff matches the task. Trivial or unrelated edits will be rejected.`;

  const userPrompt = `Create a pull request for this repository.

Repository: ${ctx.repoInfo.owner}/${ctx.repoInfo.repo}
User request: ${description}

Target branch: ${targetBranch}
Feature branch (already created for you): ${suggestedBranchName}
${repoTreeSection}${planSection}
Treat the plan as an initial scope hypothesis, not a rigid file limit. Start with its target file(s). Expand to another listed file only after locating and reading evidence of a real dependency; do not add files merely because a task sounds broad. Only after ALL acceptance criteria are satisfied, open the pull request. Do NOT read or edit paths that are not in the list.`;

  type Message = { role: "system" | "user" | "assistant" | "tool"; content: string; name?: string };

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  let prOutput:
    | {
        prUrl?: string;
        branchName?: string;
        success?: boolean;
      }
    | undefined;

  // Track consecutive repeated tool calls for loop detection.
  let lastToolCallSignature = "";
  let repeatCount = 0;

  // Track verification failures so they don't silently exhaust the step budget.
  let verifyFailures = 0;
  let recoveryMessage: string | null = null;
  let giveUpAfterVerify = false;

  // Track turns where the model stopped emitting tool calls without finishing
  // the PR, so we can nudge it to continue instead of ending prematurely.
  let noToolCallNudges = 0;

  try {
    // Make sure the working branch exists before the loop so create_pull_request
    // always has a valid "head" reference.
    await ensureBranchExists(ctx, targetBranch, suggestedBranchName);

    for (let step = 0; step < MAX_STEPS; step++) {
      const result = await callModelWithRetry(env.AI, REACT_MODEL_ID, {
        messages,
        tools: toolSpecs,
        max_tokens: 8192,
      });

      const responseText =
        typeof result.response === "string"
          ? result.response
          : result.response != null
          ? String(result.response)
          : "";

      if (responseText) {
        messages.push({ role: "assistant", content: responseText });
      }

      const toolCalls: { name: string; arguments: any }[] =
        Array.isArray(result.tool_calls) ? result.tool_calls : [];

      if (!toolCalls.length) {
        // The model stopped calling tools. Only treat this as "done" if a PR
        // was actually created. Otherwise the agent quit early (often after a
        // tool error) — nudge it to continue, up to a bounded number of times.
        if (prOutput?.success) break;
        if (noToolCallNudges >= MAX_NO_TOOL_NUDGES) {
          ctx.addProgress(
            `Model stopped emitting tool calls ${noToolCallNudges + 1} time(s) without creating a PR. Giving up.`
          );
          break;
        }
        noToolCallNudges++;
        ctx.addProgress(
          `Model returned no tool call but no PR exists yet — nudging it to continue (${noToolCallNudges}/${MAX_NO_TOOL_NUDGES}).`
        );
        messages.push({
          role: "user",
          content:
            "SYSTEM: You stopped without creating a pull request. You are NOT done until create_pull_request succeeds. " +
            "Do not reply with plain text — call a tool now.\n" +
            "- If your last tool call errored, fix the arguments and retry (e.g. apply_file_edits needs a non-empty edits array of { search, replace }).\n" +
            "- If you have not edited the real target file yet, use grep_in_file then read_file_section to load it, then apply_file_edits.\n" +
            "- Once a real change is committed, call create_pull_request.",
        });
        continue;
      }

      // --- Loop detection ---
      // Build a signature of the current tool calls to detect repetition.
      const callSignature = toolCalls
        .map((c) => `${c.name}:${JSON.stringify(c.arguments ?? {})}`)
        .join("|");

      if (callSignature === lastToolCallSignature) {
        repeatCount++;
      } else {
        repeatCount = 0;
        lastToolCallSignature = callSignature;
      }

      if (repeatCount >= MAX_REPEATED_CALLS) {
        ctx.addProgress(
          `Loop detected: "${toolCalls[0]?.name}" called ${repeatCount + 1} times with same args. Injecting guidance.`
        );
        // Inject a system nudge to break the loop and move forward.
        messages.push({
          role: "user",
          content:
            `SYSTEM: You are stuck in a loop calling ${toolCalls[0]?.name} repeatedly. ` +
            `STOP calling it again. Instead:\n` +
            `- Use grep_in_file / read_file_section to locate and load the code you need to edit.\n` +
            `- Use apply_file_edits (existing files) or read_file then commit_files (new/small files).\n` +
            `- If create_pull_request failed verification, follow the suggested next step in the error.\n` +
            `- If commit_files was rejected, use apply_file_edits with exact search/replace hunks.\n` +
            `- Do NOT call get_repo_structure again unless you need a new path.`,
        });
        repeatCount = 0;
        lastToolCallSignature = "";
        continue; // Re-run the model with the nudge, skip executing the repeated calls.
      }

      for (const call of toolCalls) {
        const toolDef = tools.find((t) => t.name === call.name);
        if (!toolDef) {
          const msg = `Unknown tool requested by model: ${call.name}`;
          ctx.addProgress(msg);
          messages.push({
            role: "tool",
            name: call.name,
            content: JSON.stringify({ error: msg }),
          });
          continue;
        }

        // Defensively parse arguments — LLMs sometimes stringify the whole object.
        let args = call.arguments ?? {};
        if (typeof args === "string") {
          try {
            args = JSON.parse(args);
          } catch {
            ctx.addProgress(`Warning: Could not parse stringified arguments for ${call.name}`);
          }
        }
        args = normalizeToolArguments(args);
        ctx.addProgress(
          `Tool: ${call.name}(${JSON.stringify(args).slice(0, 80)}...)`
        );

        try {
          const output = await toolDef.execute(args);
          messages.push({
            role: "tool",
            name: call.name,
            content: JSON.stringify(output),
          });

          if (call.name === "create_pull_request" && output && typeof output === "object") {
            const out = output as any;
            if (out.verificationFailed) {
              verifyFailures++;
              if (verifyFailures > MAX_VERIFY_RETRIES) {
                giveUpAfterVerify = true;
                ctx.addProgress(
                  `Verification failed ${verifyFailures} time(s) (limit ${MAX_VERIFY_RETRIES}). Stopping.`
                );
              } else {
                recoveryMessage = buildRecoveryMessage(
                  ctx,
                  safeStr(out.reason),
                  safeStr(out.suggestedNext),
                  Array.isArray(out.changedFiles) ? out.changedFiles : [],
                  verifyFailures,
                  MAX_VERIFY_RETRIES
                );
                ctx.addProgress(
                  `Injecting recovery guidance after verification failure (attempt ${verifyFailures}/${MAX_VERIFY_RETRIES}).`
                );
              }
            } else {
              prOutput = {
                success: out.success,
                prUrl: out.prUrl,
                branchName: out.branchName,
              };
            }
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          ctx.addProgress(`Tool error in ${call.name}: ${errMsg}`);
          messages.push({
            role: "tool",
            name: call.name,
            content: JSON.stringify({ error: errMsg }),
          });
          if (call.name === "apply_file_edits") {
            const path = typeof args === "object" && args ? (args as { path?: unknown }).path : undefined;
            if (typeof path === "string") {
              const recovery = buildAmbiguousEditRecoveryMessage(path, errMsg);
              if (recovery) {
                recoveryMessage = recovery;
                ctx.addProgress("Injecting recovery guidance after ambiguous file edit.");
              }
            }
          }
          if (
            call.name === "create_pull_request" &&
            errMsg.includes("No successful file edits were made in this run")
          ) {
            recoveryMessage = buildNoEditRecoveryMessage(ctx);
            ctx.addProgress("Injecting guidance after premature PR creation.");
          }
        }
      }

      // If the PR was successfully created, stop immediately — no more steps needed.
      if (prOutput?.success) {
        ctx.addProgress("PR created — finishing agent loop.");
        break;
      }

      // Verification exhausted its retry budget — stop before burning steps.
      if (giveUpAfterVerify) {
        break;
      }

      // Inject targeted recovery guidance as a user message so the agent loops
      // back to grep/read/edit the real target instead of retrying blindly.
      if (recoveryMessage) {
        messages.push({ role: "user", content: recoveryMessage });
        recoveryMessage = null;
        // Reset loop detection so the recovery turn isn't flagged as a repeat.
        lastToolCallSignature = "";
        repeatCount = 0;
      }
    }

    const failureError = giveUpAfterVerify
      ? `Verification rejected the changes ${verifyFailures} time(s); no PR was created. The agent could not produce a diff that implements the task.`
      : !prOutput?.prUrl
      ? "ReAct agent did not complete PR creation"
      : undefined;

    return {
      success: prOutput?.success ?? false,
      text: undefined,
      prUrl: prOutput?.prUrl,
      branchName: prOutput?.branchName ?? suggestedBranchName,
      steps: undefined,
      error: prOutput?.success ? undefined : failureError,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    ctx.addProgress(`ReAct error: ${errMsg}`);
    if (error instanceof Error && error.stack) {
      console.error("ReAct agent error stack:", error.stack);
    }
    return {
      success: false,
      error: errMsg,
      steps: 0,
    };
  }
}
