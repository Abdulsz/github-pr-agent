# Agent Handoff: OAuth Redirect + Agent HTTP Endpoint Fixes

This document summarizes the two production-impacting fixes made during local debugging:

1. GitHub OAuth callback redirect failures (`Unable to parse URL`)
2. Agent HTTP warnings (`onRequest hasn't been implemented`)

---

## 1) OAuth Callback Redirect Fix

### Problem

During GitHub OAuth callback handling, logs showed:

- `TypeError: Unable to parse URL: /agent?...`

The callback path eventually called `redirectWithStatus(...)`, which returned:

- `Response.redirect(path, 302)` where `path` was relative (for example `/agent?...`)

In this Worker runtime flow, that caused URL parsing failures because redirect target needed to be absolute.

### Change

Updated `redirectWithStatus` in `src/github/oauth.ts`:

- Signature now includes `requestUrl: string`
- Uses `new URL(requestUrl).origin` as base origin
- Resolves `returnTo` against that origin
- Redirects with absolute URL via `Response.redirect(url.toString(), 302)`

### Call Site Updates

Updated all `redirectWithStatus(...)` calls in `src/github/routes.ts` to pass `request.url`.

This includes all callback branches:

- GitHub OAuth error branch
- missing `code`/`state`
- invalid/expired state
- agent token connect failure
- success paths for agent/dashboard
- catch/failure path

### Outcome

OAuth callback redirects now produce valid absolute URLs and no longer throw parse errors for `/agent?...`.

---

## 2) Agent `onRequest` Implementation for HTTP Calls

### Problem

Logs showed:

- `onRequest hasn't been implemented on GitHubPRAgent:default responding to https://agent/setGitHubToken`

The app uses internal Durable Object fetch calls like:

- `stub.fetch(new Request("https://agent/setGitHubToken", ...))`

Those are plain HTTP requests to the agent instance, not WebSocket RPC. Without `onRequest`, the runtime warns and returns the not-implemented behavior.

### Change

Added `async onRequest(request: Request): Promise<Response>` to `GitHubPRAgent` in `src/server.ts`.

Implemented JSON request handling with path-based routing:

- `GET /status` -> returns `getStatus()`
- `POST /setGitHubToken` -> calls `setGitHubToken(args[0])`
- `POST /createPR` -> calls `createPR(args[0])`
- `POST /createPRReAct` -> calls `createPRReAct(args[0])`
- `POST /reset` -> calls `reset()`
- `POST /disconnect` -> calls `disconnect()`

Also added:

- JSON body parse guard (`Invalid JSON body`, 400)
- method guard (`Method not allowed`, 405)
- argument validation for required payloads
- `Not found` fallback (404)

### Outcome

Internal `stub.fetch("https://agent/...")` calls are now handled explicitly and the warning about missing `onRequest` is resolved.

---

## Files Changed

- `src/github/oauth.ts`
  - `redirectWithStatus(...)` now builds absolute redirect URL from request origin
- `src/github/routes.ts`
  - passes `request.url` to `redirectWithStatus(...)`
- `src/server.ts`
  - adds `GitHubPRAgent.onRequest(...)` HTTP router for internal agent endpoints

---

## Validation Performed

- Type check: `npm run typecheck` (passes)
- Lint diagnostics checked on modified files (no new lints reported)

---

## Notes for Next Agent

- If warning persists after pulling changes, restart local dev server (`wrangler dev`) to ensure latest DO class code is loaded.
- A remaining OAuth error like `bad_verification_code` is separate from this fix; it usually indicates stale/reused GitHub `code` and should be retried with a fresh OAuth authorize flow.
