# GitHub PR Agent

An AI-powered agent that creates GitHub pull requests from natural language descriptions. Built entirely on Cloudflare's platform using:

- **Cloudflare Agents SDK** - Stateful, durable agents with WebSocket support
- **Workers AI** - AI inference for code generation (Llama 3.3 70B / Llama 3.1 8B)
- **GitHub REST API** - Direct API integration for GitHub operations
- **Durable Objects** - Persistent state and real-time sync
- **React** - Modern frontend with Vite

## ✨ Features

- 🔐 **GitHub Personal Access Token** - Simple, secure authentication
- 💬 **Natural Language Input** - Describe fixes/features in plain English
- 🤖 **AI Code Generation** - Intelligent analysis and code changes
- 🌿 **Automatic PR Creation** - Creates branches and pull requests automatically
- ⚡ **Real-time Updates** - Live progress via WebSocket
- 💾 **Persistent State** - Token and state preserved across sessions

## Architecture

```
┌─────────────────┐     ┌──────────────────────────────────────────┐
│   React Client  │◄────┤           Cloudflare Worker              │
│   (WebSocket)   │     │  ┌────────────────────────────────────┐  │
└─────────────────┘     │  │         GitHubPRAgent              │  │
                        │  │      (Durable Object)              │  │
                        │  │                                    │  │
                        │  │  ┌─────────┐    ┌──────────────┐   │  │
                        │  │  │Workers  │    │ GitHub REST  │   │  │
                        │  │  │   AI    │    │     API      │   │  │
                        │  │  └─────────┘    └──────────────┘   │  │
                        │  └────────────────────────────────────┘  │
                        └──────────────────────────────────────────┘
```

## 🚀 Getting Started

### Prerequisites

- Node.js 20.x or later
- A Cloudflare account
- A GitHub Personal Access Token with `repo` scope
- Wrangler CLI (included in dependencies)

### 📦 Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Login to Cloudflare:

```bash
npx wrangler login
```

### 💻 Development

Run both the frontend (Vite) and backend (Wrangler) in development mode:

```bash
npm run dev
```

This starts:
- **Frontend** at `http://localhost:5173`
- **Worker** at `http://localhost:8787`

### 🌐 Deployment

Build and deploy to Cloudflare:

```bash
npm run deploy
```

## 📖 Usage

1. **Get a GitHub Token** - Create a Personal Access Token at [GitHub Settings](https://github.com/settings/tokens/new?scopes=repo) with `repo` scope
2. **Connect to GitHub** - Enter your token and click "Connect to GitHub"
3. **Enter Repository** - Provide the repository URL (e.g., `owner/repo` or full GitHub URL)
4. **Describe Changes** - Write a natural language description of the fix or feature you want
5. **Create PR** - Click "Create PR" and watch the progress in real-time
6. **View Result** - Once complete, click the link to view your new pull request

## 🔧 How It Works

1. **User Input** - You describe what you want to change in plain English
2. **GitHub Connection** - The agent authenticates using your Personal Access Token via the GitHub REST API
3. **Repository Analysis** - Fetches repo structure and key files (index.html, README, etc.)
4. **AI Analysis** - Workers AI (Llama 3.3 70B with 8B fallback) analyzes your request
5. **Code Generation** - The AI generates the necessary code changes as JSON
6. **PR Creation** - The agent creates a new branch, commits the changes, and opens a pull request

## 📁 Project Structure

```
├── src/
│   ├── server.ts      # Cloudflare Agent (GitHubPRAgent)
│   ├── client.tsx     # React frontend
│   ├── main.tsx       # React entry point
│   └── types.ts       # TypeScript type definitions
├── wrangler.jsonc     # Cloudflare Worker configuration
├── vite.config.ts     # Vite configuration
├── tsconfig.json      # TypeScript configuration
├── index.html         # HTML entry point
└── package.json       # Dependencies and scripts
```

## ⚙️ Configuration

### Workers AI

The agent uses Cloudflare's Workers AI for code generation. The binding is configured in `wrangler.jsonc`:

```json
{
  "ai": {
    "binding": "AI"
  }
}
```

### Durable Objects

The agent state is persisted using Durable Objects with SQLite storage:

```json
{
  "durable_objects": {
    "bindings": [
      {
        "name": "GitHubPRAgent",
        "class_name": "GitHubPRAgent"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["GitHubPRAgent"]
    }
  ]
}
```

## 📚 API Reference

### Agent Methods

| Method | Description |
|--------|-------------|
| `setGitHubToken(token)` | Authenticates with GitHub using a Personal Access Token |
| `checkGitHubStatus()` | Returns connection status and username |
| `createPR(request)` | Creates a pull request from the given request |
| `reset()` | Resets the agent state (preserves GitHub connection) |
| `disconnect()` | Disconnects from GitHub and clears stored token |
| `getStatus()` | Returns current agent status |

### PRRequest Type

```typescript
interface PRRequest {
  repoUrl: string;      // Repository URL (owner/repo or full URL)
  description: string;  // Natural language description
  branchName?: string;  // Optional custom branch name
  targetBranch?: string; // Target branch (default: main)
}
```

## ⚠️ Limitations

- The AI model has context limits, so very large codebases may require more specific instructions
- Complex multi-file changes may need multiple iterations
- Long descriptions may be truncated to fit within token limits
- The 70B model may timeout under heavy load (falls back to 8B automatically)

## 🔗 Resources

- [Cloudflare Agents SDK Documentation](https://developers.cloudflare.com/agents/)
- [Workers AI Models](https://developers.cloudflare.com/workers-ai/models/)
- [GitHub REST API](https://docs.github.com/en/rest)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)

## License

MIT
