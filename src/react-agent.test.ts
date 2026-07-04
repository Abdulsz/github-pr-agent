import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAmbiguousEditRecoveryMessage,
  buildContinueNudge,
  buildPrRetryNudge,
  buildRecoveryMessage,
  buildSearchNotFoundRecoveryMessage,
  normalizeToolArguments,
  normalizeToolCall,
  rankFilesForTask,
  resolveReadRef,
  runReActAgent,
  summarizeCompareDiff,
} from "./react-agent";
import type { ReActContext } from "./react-agent";
import { focusedTaskPlan } from "./planner";

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

describe("buildRecoveryMessage", () => {
  const makeCtx = (editedPaths: string[]): ReActContext => ({
    github: {} as ReActContext["github"],
    repoInfo: { owner: "o", repo: "r" },
    request: { repoUrl: "o/r", description: "Add dark mode to the home page", branchName: "feature/test" },
    addProgress: () => {},
    workingBranch: "feature/test",
    readCache: new Map(),
    fullFilePaths: new Set(),
    editedPaths: new Set(editedPaths),
    knownPaths: new Set(["app/page.js", "app/layout.js"]),
    plan: focusedTaskPlan("Add dark mode to the home page", "app/page.js"),
  });

  it("directs a fix in place when the diff already touches the plan target", () => {
    const message = buildRecoveryMessage(
      makeCtx(["app/page.js"]),
      "The diff defines a theme but never applies it.",
      "Wrap the rendered UI in <ThemeProvider>.",
      ["app/page.js"],
      1,
      3
    );
    assert.match(message, /ALREADY edited the correct file/);
    assert.match(message, /Finish the implementation in "app\/page\.js"/);
    assert.match(message, /create_pull_request again/);
    assert.doesNotMatch(message, /NOT edited yet/);
  });

  it("keeps the missing-target guidance when the plan target is absent from the diff", () => {
    const message = buildRecoveryMessage(
      makeCtx(["app/layout.js"]),
      "The diff only changes the layout.",
      "Edit the home page.",
      ["app/layout.js"],
      1,
      3
    );
    assert.match(message, /NOT edited yet/);
    assert.match(message, /"app\/page\.js"/);
  });
});

describe("buildPrRetryNudge", () => {
  it("pushes the model straight back to create_pull_request after a committed fix", () => {
    const ctx: ReActContext = {
      github: {} as ReActContext["github"],
      repoInfo: { owner: "o", repo: "r" },
      request: { repoUrl: "o/r", description: "Add dark mode", branchName: "feature/test" },
      addProgress: () => {},
      workingBranch: "feature/test",
      readCache: new Map(),
      fullFilePaths: new Set(),
      editedPaths: new Set(["app/page.js"]),
      knownPaths: new Set(),
    };
    const message = buildPrRetryNudge(ctx);
    assert.match(message, /committed successfully/);
    assert.match(message, /create_pull_request NOW/);
    assert.match(message, /"feature\/test"/);
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

  it("defaults to the working branch once it has commits, so re-reads see the agent's own edits", () => {
    assert.equal(resolveReadRef({ ...baseCtx, branchMaterialized: true }), "feature/test");
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

  it("recovers from a verification failure: fix-in-place guidance, then PR retry nudge, then PR", async () => {
    const HALF_WIRED_PATCH = `@@ -38,6 +41,8 @@ export default function Home() {
   const [uploading, setUploading] = useState(false);
+  const [darkMode, setDarkMode] = useState(false);
+  const handleDarkModeToggle = () => setDarkMode((prev) => !prev);`;
    const WIRED_PATCH = `${HALF_WIRED_PATCH}
@@ -145,7 +151,7 @@ export default function Home() {
   return (
-    <Box>
+    <Box sx={{ bgcolor: darkMode ? '#121212' : '#fff', color: darkMode ? '#fff' : '#000' }}>
       <Typography variant="h4">Pantry</Typography>`;

    let compareCalls = 0;
    let executorCalls = 0;
    let finalMessages: { role: string; content: string }[] = [];

    const ctx: ReActContext = {
      github: {
        getRepoContents: async () => [],
        getRepoTree: async () => [{ path: "app/page.js", type: "file" }],
        getFileContent: async () => ({ content: "", sha: "" }),
        getRef: async () => ({ object: { sha: "base" } }),
        createRef: async () => ({}),
        createOrUpdateFile: async () => ({}),
        createPullRequest: async () => ({ html_url: "https://example.test/pr/2", number: 2 }),
        compareCommits: async () => {
          compareCalls++;
          const patch = compareCalls === 1 ? HALF_WIRED_PATCH : WIRED_PATCH;
          return {
            ahead_by: compareCalls,
            files: [{ filename: "app/page.js", additions: 2, deletions: 0, patch }],
          };
        },
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
    };

    const result = await runReActAgent({ AI: { run: async (_model: string, options: any) => {
      if ("prompt" in options) return { response: '{"pass":true}' };
      executorCalls++;
      finalMessages = options.messages;
      switch (executorCalls) {
        case 1:
          return { tool_calls: [{ name: "commit_files", arguments: { branchName: "feature/test", changes: [{ path: "app/page.js", content: "const [darkMode, setDarkMode] = useState(false);", action: "create" }] } }] };
        case 2:
          return { tool_calls: [{ name: "create_pull_request", arguments: { branchName: "feature/test" } }] };
        case 3:
          return { tool_calls: [{ name: "commit_files", arguments: { branchName: "feature/test", changes: [{ path: "app/page.js", content: "<Box sx={{ bgcolor: darkMode ? '#121212' : '#fff' }}>", action: "create" }] } }] };
        default:
          return { tool_calls: [{ name: "create_pull_request", arguments: { branchName: "feature/test" } }] };
      }
    } } } as any, ctx);

    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.prUrl, "https://example.test/pr/2");

    const userMessages = finalMessages.filter((m) => m.role === "user").map((m) => m.content);
    assert.ok(
      userMessages.some((m) => m.includes("ALREADY edited the correct file")),
      "expected fix-in-place recovery guidance after the verification failure"
    );
    assert.ok(
      userMessages.some((m) => m.includes("create_pull_request NOW")),
      "expected a PR retry nudge after the committed fix"
    );
  });

  it("bounces an identical re-submitted diff without consuming the verify-retry budget", async () => {
    const HALF_WIRED_PATCH = `@@ -38,6 +41,8 @@ export default function Home() {
   const [uploading, setUploading] = useState(false);
+  const [darkMode, setDarkMode] = useState(false);
+  const handleDarkModeToggle = () => setDarkMode((prev) => !prev);`;
    const WIRED_PATCH = `${HALF_WIRED_PATCH}
@@ -145,7 +151,7 @@ export default function Home() {
   return (
-    <Box>
+    <Box sx={{ bgcolor: darkMode ? '#121212' : '#fff', color: darkMode ? '#fff' : '#000' }}>
       <Typography variant="h4">Pantry</Typography>`;

    let compareCalls = 0;
    let executorCalls = 0;
    let finalMessages: { role: string; content: string }[] = [];

    const ctx: ReActContext = {
      github: {
        getRepoContents: async () => [],
        getRepoTree: async () => [{ path: "app/page.js", type: "file" }],
        getFileContent: async () => ({ content: "", sha: "" }),
        getRef: async () => ({ object: { sha: "base" } }),
        createRef: async () => ({}),
        createOrUpdateFile: async () => ({}),
        createPullRequest: async () => ({ html_url: "https://example.test/pr/3", number: 3 }),
        compareCommits: async () => {
          compareCalls++;
          // Calls 1 and 2 (initial verify + stubborn resubmission) see the
          // identical half-wired diff; only call 3 (after the fix) changes.
          const patch = compareCalls <= 2 ? HALF_WIRED_PATCH : WIRED_PATCH;
          return {
            ahead_by: compareCalls,
            files: [{ filename: "app/page.js", additions: 2, deletions: 0, patch }],
          };
        },
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
    };

    const result = await runReActAgent({ AI: { run: async (_model: string, options: any) => {
      if ("prompt" in options) return { response: '{"pass":true}' };
      executorCalls++;
      finalMessages = options.messages;
      switch (executorCalls) {
        case 1:
          return { tool_calls: [{ name: "commit_files", arguments: { branchName: "feature/test", changes: [{ path: "app/page.js", content: "const [darkMode, setDarkMode] = useState(false);", action: "create" }] } }] };
        case 2: // rejected by verification (attempt 1)
        case 3: // stubborn identical re-submission — must be bounced, not counted
          return { tool_calls: [{ name: "create_pull_request", arguments: { branchName: "feature/test" } }] };
        case 4:
          return { tool_calls: [{ name: "commit_files", arguments: { branchName: "feature/test", changes: [{ path: "app/page.js", content: "<Box sx={{ bgcolor: darkMode ? '#121212' : '#fff' }}>", action: "create" }] } }] };
        default:
          return { tool_calls: [{ name: "create_pull_request", arguments: { branchName: "feature/test" } }] };
      }
    } } } as any, ctx);

    assert.equal(result.success, true, JSON.stringify(result));
    const userMessages = finalMessages.filter((m) => m.role === "user").map((m) => m.content);
    assert.ok(
      userMessages.some((m) => m.includes("WITHOUT changing any code")),
      "expected the unchanged-diff nudge after the identical re-submission"
    );
  });
});
