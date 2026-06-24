import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAmbiguousEditRecoveryMessage,
  normalizeToolArguments,
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
          files: [{ filename: "change.txt", additions: 1, deletions: 0, patch: "+<Box sx={{ bgcolor: '#121212' }}>" }],
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
        ? { tool_calls: [{ name: "commit_files", arguments: { branchName: "feature/test", changes: [{ path: "change.txt", content: "done", action: "create" }] } }] }
        : { tool_calls: [{ name: "create_pull_request", arguments: { branchName: "feature/test" } }] };
    } } } as any, ctx);

    assert.equal(result.success, true, JSON.stringify(result));
    assert.deepEqual(capturedDiff?.files, [{ path: "change.txt", additions: 1, deletions: 0, patchPreview: "+<Box sx={{ bgcolor: '#121212' }}>" }]);
  });
});
