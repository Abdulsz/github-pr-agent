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

import type { PRRequest } from "./types";
import {
  LARGE_FILE_THRESHOLD,
  applySearchReplaceEdits,
  decodeGitHubFileContent,
  validateUpdateContent,
} from "./file-edits";

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

/** GitHub API interface - methods used by ReAct tools */
export interface GitHubAPIForReAct {
  getRepoContents(owner: string, repo: string, path?: string): Promise<{ path: string; type: string }[]>;
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
  ): Promise<{ ahead_by: number; behind_by: number; total_commits: number } & Record<string, unknown>>;
}

/** Context passed to tool executions */
export interface ReActContext {
  github: GitHubAPIForReAct;
  repoInfo: { owner: string; repo: string };
  request: PRRequest;
  addProgress: (msg: string) => void;
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
function createReActTools(ctx: ReActContext): ReActTool[] {
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
          const content = await ctx.github.getFileContent(
            ctx.repoInfo.owner,
            ctx.repoInfo.repo,
            path,
            ref
          );
          const text = decodeGitHubFileContent(content.content);
          const isLarge = text.length > LARGE_FILE_THRESHOLD;
          if (isLarge) {
            ctx.addProgress(`File ${path} is very large (${text.length} chars)`);
          }
          // Large files: return excerpt only so the model can plan apply_file_edits
          // without blowing the context window. apply_file_edits fetches full content from GitHub.
          if (isLarge) {
            const head = text.slice(0, 3000);
            const tail = text.slice(-1500);
            return {
              path,
              length: text.length,
              truncated: true,
              contentExcerpt: `${head}\n\n... [${text.length - 4500} chars omitted — use exact substrings from this excerpt for apply_file_edits] ...\n\n${tail}`,
              recommendation:
                "use apply_file_edits instead of commit_files for this file",
            };
          }
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
              `Do NOT guess another path. Call get_repo_structure to list the actual files and directories, then use one of the returned paths.`
            );
          }
          throw new Error(`Failed to read ${path}: ${errMsg}`);
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
        "Apply targeted search/replace edits to an EXISTING file and commit the result. PREFERRED for modifying existing files, especially large ones (>8KB). Each edit replaces exactly one occurrence of 'search' with 'replace'. Copy search strings exactly from read_file output.",
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
                if (
                  e instanceof Error &&
                  e.message.includes("Update rejected")
                ) {
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
        // Preflight: ensure there are commits ahead on the feature branch vs base
        ctx.addProgress("Checking for commits between base and feature branch...");
        try {
          const cmp = await ctx.github.compareCommits(
            ctx.repoInfo.owner,
            ctx.repoInfo.repo,
            base,
            branchName
          );
          if (!cmp || typeof (cmp as any).ahead_by !== "number") {
            throw new Error("Could not compare branches");
          }
          if ((cmp as any).ahead_by <= 0) {
            throw new Error(
              `No commits between ${base} and ${branchName}. Use commit_files or apply_file_edits to create at least one commit before creating a PR.`
            );
          }
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          throw new Error(`Preflight check failed: ${err}`);
        }
        ctx.addProgress("Creating pull request...");
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
const MAX_STEPS = 15;
/** Max consecutive identical tool calls before we inject a nudge message. */
const MAX_REPEATED_CALLS = 2;

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
  const tools = createReActTools(ctx);
  const toolSpecs = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  const description = safeStr(ctx.request.description);

  const targetBranch = ctx.request.targetBranch || "main";
  const suggestedBranchName =
    ctx.request.branchName ||
    `feature/${Date.now()}-${description
      .slice(0, 20)
      .replace(/[^a-z0-9]/gi, "-")
      .toLowerCase()}`;

  const systemPrompt = `You are an autonomous GitHub PR agent. Create a pull request based on the user's description.

WORKFLOW (follow strictly in order):
1. Call get_repo_structure("") to list the root. MANDATORY first step.
2. Optionally explore subdirectories with get_repo_structure if needed.
3. Call read_file on every file you plan to modify.
4. Commit changes:
   - EXISTING files (especially >8KB): use apply_file_edits with search/replace hunks.
   - NEW files or small files (<8KB): use commit_files.
5. Call create_pull_request to open the PR.

APPLY_FILE_EDITS FORMAT (preferred for existing files):
- Each edit: { "search": "exact substring from file", "replace": "new text" }
- search must match EXACTLY ONCE in the file — copy verbatim from read_file.
- Example:
  apply_file_edits({
    "branchName": "feature/my-change",
    "path": "app/page.js",
    "edits": [
      { "search": "<Box>", "replace": "<Box sx={{ bgcolor: 'black' }}>" }
    ]
  })

COMMIT_FILES FORMAT (new or small files only):
- "changes" MUST be a proper JSON array, NOT a string.
- Each element: {"path":"file.css","content":"...full file content...","action":"update"}
- For "update": include the COMPLETE file content (original + your changes).
- For "create": include the full new file content.

FILE UPDATE RULES:
- ALWAYS read_file before modifying. Preserve ALL existing code.
- NEVER use "// ..." or placeholder comments — they will be rejected.
- For large files, read_file returns contentExcerpt + recommendation — use apply_file_edits with exact substrings from the excerpt.

ERROR RECOVERY:
- If a tool fails, read the error and fix the issue. Do NOT repeat the same failing call.
- If commit_files is rejected as truncated, switch to apply_file_edits.
- Do NOT call get_repo_structure more than twice total. You already have the structure.
- NEVER repeat the same tool call with the same arguments. Try a different approach.

PATH RULES:
- ONLY use paths returned by get_repo_structure. Never guess or invent paths.
- If read_file returns 404, use get_repo_structure to find the correct path.

PR RULE:
- Do NOT call create_pull_request until commit_files or apply_file_edits has succeeded.`;

  const userPrompt = `Create a pull request for this repository.

Repository: ${ctx.repoInfo.owner}/${ctx.repoInfo.repo}
User request: ${description}

Target branch: ${targetBranch}
Feature branch (already created for you): ${suggestedBranchName}

Start by exploring the repository structure, then implement the changes, commit your changes to the feature branch, and only then open the pull request.`;

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
        // No more tool calls – we are done.
        break;
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
            `- If you need to modify a file, use apply_file_edits (existing files) or read_file then commit_files (new/small files).\n` +
            `- If commit_files was rejected as truncated, use apply_file_edits with exact search/replace hunks.\n` +
            `- If commit_files previously failed, check that "changes" is a proper JSON array of objects, each with "path", "content", and "action" keys.\n` +
            `- If you have already committed files, call create_pull_request.\n` +
            `- Do NOT call get_repo_structure again — you already have the structure.`,
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
            prOutput = {
              success: (output as any).success,
              prUrl: (output as any).prUrl,
              branchName: (output as any).branchName,
            };
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          ctx.addProgress(`Tool error in ${call.name}: ${errMsg}`);
          messages.push({
            role: "tool",
            name: call.name,
            content: JSON.stringify({ error: errMsg }),
          });
        }
      }

      // If the PR was successfully created, stop immediately — no more steps needed.
      if (prOutput?.success) {
        ctx.addProgress("PR created — finishing agent loop.");
        break;
      }
    }

    return {
      success: prOutput?.success ?? false,
      text: undefined,
      prUrl: prOutput?.prUrl,
      branchName: prOutput?.branchName ?? suggestedBranchName,
      steps: undefined,
      error: prOutput?.success ? undefined : !prOutput?.prUrl ? "ReAct agent did not complete PR creation" : undefined,
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
