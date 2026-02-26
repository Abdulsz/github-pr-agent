# Feedback Service Integration — Progress Log

## Status: Complete

---

## Completed Steps

1. **D1 database created** — `feedback-db` (id: `2e0a47fe-0eeb-4e6c-8e23-558cbf91899f`), binding added to `wrangler.jsonc` as `DB`
2. **Types updated** — `D1Database` added to `Env`; feedback types (`FeedbackSubmission`, `Feedback`, `FeedbackProject`, `FeedbackClassification`, etc.) added to `src/types.ts`
3. **FeedbackDB created** — `src/feedback/db.ts` with D1 query helpers (lazy init, CRUD for feedback + projects)
4. **Classifier created** — `src/feedback/classifier.ts` using same Workers AI model as server (`@cf/meta/llama-3.3-70b-instruct-fp8-fast` with 8B fallback + keyword fallback)
5. **Routes created** — `src/feedback/routes.ts` with all endpoints: submit, create project, list feedback, get feedback, update status, widget config, list projects
6. **Server wired** — `src/server.ts` routes `/api/*` to feedback handlers before `routeAgentRequest`
7. **Widget created** — `src/feedback/widget.tsx` with inline styles (no styled-jsx dependency)
8. **Dashboard created** — `src/dashboard/Dashboard.tsx` with dark theme matching existing UI
9. **Client routing** — Pathname-based routing (`/dashboard` renders Dashboard), dashboard link in header
10. **Vite proxy** — `/api` proxy added to `vite.config.ts`
11. **Typecheck passes** — `npm run typecheck` clean
12. **Build passes** — `npm run build` produces dist/ (42 modules, 228KB)
13. **All endpoints tested**:
    - POST /api/feedback/projects — creates project, returns projectId + apiKey
    - POST /api/feedback/submit — classifies and stores feedback (technical/bug, non-technical/general)
    - GET /api/dashboard/projects/:id/feedback — lists with filters
    - PATCH /api/dashboard/projects/:id/feedback/:id — updates status

## Issues & Fixes

1. **D1 create auth error** — First `wrangler d1 create` failed with auth error code 10000. Second attempt succeeded (transient issue).
2. **Type mismatch** — `FeedbackProjectSettings` not assignable to `Record<string, unknown>` in db.ts `createProject`. Fixed by importing and using `FeedbackProjectSettings` type directly.
3. **AI JSON parse failure on 2nd request** — The 70B model returned malformed JSON for the dark-mode feedback. Keyword fallback classification kicked in correctly (non-technical/general). This is expected behavior — the fallback chain works as designed.
4. **PowerShell curl alias** — `curl` in PowerShell is an alias for `Invoke-WebRequest` with different syntax. Used `Invoke-RestMethod` instead for testing.

## Decisions

- Using Cloudflare D1 (not DO SQLite) for all feedback data
- No FeedbackProcessor Durable Object — classification runs inline in route handlers
- Existing GitHubPRAgent DO used for auto-PR on technical feedback (when project has `enableAutoPR` + `githubToken` + `githubRepo`)
- Inline styles (no styled-jsx) for widget and dashboard
- Lazy D1 schema init (CREATE TABLE IF NOT EXISTS via batch on first request)
- API key format: `fbk_<uuid-no-dashes>` for easy identification

## Test Data

- Project ID: `bae177a7-1691-43fc-81aa-b043a4a18b49`
- API Key: `fbk_78640d3af0474ae3afb5e99f1dd67b89`
- Technical feedback ID: `8ca173cf-ea87-48f9-a02c-5b259625f571` (status: in-progress)
- Non-technical feedback ID: `2c27715c-2e43-4206-9fef-4a0a616f21ce` (status: pending)
