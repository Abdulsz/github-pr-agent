import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAmbiguousEditRecoveryMessage,
  buildContinueNudge,
  buildSearchNotFoundRecoveryMessage,
  normalizeToolArguments,
  normalizeToolCall,
  rankFilesForTask,
  resolveReadRef,
  runReActAgent,
  summarizeCompareDiff,
} from "./react-agent";
import type { ReActContext } from "./react-agent";

describe("buildAmbiguousEditRecoveryMessage", () => {
  it("turns candidate lines into a targeted multi-line patch recovery", () => {
    const message = buildAmbiguousEditRecoveryMessage(
      "app/page.js",
      "Edit 1: search string matched 3 times, at lines 146, 352, 389. Add a line of surrounding context."
    );
    assert.ok(message);
    assert.match(message!, /146, 352, 389/);
    assert.match(message!, /read_file_section\("app\/page\.js", 140, 158\)/);
    assert.match(message!, /multi-line search/);
  });

  it("does not intercept unrelated edit errors", () => {
    assert.equal(
      buildAmbiguousEditRecoveryMessage("app/page.js", "Search string not found"),
      null
    );
  });
});

describe("buildSearchNotFoundRecoveryMessage", () => {
  it("guides a fresh grep and read_section after a search miss", () => {
    const message = buildSearchNotFoundRecoveryMessage(
      "app/page.js",
      "Search string not found in previously read content for \"app/page.js\"."
    );
    assert.ok(message);
    assert.match(message!, /grep_in_file\("app\/page\.js"/);
    assert.match(message!, /read_file_section\("app\/page\.js"/);
    assert.match(message!, /line-number prefixes/);
  });

  it("also handles weak-anchor rejections", () => {
    assert.ok(
      buildSearchNotFoundRecoveryMessage(
        "app/page.js",
        'Search anchor for "app/page.js" is too weak (single short line).'
      )
    );
  });

  it("does not intercept unrelated errors", () => {
    assert.equal(
      buildSearchNotFoundRecoveryMessage("app/page.js", "Some other failure"),
      null
    );
  });
});

describe("buildContinueNudge", () => {
  const baseCtx = (editedPaths: Set<string>): ReActContext => ({
    github: {} as ReActContext["github"],
    repoInfo: { owner: "o", repo: "r" },
    request: { repoUrl: "o/r", description: "Add dark mode to the home page", branchName: "feature/test" },
    addProgress: () => {},
    workingBranch: "feature/test",
    readCache: new Map(),
    fullFilePaths: new Set(),
    editedPaths,
    knownPaths: new Set(),
  });

  it("pushes directly at create_pull_request once a file is committed", () => {
    const message = buildContinueNudge(baseCtx(new Set(["app/page.js"])));
    assert.match(message, /already committed changes to app\/page\.js/);
    assert.match(message, /create_pull_request now/);
  });

  it("falls back to locate/read/edit guidance before any edit", () => {
    const message = buildContinueNudge(baseCtx(new Set()));
    assert.match(message, /grep_in_file/);
    assert.match(message, /apply_file_edits/);
  });
});

describe("normalizeToolArguments", () => {
  it("unwraps model-emitted typed scalar values recursively", () => {
    assert.deepEqual(
      normalizeToolArguments({
        branchName: { type: "string", value: "feature/test" },
        edits: [
          {
            search: { type: "string", value: "before" },
            replace: { type: "string", value: "after" },
          },
        ],
      }),
      {
        branchName: "feature/test",
        edits: [{ search: "before", replace: "after" }],
      }
    );
  });
});

describe("normalizeToolCall", () => {
  it("reads the flat { name, arguments } shape", () => {
    assert.deepEqual(
      normalizeToolCall({ name: "read_file", arguments: { path: "app/page.js" } }),
      { name: "read_file", arguments: { path: "app/page.js" } }
    );
  });

  it("unwraps the OpenAI-style nested function with stringified arguments", () => {
    assert.deepEqual(
      normalizeToolCall({
        type: "function",
        function: { name: "apply_file_edits", arguments: '{"path":"app/page.js","edits":[]}' },
      }),
      { name: "apply_file_edits", arguments: { path: "app/page.js", edits: [] } }
    );
  });

  it("returns null when no tool name is present (avoids undefined tool calls)", () => {
    assert.equal(normalizeToolCall({ arguments: { path: "x" } }), null);
    assert.equal(normalizeToolCall({ function: { arguments: "{}" } }), null);
    assert.equal(normalizeToolCall(null), null);
  });
});

describe("summarizeCompareDiff", () => {
  it("keeps the verification diff visible without retaining an unbounded patch", () => {
    const summary = summarizeCompareDiff("main", "feature/test", {
      ahead_by: 1,
      files: [{ filename: "app/page.js", additions: 2, deletions: 1, patch: "+x\n".repeat(700) }],
    });
    assert.equal(summary.baseBranch, "main");
    assert.equal(summary.headBranch, "feature/test");
    assert.equal(summary.files[0].path, "app/page.js");
    assert.equal(summary.files[0].patchPreview.length, 1200);
  });
});

describe("rankFilesForTask", () => {
  it("puts the unambiguous home-page entry point ahead of unrelated files", () => {
    const ranked = rankFilesForTask("Add dark mode to the home page", [
      "public/logo.svg",
      "app/layout.js",
      "app/page.js",
      "lib/firebase.js",
    ]);
    assert.equal(ranked[0], "app/page.js");
  });

  it("ranks direct filename matches ahead of unrelated files deterministically", () => {
    const ranked = rankFilesForTask("Fix EmptyState component", [
      "src/z.ts",
      "src/components/EmptyState.tsx",
      "src/a.ts",
    ]);
    assert.equal(ranked[0], "src/components/EmptyState.tsx");
    assert.deepEqual(ranked.slice(1), ["src/a.ts", "src/z.ts"]);
  });
});

describe("resolveReadRef", () => {
  const baseCtx: ReActContext = {
    github: {} as ReActContext["github"],
    repoInfo: { owner: "o", repo: "r" },
    request: { repoUrl: "o/r", description: "task", targetBranch: "main", branchName: "feature/test" },
    addProgress: () => {},
    workingBranch: "feature/test",
    readCache: new Map(),
    fullFilePaths: new Set(),
    editedPaths: new Set(),
    knownPaths: new Set(),
    branchMaterialized: false,
  };

  it("defaults to the target branch before the working branch exists", () => {
    assert.equal(resolveReadRef(baseCtx), "main");
  });

  it("falls back to main when the model passes the not-yet-created working branch", () => {
    assert.equal(resolveReadRef(baseCtx, "feature/test"), "main");
  });

  it("honors the working branch after it has been materialized", () => {
    assert.equal(resolveReadRef({ ...baseCtx, branchMaterialized: true }, "feature/test"), "feature/test");
  });
});

describe("runReActAgent branch lifecycle", () => {
  it("does not create a remote branch when the model exits before any mutation", async () => {
    let createRefCalls = 0;
    const ctx: ReActContext = {
      github: {
        getRepoContents: async () => [],
        getRepoTree: async () => [{ path: "app/page.js", type: "file" }],
        getFileContent: async () => ({ content: "", sha: "" }),
        getRef: async () => ({ object: { sha: "base" } }),
        createRef: async () => {
          createRefCalls++;
        },
        createOrUpdateFile: async () => ({}),
        createPullRequest: async () => ({ html_url: "", number: 1 }),
        compareCommits: async () => ({ ahead_by: 0, files: [] }),
        searchCode: async () => [],
      },
      repoInfo: { owner: "owner", repo: "repo" },
      request: {
        repoUrl: "owner/repo",
        description: "Add dark mode to the home page",
        branchName: "feature/test",
      },
      addProgress: () => {},
      workingBranch: "",
      readCache: new Map(),
      fullFilePaths: new Set(),
      editedPaths: new Set(),
      knownPaths: new Set(),
    };

    const result = await runReActAgent(
      { AI: { run: async () => ({ response: "I cannot continue.", tool_calls: [] }) } } as any,
      ctx
    );

    assert.equal(result.success, false);
    assert.equal(createRefCalls, 0);
  });

  it("records the exact compare diff before opening a verified PR", async () => {
    let reactCalls = 0;
    let capturedDiff: ReturnType<typeof summarizeCompareDiff> | undefined;
    const ctx: ReActContext = {
      github: {
        getRepoContents: async () => [],
        getRepoTree: async () => [{ path: "app/page.js", type: "file" }],
        getFileContent: async () => ({ content: "", sha: "" }),
        getRef: async () => ({ object: { sha: "base" } }),
        createRef: async () => ({}),
        createOrUpdateFile: async () => ({}),
        createPullRequest: async () => ({ html_url: "https://example.test/pr/1", number: 1 }),
        compareCommits: async () => ({
          ahead_by: 1,
          files: [{ filename: "app/page.js", additions: 1, deletions: 0, patch: "+<Box sx={{ bgcolor: '#121212' }}>" }],
        }),
        searchCode: async () => [],
      },
      repoInfo: { owner: "owner", repo: "repo" },
      request: { repoUrl: "owner/repo", description: "Add dark mode to the home page", branchName: "feature/test" },
      addProgress: () => {},
      workingBranch: "",
      readCache: new Map(),
      fullFilePaths: new Set(),
      editedPaths: new Set(),
      knownPaths: new Set(),
      recordDiff: (diff) => { capturedDiff = diff; },
    };
    const result = await runReActAgent({ AI: { run: async (_model: string, options: any) => {
      if ("prompt" in options) return { response: '{"pass":true}' };
      reactCalls++;
      return reactCalls === 1
        ? { tool_calls: [{ name: "commit_files", arguments: { branchName: "feature/test", changes: [{ path: "app/page.js", content: "done", action: "create" }] } }] }
        : { tool_calls: [{ name: "create_pull_request", arguments: { branchName: "feature/test" } }] };
    } } } as any, ctx);

    assert.equal(result.success, true, JSON.stringify(result));
    assert.deepEqual(capturedDiff?.files, [{ path: "app/page.js", additions: 1, deletions: 0, patchPreview: "+<Box sx={{ bgcolor: '#121212' }}>" }]);
  });
});
