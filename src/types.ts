// Type definitions for the GitHub PR Agent

export interface Env {
  AI: Ai;
  GitHubPRAgent: DurableObjectNamespace;
  OPENAI_API_KEY?: string;
}

export interface PRRequest {
  repoUrl: string;
  description: string;
  branchName?: string;
  targetBranch?: string;
}

export interface FileChange {
  path: string;
  content: string;
  action: "create" | "update" | "delete";
}

export interface PRResult {
  success: boolean;
  prUrl?: string;
  error?: string;
  branchName?: string;
}

export interface AgentState {
  // Current task status
  status:
    | "idle"
    | "connecting"
    | "analyzing"
    | "generating"
    | "creating_pr"
    | "completed"
    | "error";

  // GitHub connection status
  githubConnected: boolean;
  githubAuthUrl?: string;
  githubToken?: string; // Stored to persist across reloads
  githubUsername?: string;

  // Current PR request
  currentRequest?: PRRequest;

  // Generated changes
  generatedChanges?: FileChange[];

  // Result
  result?: PRResult;

  // Progress messages
  progressMessages: string[];

  // Error message if any
  errorMessage?: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}
