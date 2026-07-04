# Agent Handoff — GitHub PR Agent (ReAct Pipeline)

Handoff for continuing work on the Cloudflare GitHub PR Agent. Read this first; see also [`AGENT_HANDOFF_OAUTH_AND_HTTP.md`](./AGENT_HANDOFF_OAUTH_AND_HTTP.md) for OAuth/`onRequest` fixes and [`architecture-decisions.md`](./architecture-decisions.md) (local, gitignored) for AD-001 and AD-002.

---

## Current state (2026-07-03) — ✅ END-TO-END SUCCESS

**The regression fixture passes: [Pantry-app PR #15](https://github.com/Abdulsz/Pantry-app/pull/15) was opened by the agent and passed both verifiers.** Branch `feature/agent-test-dark-mode-20260703213747`, 4 commits, 86 additions confined to `app/page.js`: `darkMode` state persisted to localStorage, toggle button, page-level dark background with transition, themed modal/typography/text fields. `useEffect` was already imported — the diff is build-safe. Full decision record: AD-005 in `architecture-decisions.md` (local).

It took 12 live runs to get there; the failures split cleanly into pipeline bugs (fixed below) and per-model Workers AI reliability (fixed with retry classes + failover). 85 unit tests passing, typecheck clean. Account is now on **Workers Paid** (free 10k-neuron quota was exhausted mid-validation).

### Fixes landed (2026-07-03)

| Fix | Where | Detail |
|-----|-------|--------|
| **Stale-ref reads (root cause of recovery search-misses)** | `resolveReadRef` | Once the working branch is materialized, default reads come from the **working branch**, not `main`. Previously every post-commit grep/read showed pre-edit content, so recovery-pass `apply_file_edits` search strings drifted from the branch it patches. |
| **Read-cache refresh** | `apply_file_edits` / `commit_files` | After a successful commit, `readCache` is replaced with the post-edit content and the path is marked fully read. Follow-up edits validate against current content. |
| **P0: fix-in-place recovery** | `buildRecoveryMessage` (exported) | When the rejected diff already touches the plan target, the message says "you ALREADY edited the correct file — finish it in place" with grep→read→edit→retry steps. The old "target you have NOT edited yet" wording only appears when the target is genuinely absent from the diff. |
| **P0: post-fix PR retry nudge** | loop + `buildPrRetryNudge` | After a verify failure, the first successful follow-up edit injects "call create_pull_request NOW". |
| **P1: half-wired state verifier** | `findUnwiredAppearanceState` | Rejects diffs adding appearance state (`darkMode`, `bgColor`, …) never referenced in JSX/styling/theme lines — the exact shape of the 2026-06-28 failed run. |
| **P1: dark-token verifier** | `findIncompleteDarkMode` | Rejects dark-mode diffs whose added lines contain no dark tokens at all. |
| **Verifier accepts sx-based dark mode** | `findIncompleteDarkMode` | Dark styling applied directly via `sx`/`style`/CSS now counts as "applied" — previously only `<ThemeProvider>` counted, so the recovery loop's own suggested fix would have been re-rejected forever. |
| **LLM verifier resilience** | `runLLMVerifier` | Retries transient errors; on persistent infra failure it fails **open** (deterministic checks remain the hard gate) instead of burning a verify retry on an outage. |
| **504s treated as transient** | `callModelWithRetry` | 503/504/"Gateway Time-out"/timeout added to the retry classifier. |
| **Scope guard gives next action** | `edit-scope.ts` | Block message now includes the exact `grep_in_file` call to run on the primary target (model previously burned 3 steps re-trying `app/layout.js`). |
| **Executor token cap** | loop | `max_tokens` 8192 → 2048; large caps let reasoning models run past the Workers AI gateway timeout. |

There is also an end-to-end unit test of the full loop: verify failure → fix-in-place guidance → committed fix → PR retry nudge → PR opens (`react-agent.test.ts`).

### Later fixes the same day (runs 6–12; see AD-005)

| Fix | Detail |
|-----|--------|
| Verifier model → llama-3.3 + fail-open | GLM-4.7-Flash returned systematically unparseable verifier JSON, rejecting deterministically-valid diffs with an unactionable reason. Unparseable/errored LLM verification now retries, then **fails open** (deterministic checks remain the hard gate). |
| Unchanged-diff guard | Run 8 burned all 3 verify retries re-submitting the identical rejected diff. `create_pull_request` now bounces identical re-submissions without consuming the budget and injects a blunt "make the fix first" redirect. |
| Anchor gate 40→20 chars | Apply-time exact-once matching is the real safety; the 40-char pre-gate cost runs 6–7 three-plus steps each. |
| `MAX_STEPS` 30→60 + wrap-up nudge | Run 9 produced an excellent multi-edit dark mode but starved at 30 steps mid-polish. At 8 steps remaining (with edits committed) the loop injects "stop refining, call create_pull_request now". |
| `MAX_NO_TOOL_NUDGES` 3→5 | Models often resume on the 2nd–4th prod. |
| Rate-limit backoff | `3021` per-minute limits back off 20s/40s/60s instead of 1s/2s/3s. |
| Executor failover | Primary model unavailability after retries falls back to `REACT_MODEL_FALLBACK_ID` per call instead of killing the run. |

### Executor model A/B (live, 2026-07-03)

| Model | Result |
|-------|--------|
| `@cf/zai-org/glm-4.7-flash` | Stalls (no tool calls), weak single-token anchors, drifts to `app/layout.js`. Never landed a complete edit. |
| `@cf/zai-org/glm-5.2` | Inference exceeds the Workers AI gateway timeout — raw HTML `504` on nearly every executor turn, even with `max_tokens: 2048`. Not viable via `env.AI.run` today. |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Fast, lands first edits, but never performs the verifier-guided *fix* edit — stalls or re-submits the rejected diff (runs 6–8). Now the **fallback executor** and the **verifier model**. |
| `@cf/moonshotai/kimi-k2.7-code` | **Current executor** (`REACT_MODEL_ID`). Best edit quality by far (run 9: toggle + page background + themed modal/inputs; run 12: shipped PR #15 with localStorage persistence). Quirks: occasional malformed tool call (`path` missing, absorbed as tool errors), per-minute rate limits (3021), occasional 1031 episodes (handled by failover). |

Planner remains on `@cf/zai-org/glm-4.7-flash` (cheap JSON-only role); verifier is `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.

### Generality validation (2026-07-03, later the same day)

Two non-dark-mode tasks were run end-to-end to confirm the fixes are not fixture-specific:

| Task | Result |
|------|--------|
| "Validate that the item quantity is a positive whole number before adding…" (logic task, no dark/theme tokens) | ✅ [PR #16](https://github.com/Abdulsz/Pantry-app/pull/16) — quantity `TextField` with `error`/`helperText`, positive-integer validation, quantity threaded through `addItem` without variable shadowing. First-attempt verification pass. |
| "Add a small clear button inside the search bar… only visible while the search field is not empty" | ⚠️ [PR #17](https://github.com/Abdulsz/Pantry-app/pull/17) — implementation is exactly to spec (conditional `endAdornment`, `aria-label`), **but it imports `@mui/icons-material`, which is not in Pantry's dependencies — the build would fail.** |

PR #17 exposed a general verifier gap, now closed: `findUndeclaredImports` (`pr-verifier.ts`) deterministically rejects diffs whose added lines import packages absent from the **head branch's** `package.json` (deps + devDeps; relative/alias/builtin imports exempt; adding the dep in the same diff satisfies the check). `create_pull_request` fetches the head-branch package.json and passes the list through `verifyTaskCompletion`. 89 tests passing. **PR #17 predates the check — close it or have the agent redo the task.**

### Next steps (in order)

1. **Commit today's work** (excluding `src/sandbox/` WIP per the note below) — everything is only in the working tree.
2. Re-run the fixture once more for stability (fresh branch) and close stale Pantry branches from failed runs 6/8/9/10 (`...125913`, `...135803`, `...140755`, plus earlier empties) — **do not delete without explicit authorization**.
3. Multi-file AD-004 validation task (theme toggle across provider + button + layout).
4. Investigate Kimi's malformed tool calls in the normalizer (step waste, not correctness).
5. Phase 2 sandbox build gate (see P3 below) — after which the LLM-verifier fail-open tradeoff should be revisited.

---

## Current state (2026-06-28) — historical

The **`coding-agent`** branch runs a **Plan → Locate → Read → Edit → Verify → PR** ReAct pipeline on repos like [Abdulsz/Pantry-app](https://github.com/Abdulsz/Pantry-app). **The pipeline reaches verification and correctly blocks bad PRs; it does not yet consistently open passing PRs.**

| Area | Status |
|------|--------|
| Patch-based edits + truncation guards (AD-001) | Done |
| Locate / read / verify pipeline (AD-002) | Done |
| Verify-failure recovery loop (AD-003) | Done — non-terminal, budgeted (`MAX_VERIFY_RETRIES` = 3) |
| Plan-and-execute Phase 1 (AD-004) | Done — focused routing for unambiguous page tasks |
| GLM-4.7-Flash + Workers AI response normalizer | Done — `workers-ai-response.ts`, all three roles |
| Edit scope guards + anchor quality | Done — `edit-scope.ts`, multi-line search requirement, line-number strip |
| Auto-PR nudge (`buildContinueNudge`) | Done — pushes model to `create_pull_request` after first commit |
| Dark-mode deterministic verifier | Done — rejects `mode: 'light'`, theme without `ThemeProvider` |
| Unit tests | **75 passing** (`npm test`) |
| End-to-end Pantry dark mode → **successful PR** | **Not yet** — agent reaches verify, gets rejected, recovery fails |

**Recent commits:** `fa8d0f0` (GLM + tool parsing), `a9498a9` (scope guards + anchor checks + dark-mode verifier + auto-PR nudge).

**Regression fixture:** Pantry-app — *"Add dark mode to the home page"* → must edit `app/page.js` with real dark UI, pass verification, open PR.

---

## What we need to make successful PRs happen (2026-06-28)

### Where the pipeline is today

```
Plan + scope guards  ✅
  → Edit app/page.js   ✅ (partial — state/toggle, not wired to JSX)
  → create_pull_request  ✅ (auto-PR nudge works after first commit)
  → Verifier rejects incomplete diff  ✅ (correct behavior)
  → Recovery fails     ❌ (wrong guidance, search-miss on fix pass)
  → Agent gives up     ❌
```

**The bottleneck is no longer "can the agent call tools" or "does verification exist."** It is **closing the verify → fix → retry loop**.

### When verifier rejection happens

Verification runs **only inside `create_pull_request`**, **before any GitHub PR is opened**:

1. **Hard throws** (not verifier): no edits in run; no commits on branch (`ahead_by <= 0`).
2. **Scope preflight** (deterministic): plan targets `app/page.js` but diff omits it → `verificationFailed`, no PR.
3. **`verifyTaskCompletion`**:
   - **`runDeterministicVerifier`** first (instant): empty diff, duplicate JSX, malformed syntax, incomplete dark mode, trivial/non-UI edits, etc. **If this fails, LLM verifier is skipped.**
   - **`runLLMVerifier`** (GLM) only if deterministic passes.
4. **If either fails:** returns `{ verificationFailed: true, reason, suggestedNext }` — **no PR on GitHub**. Loop injects `buildRecoveryMessage` (up to 3 attempts).

Verifier does **not** run on `apply_file_edits` errors (scope guard, weak anchor, search-not-found). No sandbox/build gate yet.

### Priority work (do in this order)

| Priority | Work | Why |
|----------|------|-----|
| **P0** | **Verification-aware recovery** | After reject, fix **same file(s) already in diff** using verifier `reason` + `suggestedNext` as concrete edit steps (e.g. wrap `return (` in `<ThemeProvider>`, apply `bgColor` to `<Box sx={...}>`). Do **not** use `pickRecoveryTarget` when `changedFiles` already includes the plan target — that message wrongly says "file you have NOT edited yet." |
| **P0** | **Post-fix PR retry nudge** | After verify failure + successful follow-up edit, inject same urgency as `buildContinueNudge`: *"Call create_pull_request again; verification will confirm the fix."* |
| **P1** | **Verifier: unused state / no dark styling** | Reject diffs that add `darkMode`/`bgColor` state but never reference them in JSX, or dark-mode tasks with no dark tokens (`#121212`, `mode: 'dark'`, etc.). Closes "half-wired" commits from latest run. |
| **P2** | **Recovery edit reliability** | Force `read_file_section` around `return (` after verify failure; optionally clear read cache for changed path. Try `@cf/zai-org/glm-5.2` for executor on recovery turns if GLM-4.7-Flash keeps search-missing. |
| **P3** | **Sandbox build gate (Phase 2)** | `clone → npm install → npm run build` inside `create_pull_request` before LLM verify. Catches syntax errors (PR #14-style); **does not** fix model stalling or semantic incomplete wiring. Defer until P0+P1 loop works. |

**Minimum to ship a passing Pantry PR:** P0 + P1. Sandbox is optional quality insurance, not the first fix.

### Latest live run (2026-06-28, post-`a9498a9`)

**Branch:** `feature/agent-test-dark-mode-20260627202717`  
**Duration:** ~58s  
**Outcome:** No PR (correct — incomplete diff blocked)

| Step | Result |
|------|--------|
| Scope guard | Blocked `app/layout.js` before `app/page.js` edited |
| Edit | `app/page.js` — added `darkMode` state + `handleDarkModeToggle` |
| Auto-PR nudge | Model called `create_pull_request` on nudge 2/3 |
| Deterministic verifier | **Rejected:** theme/toggle defined but not applied in JSX (no `ThemeProvider`) |
| LLM verifier | Skipped (deterministic short-circuit) |
| Recovery | Agent read more context, `apply_file_edits` search-miss, gave up |
| GitHub PR | **None opened** |

```bash
gh api repos/Abdulsz/Pantry-app/compare/main...feature/agent-test-dark-mode-20260627202717
# app/page.js: +darkMode state, +toggle handler; JSX unchanged
```

**PR #14** (broken duplicate JSX from earlier Llama run) was **closed** 2026-06-27. Open PRs on Pantry: #8, #9 (old).

### Dev server notes

- Run: `npm run dev` → Worker **:8787**, Vite **:5173** (or next free port).
- **Kill stale wranglers before restart:** two processes on `:8787` cause hung agent runs. Clean restart:
  ```powershell
  Get-NetTCPConnection -LocalPort 8787 -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Remove-Item -Recurse -Force .wrangler\tmp -ErrorAction SilentlyContinue
  npm run dev
  ```
- `@cloudflare/sandbox` in `package.json` is **WIP** (`src/sandbox/sandbox.tsx` stub) — exclude from commits until Phase 2.

### Live test command

```powershell
$branch = "feature/agent-test-dark-mode-$(Get-Date -Format 'yyyyMMddHHmmss')"
$body = @{ args = @(@{
  repoUrl = "Abdulsz/Pantry-app"
  description = "Add dark mode to the home page"
  targetBranch = "main"
  branchName = $branch
}) } | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Uri "http://localhost:8787/agents/git-hub-p-r-agent/default/createPRReAct" `
  -Method POST -Body $body -ContentType "application/json" -TimeoutSec 900
```

Poll `GET http://localhost:8787/agents/git-hub-p-r-agent/default/status` for `progressMessages`, `taskPlan`, `diffSummary`.

### Success criteria for next Pantry run

1. Agent edits `app/page.js` (scope guard keeps it on target).
2. Agent calls `create_pull_request` (auto-PR nudge).
3. If verifier rejects, recovery applies **verifier-guided fix on same file**, retries PR.
4. PR opens with diff showing dark styling on page JSX (`ThemeProvider`, dark `sx`/`bgcolor`, or equivalent).
5. Deterministic + LLM verifier both pass.

---

## Current state (2026-06-23) — historical

The **`coding-agent`** branch work adds a **Locate → Edit → Verify** pipeline for the ReAct agent to fix large-file edit failures on repos like [Abdulsz/Pantry-app](https://github.com/Abdulsz/Pantry-app).

| Area | Status |
|------|--------|
| Patch-based edits + truncation guards (AD-001) | Done |
| Locate / read / verify pipeline (AD-002) | Done |
| Verify-failure recovery loop (AD-003) | Done — verify failures are non-terminal, budgeted, and inject targeted recovery guidance |
| Recursive file-tree navigation fix | Done — full tree loaded up-front; fixed path-guessing thrash (see AD-003 follow-up) |
| Plan-and-execute Phase 1 (AD-004) | Done — planner + acceptance-criteria verify wired; **regresses simple one-file tasks** (see Run E below) |
| Unit tests (`npm test`, 30 passing) | Done |
| End-to-end Pantry-app dark mode (simple one-file) | **Failing (Run E, post-AD-004)** — planner over-scopes; verify+recovery work but agent stuck on ambiguous `app/page.js` patch |

---

## Follow-up implementation attempt (2026-06-23)

The current worktree now contains the **general task-sizing design**:

- `GET /status` now returns `taskPlan`, and `createPRReAct` clears stale plan state before a new run.
- [`src/planner.ts`](src/planner.ts) routes by evidence: a request with one unambiguous existing target and no cross-cutting indicators gets a focused initial plan; explicitly multi-file, dependency-heavy, and ambiguous requests use the LLM planner. A home-page entry point is only one evidence source, not a special planning mode.
- Ambiguous `apply_file_edits` errors now inject candidate line numbers and a targeted `read_file_section` + multi-line-search recovery instruction.
- `create_pull_request` rejects runs with no successful mutation, and its failure injects guidance to locate/read/edit before retrying. Tool arguments shaped as `{ type, value }` are normalized before execution.
- Tests now cover general task-size routing, ambiguous-edit recovery, and tool-argument normalization. `npm test` passes with **38 tests**; `npm run typecheck` passes.

### Important correction

Pantry is only a regression fixture. The agent must handle correct small and large changes generally; the route is intentionally conservative and falls back to the LLM planner whenever scope is unclear.

### Live-validation status

- First retry: the one-subtask plan and ambiguous-match recovery both executed, but Workers AI returned an upstream internal inference error before PR creation.
- Second retry: Workers AI rejected the run before model execution because the account exhausted its daily free allocation of 10,000 neurons.
- No PR was created. Empty remote branches may exist from `feature/agent-test-dark-mode-20260623170839` and `feature/agent-test-dark-mode-20260623171708`; do not delete them without explicit authorization.

---

## Continuation update (2026-06-24)

### Work completed in this worktree

- **Live endpoint exercised:** `POST /createPRReAct` against `Abdulsz/Pantry-app` reached GitHub, loaded the recursive tree, and produced the focused `app/page.js` plan. It did **not** create a PR because Workers AI failed before the first model turn (`4006` daily allocation exhaustion, then `1031` upstream inference failure).
- **Lazy branch lifecycle:** feature branches are no longer created before the model produces a valid file mutation. The standalone `create_branch` tool was removed; `apply_file_edits` and `commit_files` create or reuse the branch only after validating their local arguments. A repeat live request that failed at inference logged no branch creation.
- **Diff evidence in status:** each `create_pull_request` preflight now stores a bounded `diffSummary` in agent state and returns it from `GET /status`. It contains base/head branches, `aheadBy`, changed paths, additions/deletions, and a maximum 1,200-character patch preview per file. This is the exact comparison sent to verification.
- **Phase 4 retrieval/context budget:** the full repo tree is still retained in `knownPaths` for validation/recovery, but the prompt and planner now receive a deterministic task-ranked file list rather than the arbitrary first 250 paths. Direct filename matches and known home-page entry points rank first.

### Local verification completed

```bash
npm test          # 43 passing
npm run typecheck # passes
git diff --check  # passes
```

Tests now cover:

- no remote branch is created when the model exits before a mutation;
- a verified PR records the exact compare diff before opening;
- diff previews are bounded;
- task-aware file ranking prioritizes likely source targets.

### Current external blockers

1. **Workers AI is unavailable for a live coding run.** Local Worker calls return `1031`; prior calls also returned `4006` for exhausted free neurons. This prevents a real mutation, compare diff, and PR creation test.
2. **Phase 2 Sandbox execution feedback is not configured.** No Cloudflare Sandbox binding/SDK exists in this project, and registry lookup for the current package was unavailable from this environment. Do not add a guessed dependency or binding.
3. `architecture-decisions.md` is local/gitignored. The intended decisions are: lazy branch + persisted diff evidence, and deterministic task-ranked retrieval. Add formal AD-005/AD-006 entries when the local file can be edited.

### Required next live test: Pantry dark mode

After Workers AI capacity is restored, run the following with a unique branch:

```powershell
$branch = "feature/agent-test-dark-mode-$(Get-Date -Format 'yyyyMMddHHmmss')"
$body = @{ args = @(@{
  repoUrl = "Abdulsz/Pantry-app"
  description = "Add dark mode to the home page"
  targetBranch = "main"
  branchName = $branch
}) } | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Uri "http://localhost:8788/agents/git-hub-p-r-agent/default/createPRReAct" `
  -Method POST -Body $body -ContentType "application/json" -TimeoutSec 600
```

While it runs, poll `GET /status`. When `create_pull_request` is attempted, inspect `diffSummary`; also compare the branch directly:

```bash
gh api repos/Abdulsz/Pantry-app/compare/main...BRANCH_NAME \
  --jq '.files[] | {filename, additions, deletions, patch}'
```

### Live-test decision table

| Result | Required action |
|---|---|
| PR opens and `diffSummary`/GitHub compare show a real `app/page.js` UI edit | Inspect the PR manually, record the branch/PR URL here, then proceed to the genuinely multi-file AD-004 test. |
| Branch has a valid commit but verification rejects it | Preserve the branch and `diffSummary`; use the verifier reason and recovery trace to tighten the relevant acceptance criteria/recovery instruction. Do not bypass the gate. |
| Agent edits the wrong file or creates a trivial/no-op diff | Preserve the evidence; add a deterministic verifier or prompt/recovery regression test for that exact failure before retrying. |
| Ambiguous patch error repeats | Confirm the injected candidate-line guidance appears; strengthen the edit tool schema/prompt to require multi-line anchors, then add a regression test. |
| Inference fails before a mutation | Confirm no branch creation message and no `diffSummary`; this is an infrastructure failure, not an agent-quality result. Restore Workers AI capacity before retrying. |
| PR opens but `/status.diffSummary` is absent or differs from GitHub compare | Treat as an observability defect: fix state recording before accepting the run as verified. |

### Implementation sequence after the simple test passes

1. Run a genuinely multi-file task and confirm plan acceptance criteria reject partial implementations.
2. Implement Phase 2 only with the documented Cloudflare Sandbox SDK/binding: run a constrained, allow-listed `typecheck`/lint/test command in an isolated sandbox and feed failures into the existing recovery loop. Treat target-repo code as untrusted.
3. Add Phase 3 whole-diff rubric criticism with an available stronger model; keep deterministic checks as the first gate.
4. Continue Phase 5 only after the above runs are reliable: add per-subtask progress/state and safe multi-file edit orchestration. Do not introduce separate agents merely to compensate for unavailable execution feedback.

## Problem history (Pantry-app)

### PR #9 — file wipe (motivated AD-001)

- Agent replaced ~471 lines of `app/page.js` with a 2-line `// ...` stub.
- Cause: `commit_files` required full file in tool JSON; output hit `max_tokens`.

### PR #10 — irrelevant edit (motivated AD-002)

- Task: “Add dark mode to the home page.”
- Agent changed Firebase init near line 27; no JSX/styling changes.
- Cause: `read_file` excerpt hid JSX at line 145+; success = “commit landed,” not “task done.”

---

## What was implemented (AD-002)

### Architecture

```
Explore (get_repo_structure)
  → Locate (grep_in_file, grep_in_repo)
  → Read (read_file_section)
  → Edit (apply_file_edits + readCache gate)
  → Verify (deterministic + LLM) — gates create_pull_request
```

No separate Cloudflare sub-agents; one ReAct loop in [`src/react-agent.ts`](src/react-agent.ts). Models (2026-06-27): `@cf/zai-org/glm-4.7-flash` for executor (`REACT_MODEL_ID`), planner (`PLANNER_MODEL_ID`), and verifier (`VERIFIER_MODEL_ID`). Response shape normalized via [`src/workers-ai-response.ts`](src/workers-ai-response.ts).

### New / updated files

| File | Role |
|------|------|
| [`src/file-text.ts`](src/file-text.ts) | `splitLines`, `grepInText`, `readLineRange`, `isSearchInReadContent`, read cache helpers |
| [`src/file-navigation.ts`](src/file-navigation.ts) | Section formatting, grep wrappers |
| [`src/pr-verifier.ts`](src/pr-verifier.ts) | Deterministic + LLM verification |
| [`src/github-types.ts`](src/github-types.ts) | Compare/search API types |
| [`src/edit-scope.ts`](src/edit-scope.ts) | Plan-scoped edit order; block layout/globals until primary target edited |
| [`src/workers-ai-response.ts`](src/workers-ai-response.ts) | Normalize OpenAI vs GLM Workers AI response shapes |
| [`src/file-edits.ts`](src/file-edits.ts) | Patch merge + validation (AD-001) |
| [`src/react-agent.ts`](src/react-agent.ts) | New tools, readCache, prompt, PR verify gate, scope guards, `buildContinueNudge` |
| [`src/server.ts`](src/server.ts) | `GitHubAPI.searchCode`, typed `compareCommits` |

### ReAct tools

| Tool | Purpose |
|------|---------|
| `grep_in_file` | Regex search with line numbers |
| `read_file_section` | Numbered line range (max 150 lines); fills `readCache` |
| `grep_in_repo` | GitHub code search |
| `apply_file_edits` | Search/replace patches; **search must appear in readCache** |
| `create_pull_request` | Runs `verifyTaskCompletion` on compare patches before opening PR |

### Key constants

- `LARGE_FILE_THRESHOLD` = 8000 chars — `read_file` returns head/tail excerpt only
- `MAX_STEPS` = 30 (bumped from 20 in AD-003 to give recovery room)
- `MAX_SECTION_LINES` = 150
- `MAX_VERIFY_RETRIES` = 3 — `create_pull_request` may fail verification this many times before the loop gives up (AD-003)
- `MAX_NO_TOOL_NUDGES` = 3 — times the model may stop emitting tool calls (without a PR) before the loop gives up (AD-003)

### How to run locally

```bash
npm run dev          # Worker :8787, Vite UI :5173
npm test
npm run typecheck
```

GitHub OAuth must be connected (stored token in Durable Object state). See [README.md](./README.md).

### HTTP agent endpoints (local)

Base: `http://localhost:8787/agents/git-hub-p-r-agent/default`

| Method | Path | Body |
|--------|------|------|
| GET | `/status` | — |
| POST | `/createPRReAct` | `{ "args": [{ "repoUrl", "description", "targetBranch?", "branchName?" }] }` |

Example:

```powershell
$body = @{
  args = @(
    @{
      repoUrl = "Abdulsz/Pantry-app"
      description = "Add dark mode to the home page"
      targetBranch = "main"
      branchName = "feature/agent-test-dark-mode-$(Get-Date -Format 'yyyyMMddHHmmss')"
    }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Uri "http://localhost:8787/agents/git-hub-p-r-agent/default/createPRReAct" `
  -Method POST -Body $body -ContentType "application/json" -TimeoutSec 600
```

Check progress: `GET .../status` → `progressMessages`, `result`.

---

## Live test run (2026-06-23)

**Request:** Add dark mode to the home page on `Abdulsz/Pantry-app`  
**Branch:** `feature/agent-test-dark-mode-20260623110612`  
**Duration:** ~225s  
**Outcome:** `success: false` — **no PR created** (verify gate blocked it)

### What worked

- Placeholder validation rejected bad `apply_file_edits` on stub `public/index.html`
- **`create_pull_request` verification failed correctly** with actionable message:
  > *The diff only changes imports/init code for a UI task and does not actually implement the requested change…*
- PR #10-style “merge irrelevant one-liner” was **prevented**

### What failed

- Agent never edited `app/page.js` (13KB home page — the real target)
- Wrong paths: `app/index.js` (404), `public/index.html` (stub), `app/layout.js` (partial)
- Hit **20-step limit** after verify rejection; did not loop back to grep/read `app/page.js`

### Committed diff on branch (no PR)

```bash
gh api repos/Abdulsz/Pantry-app/compare/main...feature/agent-test-dark-mode-20260623110612
```

| File | Change |
|------|--------|
| `public/index.html` | Added `<html>...</html>` stub (bad) |
| `app/layout.js` | `RootLayout({ children })` → `RootLayout({ children, darkMode })` — prop unused, wrong file |

Expected path for success:

1. `read_file("app/page.js")` → truncated
2. `grep_in_file("app/page.js", "<Box|return \\(")` → ~line 145
3. `read_file_section("app/page.js", 140, 200)`
4. `apply_file_edits` on `<Box>` with dark `sx`
5. Verify passes → PR opens

---

## Live test Run E (2026-06-23, post-AD-004)

**Request:** Add dark mode to the home page on `Abdulsz/Pantry-app`  
**Branch:** `feature/agent-test-dark-mode-20260623164029` (no PR; branch still exists on remote)  
**Duration:** ~217s  
**Outcome:** `success: false` — **no PR created**

### What worked

- File tree loaded (`Loaded 16 file path(s) from the repo tree.`)
- AD-004 planner ran (`Plan ready: 3 subtask(s), 4 acceptance criteria.`)
- Acceptance-criteria verifier **correctly rejected** the first PR attempt: *"the existing font class name is not preserved"* (layout edit dropped `inter.className`)
- **AD-003 recovery loop fired** (attempt 1/3) and steered the agent to `app/page.js`
- Agent grep'd and `read_file_section` on `app/page.js` lines 145–205 (the real home-page JSX)
- Placeholder/truncation guards blocked a bad `commit_files` on `app/page.js` (51 chars vs 13KB original)

### What failed (why simple one-file flow regressed)

1. **Planner over-scopes simple tasks.** "Add dark mode to the home page" became a 3-subtask multi-file plan (`globals.css`, `layout.js` toggle, `app/page.js`) instead of a single targeted edit on `app/page.js`. Executor burned steps on the wrong files first.
2. **Premature `create_pull_request`.** Agent called PR creation twice before any commits (preflight correctly failed).
3. **Malformed tool args.** Repeated `apply_file_edits` with empty `edits` arrays (model JSON issue).
4. **Invalid edit on layout.** Committed `className={{"dark-mode"}}` (double braces) while dropping `inter.className`.
5. **Ambiguous patch on `app/page.js`.** Recovery reached the right file but `search: "<Box>"` matched **3 times** (lines 146, 352, 389). Agent retried the same ambiguous hunk until steps exhausted; never added surrounding context from the read output.
6. **`/status` does not expose `taskPlan`.** `getStatus()` returns legacy `plan` (ExecutionPlan) but not `AgentState.taskPlan` — debugging the planner output via HTTP requires a one-line fix in [`src/server.ts`](src/server.ts).

### Committed diff on branch (no PR)

```bash
gh api repos/Abdulsz/Pantry-app/compare/main...feature/agent-test-dark-mode-20260623164029
```

| File | Change |
|------|--------|
| `app/globals.css` | `background-color: #fff` → `#333` |
| `app/layout.js` | `className={inter.className}` → `className={{"dark-mode"}}` (invalid JSX; font dropped) |
| `app/page.js` | **not edited** |

### Expected path for a passing simple one-file run

1. Planner produces **one subtask** targeting `app/page.js` (or executor ignores multi-file plan for trivial tasks).
2. `grep_in_file("app/page.js", "return \\(|<Box")` → line ~145
3. `read_file_section("app/page.js", 140, 155)` — enough context to disambiguate the home `<Box>`
4. `apply_file_edits` with a **multi-line search** including surrounding lines (not bare `<Box>`)
5. Verify passes → PR opens

### Fixes to prioritize before multi-file validation

- Expose `taskPlan` on `GET /status`.
- **Task-size routing:** detect simple/single-file tasks and skip multi-subtask planning (or cap planner to 1 subtask when file list + task imply one target like `app/page.js`).
- **Recovery hint for ambiguous matches:** when `apply_file_edits` returns line numbers, inject them into the recovery message with a concrete multi-line search example.
- Stronger prompt: do not call `create_pull_request` until at least one commit exists.

---

## Verify-failure recovery (AD-003, implemented 2026-06-23)

Handoff steps 1-4 are now implemented in [`src/react-agent.ts`](src/react-agent.ts). Summary of the new behavior:

- **Non-terminal verify failure:** `create_pull_request` no longer throws when `verifyTaskCompletion` fails. It returns `{ success: false, verificationFailed: true, reason, suggestedNext, changedFiles }`. The control loop detects this.
- **Retry budget:** `verifyFailures` is counted; after `MAX_VERIFY_RETRIES` (3) the loop stops with a clear error. `MAX_STEPS` raised 20 → 30.
- **Targeted recovery message:** on each verify failure the loop injects a `user` message (`buildRecoveryMessage`) containing the verifier `reason` + `suggestedNext`, the files changed so far, and a concrete recovery target chosen by `pickRecoveryTarget` (prefers `app/page.*` / `src/app/page.*` / `pages/index.*` that were seen but not edited, else any read-but-unedited file), with ready-to-run `grep_in_file` → `read_file_section` → `apply_file_edits` commands.
- **Tracking:** `ReActContext` now has `editedPaths` (filled by `apply_file_edits`/`commit_files`) and `knownPaths` (filled by `get_repo_structure`) to drive target selection.
- **Prompt routing:** system prompt now states the App Router home page is `app/page.{js,jsx,tsx}` (never `public/index.html`) and requires grepping the page file for home/landing tasks before touching `layout`/`public/`.
- **No early exit:** if the model returns no tool calls but no PR exists yet (e.g. it replied with plain text after a tool error), the loop no longer ends — it injects a "call a tool now" nudge up to `MAX_NO_TOOL_NUDGES` (3) before giving up. Previously this `break` let the agent quit before ever reaching the verify gate.
- **Verifier hardening (2026-06-23):** [`src/pr-verifier.ts`](src/pr-verifier.ts) now rejects **reformatting-only** diffs (whitespace/indentation/reorder/trailing newline) via `isReformattingOnly`, and only credits UI markers on genuinely new lines (`netAddedLines`), not context. This closes the gap where a whitespace-only reindent ([PR #12](https://github.com/Abdulsz/Pantry-app/pull/12)) passed verification. Tests: 23 passing.
- **Recursive file tree up-front (2026-06-23):** `GitHubAPI.getRepoTree` (recursive git trees API) is fetched once at agent start by `loadRepoTreeSection`, which seeds `knownPaths` and injects the full valid-path list (cap `MAX_TREE_FILES` = 250) into the prompt. `read_file`/`grep_in_file` 404 errors now suggest real paths via `suggestKnownPaths`. Fixes the Run D failure where the agent looped on nonexistent `app/pages/*` and never found `app/page.js`.
- **Plan-and-execute Phase 1 (AD-004, 2026-06-23):** before editing, `createTaskPlan` ([`src/planner.ts`](src/planner.ts)) decomposes the task into subtasks + acceptance criteria. The plan is persisted to `AgentState.taskPlan` (visible via `/status`), injected into the executor prompt, and its `acceptanceCriteria` are passed to `verifyTaskCompletion` so the (now "senior reviewer") judge fails the PR if any criterion is unmet, functionality is deleted, or an undefined symbol/class is referenced. `PLANNER_MODEL_ID` is the swap point for an agentic-coding model. See AD-004 for the deferred phases (sandbox execution feedback, rubric critic, retrieval, sub-agents).

## Next steps (priority order) — updated 2026-06-28

**Goal:** Pantry dark-mode run opens a PR that passes verification with real page-level dark UI.

### 1. P0 — Verification-aware recovery (implement next)

- Replace or extend `buildRecoveryMessage` when `changedFiles` already contains plan primary path(s): give **fix steps on those files**, not "target you have NOT edited."
- Map common deterministic reasons to concrete tool sequences:
  - *Theme not applied* → `grep_in_file("app/page.js", "return \\(")` → `read_file_section` → wrap `<Box>` in `<ThemeProvider theme={...}>` or set `sx={{ bgcolor: bgColor }}`
  - Include verifier `suggestedNext` verbatim in recovery message.
- After a post-rejection edit succeeds, inject PR-retry nudge (like `buildContinueNudge`).

### 2. P1 — Verifier: half-wired dark mode

- Reject diffs that add `darkMode`/`bgColor`/`textColor` state but never use them in added/changed JSX lines.
- Reject dark-mode tasks where added lines contain no dark styling signals.

### 3. Re-run Pantry live test

- Clean dev server (single wrangler on :8787).
- Success = PR URL + `app/page.js` diff with wired dark UI + verifier pass.

### 4. P2 — Edit reliability on recovery

- Optional read-cache reset for changed path after verify failure.
- A/B `@cf/zai-org/glm-5.2` as `REACT_MODEL_ID` if recovery edits keep search-missing.

### 5. P3 — Sandbox build gate (Phase 2)

- Only after P0+P1 loop works. Documented Cloudflare Sandbox SDK: clone branch, `npm run build`, feed stderr into recovery. See [`src/sandbox/sandbox.tsx`](src/sandbox/sandbox.tsx) stub.

### 6. AD-004 Phases 3–5 (later)

- Whole-diff rubric critic; retrieval budget; multi-file sub-agents.

---

## Next steps (priority order) — historical (2026-06-23)

### 1. Restore simple one-file flow (Pantry dark mode)

- `taskPlan` is now exposed on `GET /status` ([`src/server.ts`](src/server.ts) `getStatus`).
- General task-size routing is implemented. Verify focused routing for a local change, LLM planning for an ambiguous task, and evidence-based expansion when a discovered dependency requires another file.
- Ambiguous-edit recovery is now implemented; retain its candidate-line + multi-line-search guidance as part of the general flow.
- Restore Workers AI quota or use a paid/alternate model, then re-run Pantry HTTP test; success = PR opens with `app/page.js` diff containing real dark-mode UI (`sx`, `bgcolor`, etc.).

### 2. Validate AD-004 on a genuinely multi-file task

Only after #1 passes. Run a task spanning 2+ files (e.g. theme toggle: provider + button + layout) and confirm partial implementations are rejected via acceptance criteria.

### 3. AD-004 Phase 2: execution-grounded verification

Clone the target repo in a Cloudflare Sandbox, run `tsc`/lint/tests, and feed failures into the AD-003 recovery loop. Strongest signal for multi-file correctness (catches broken imports, type errors, undefined refs). Note the security boundary: runs untrusted third-party code.

### 4. AD-004 Phases 3-5

- Whole-diff rubric critic with a stronger judge model (`@cf/zai-org/glm-5.2`); also A/B that model as `PLANNER_MODEL_ID` / `REACT_MODEL_ID`.
- Retrieval/context budget for large repos (rank top-K files instead of dumping the tree; `MAX_TREE_FILES` is the current crude cap).
- Multi-file edit mechanics + per-subtask sub-agents.

### 5. Output-quality follow-ups (smaller)

- Generator self-review step against `plan.acceptanceCriteria` before `create_pull_request`.
- Few-shot exemplars of high-quality multi-file edits in the system prompt.

### 6. Optional: legacy `createPR` path

Non-ReAct `createPR` still uses one-shot JSON batch with only placeholder/size validation; no plan/verify pipeline. Bring it up to parity or retire it.

---

## Commands cheat sheet

```bash
# Tests
npm test
npm run typecheck

# Agent status
curl http://localhost:8787/agents/git-hub-p-r-agent/default/status

# View branch diff
gh api repos/Abdulsz/Pantry-app/compare/main...BRANCH_NAME --jq '.files[] | {filename, patch}'

# List recent PRs
gh pr list --repo Abdulsz/Pantry-app
```

---

## Branch / merge notes

- Agent pipeline commits live on **`coding-agent`** (and may already be on `main` via earlier merge — verify with `git log`).
- `main` may be ahead with UI work; merge/rebase before shipping.
- `architecture-decisions.md` is **gitignored** — copy AD-002 section if handing off to a machine without that file.

---

## Open questions for next owner

1. Should verify failure **always** continue the loop until steps exhausted, or cap verify retries at 2–3?
2. Should `grep_in_repo` be mandatory for large-file UI tasks before any `apply_file_edits`?
3. Is LLM verifier worth the latency/cost on every PR, or only when deterministic pass is borderline?
4. Deploy pipeline changes to production Worker before next Pantry test?
