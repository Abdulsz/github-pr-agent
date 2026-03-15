# GitHub PR Agent + Feedback Service

An AI-powered platform built on Cloudflare that combines two capabilities:

1. **GitHub PR Agent** — Describe a fix or feature in plain English and the agent creates a pull request for you
2. **Feedback Service** — A full-stack feedback collection system with an embeddable widget, AI-powered classification, a dashboard for managing submissions, and user authentication.
3. [Dashboard](https://github-pr-agent.zakariatimalma.workers.dev/)

### Built with

- **Cloudflare Agents SDK** — Stateful, durable agents with WebSocket support
- **Workers AI** — AI inference for code generation and feedback classification (Llama 3.3 70B / Llama 3.1 8B)
- **Cloudflare D1** — SQLite database for feedback, projects, and user data
- **Durable Objects** — Persistent agent state and real-time sync
- **GitHub REST API** — Direct API integration for GitHub operations
- **React + Vite** — Modern frontend with client-side routing

## Features

### PR Agent

- GitHub Personal Access Token authentication
- Natural language input for describing fixes/features
- AI-powered code generation and analysis
- Automatic branch creation and PR submission
- Real-time progress updates via WebSocket
- ReAct mode for autonomous reasoning

### Feedback Service

- Embeddable feedback widget (light/dark theme, configurable position and colors)
- AI-powered classification of submissions (technical vs. non-technical, bug/feature/improvement/general)
- Dashboard with filtering, status management, and project-level analytics
- Multi-project support with isolated API keys
- User authentication (register/login with JWT)
- CORS-enabled API for cross-origin widget embedding

## Architecture

```
┌─────────────────┐     ┌───────────────────────────────────────────────┐
│   React Client  │◄────┤              Cloudflare Worker                │
│  (SPA routing)  │     │                                               │
│                 │     │  ┌─────────────┐  ┌────────────────────────┐  │
│  /         PR   │     │  │ GitHubPR    │  │   Feedback Routes      │  │
│  /auth     Auth │     │  │   Agent     │  │                        │  │
│  /projects List │     │  │  (Durable   │  │  /api/auth/*           │  │
│  /dashboard Mgmt│     │  │   Object)   │  │  /api/feedback/*       │  │
└─────────────────┘     │  │             │  │  /api/dashboard/*      │  │
                        │  │  ┌────────┐ │  │                        │  │
┌─────────────────┐     │  │  │Workers │ │  │  ┌──────┐ ┌────────┐  │  │
│ Feedback Widget │────►│  │  │  AI    │ │  │  │  D1  │ │Workers │  │  │
│ (embedded on    │     │  │  └────────┘ │  │  │  DB  │ │  AI    │  │  │
│  any website)   │     │  └─────────────┘  │  └──────┘ └────────┘  │  │
└─────────────────┘     │                   └────────────────────────┘  │
                        └───────────────────────────────────────────────┘
```

## Getting Started

### Prerequisites

- Node.js 20.x or later
- A Cloudflare account
- Wrangler CLI (included in dependencies)
- A GitHub Personal Access Token with `repo` scope (for the PR Agent)

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Login to Cloudflare:

```bash
npx wrangler login
```

3. Create the D1 database (one-time setup):

```bash
npx wrangler d1 create feedback-db
```

Update the `database_id` in `wrangler.jsonc` with the ID returned by the command.

### Development

Run both the frontend (Vite) and backend (Wrangler) in development mode:

```bash
npm run dev
```

This starts:
- **Frontend** at `http://localhost:5173`
- **Worker** at `http://localhost:8787`

The Vite dev server proxies `/api` requests to the Worker automatically.

### Deployment

Build and deploy to Cloudflare:

```bash
npm run deploy
```

## Usage

### PR Agent

1. Open the app at the root URL (`/`)
2. Create a GitHub Personal Access Token at [GitHub Settings](https://github.com/settings/tokens/new?scopes=repo) with `repo` scope
3. Enter your token and click "Connect to GitHub"
4. Provide a repository URL and describe the changes you want
5. Click "Create PR" and watch the real-time progress
6. Once complete, follow the link to view your pull request

### Feedback Dashboard

1. Navigate to `/auth` and register an account
2. Create a project from the `/projects` page — you'll receive a `projectId` and `apiKey`
3. Open the project dashboard to view, filter, and manage feedback submissions
4. Embed the feedback widget on any website using the project credentials (see below)

### Embedding the Feedback Widget

Add the widget to any page that imports from this project:

```tsx
import { FeedbackWidget } from './feedback/widget';

<FeedbackWidget
  projectId="your-project-id"
  apiKey="your-api-key"
  apiBaseUrl="https://github-pr-agent.<your-subdomain>.workers.dev"
  config={{ theme: "dark", position: "bottom-right", primaryColor: "#5c5ce6" }}
/>
```

When the widget is served from the same origin as the API, `apiBaseUrl` can be omitted (defaults to same-origin). For cross-origin embedding, set it to the full Worker URL.

## Project Structure

```
├── src/
│   ├── server.ts              # Cloudflare Worker entry — routes requests
│   ├── client.tsx             # React frontend with SPA routing
│   ├── main.tsx               # React entry point
│   ├── types.ts               # Shared TypeScript types (Env, PR, Feedback)
│   ├── react-agent.ts         # ReAct agent for autonomous PR creation
│   ├── auth/
│   │   └── AuthPage.tsx       # Login / register UI
│   ├── dashboard/
│   │   ├── Dashboard.tsx      # Feedback management dashboard
│   │   └── ProjectsPage.tsx   # Project list and creation
│   └── feedback/
│       ├── routes.ts          # All /api/* route handlers
│       ├── db.ts              # D1 query helpers (feedback, projects, users)
│       ├── classifier.ts      # AI feedback classifier (70B → 8B → keyword fallback)
│       ├── auth.ts            # Password hashing (PBKDF2), JWT, token encryption
│       └── widget.tsx         # Embeddable feedback widget (React, inline styles)
├── wrangler.jsonc             # Cloudflare Worker + D1 + DO configuration
├── vite.config.ts             # Vite config with /api proxy
├── tsconfig.json              # TypeScript configuration
├── index.html                 # HTML entry point
├── package.json               # Dependencies and scripts
└── WIDGET_BUILD_SPEC.md       # Spec for distributable standalone widget
```

## API Reference

### Auth Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create a new user account |
| POST | `/api/auth/login` | Login and receive a JWT |
| GET | `/api/auth/me` | Get current user info (requires JWT) |

### Feedback Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/feedback/submit` | API Key (`X-API-Key` header) | Submit feedback from the widget |
| POST | `/api/feedback/projects` | JWT | Create a new project |
| GET | `/api/dashboard/projects` | JWT | List all projects for the user |
| GET | `/api/dashboard/projects/:id/feedback` | JWT | List feedback with optional filters |
| PATCH | `/api/dashboard/projects/:pid/feedback/:fid` | JWT | Update feedback status |

### Feedback Submit Request

```
POST /api/feedback/submit
Headers:
  Content-Type: application/json
  X-API-Key: <project-api-key>

Body:
{
  "projectId": "string (required)",
  "title": "string (required)",
  "description": "string (required)",
  "email": "string (optional)",
  "metadata": {
    "userAgent": "string (optional)",
    "url": "string (optional)",
    "referrer": "string (optional)",
    "customFields": {}
  }
}
```

### PR Agent Methods (WebSocket)

| Method | Description |
|--------|-------------|
| `setGitHubToken(token)` | Authenticate with GitHub using a Personal Access Token |
| `createPR(request)` | Create a pull request from a natural language request |
| `createPRReAct(request)` | Create a PR using autonomous ReAct reasoning |
| `reset()` | Reset agent state (preserves GitHub connection) |
| `disconnect()` | Disconnect from GitHub and clear stored token |

## Configuration

### Environment Bindings (wrangler.jsonc)

| Binding | Type | Purpose |
|---------|------|---------|
| `AI` | Workers AI | Code generation and feedback classification |
| `DB` | D1 Database | Feedback, projects, and user storage |
| `GitHubPRAgent` | Durable Object | Persistent PR agent state |
| `ASSETS` | Assets | Serves the built SPA frontend |

### Environment Variables

Set these in `.dev.vars` for local development or via `wrangler secret put` for production:

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | Secret key for signing authentication JWTs |
| `OPENAI_API_KEY` | No | Optional OpenAI key (Workers AI is used by default) |

## Limitations

- The AI model has context limits — very large codebases may require more specific instructions
- Complex multi-file changes may need multiple iterations
- The 70B model may timeout under heavy load (falls back to 8B automatically)
- Feedback classification uses a keyword fallback when AI JSON parsing fails

## Resources

- [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/)
- [Workers AI Models](https://developers.cloudflare.com/workers-ai/models/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [GitHub REST API](https://docs.github.com/en/rest)

## License

MIT
