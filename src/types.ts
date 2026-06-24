// Type definitions for the GitHub PR Agent + Feedback Service

export interface Env {
  AI: Ai;
  DB: D1Database;
  ASSETS: Fetcher;
  GitHubPRAgent: DurableObjectNamespace;
  JWT_SECRET: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  /** Optional explicit OAuth callback URL (must match GitHub OAuth App settings exactly) */
  GITHUB_OAUTH_CALLBACK_URL?: string;
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

/** Bounded compare-diff evidence captured before a ReAct PR is verified. */
export interface DiffSummary {
  baseBranch: string;
  headBranch: string;
  aheadBy: number;
  files: Array<{
    path: string;
    additions?: number;
    deletions?: number;
    patchPreview: string;
  }>;
  capturedAt: number;
}

/** A single step in the execution plan */
export interface PlanStep {
  id: string;
  label: string;
  status: "pending" | "running" | "completed" | "skipped" | "error";
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

/** Structured execution plan for PR creation */
export interface ExecutionPlan {
  steps: PlanStep[];
  currentStepIndex: number;
  createdAt: number;
}

/** A single decomposed unit of work produced by the planner (AD-004). */
export interface PlanSubtask {
  /** What to do for this subtask. */
  title: string;
  /** Repo file paths this subtask is expected to touch (may include new files). */
  files: string[];
  /** Concrete, checkable outcomes that prove this subtask is done. */
  acceptance: string[];
}

/**
 * A task plan produced before any edits, decomposing a feature into ordered
 * subtasks plus overall acceptance criteria used to verify completeness.
 */
export interface TaskPlan {
  /** One-sentence description of the chosen approach. */
  summary: string;
  subtasks: PlanSubtask[];
  /** Overall checks that must all hold before opening a PR. */
  acceptanceCriteria: string[];
  createdAt: number;
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

  // Structured multi-step execution plan
  plan?: ExecutionPlan;

  // AD-004: decomposed task plan (subtasks + acceptance criteria)
  taskPlan?: TaskPlan;

  // Latest bounded compare diff inspected by the ReAct PR verification gate.
  diffSummary?: DiffSummary;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

// --- Feedback Service Types ---

export interface FeedbackSubmission {
  projectId: string;
  title: string;
  description: string;
  email?: string;
  metadata?: Record<string, unknown>;
}

export interface Feedback {
  id: string;
  projectId: string;
  type: "technical" | "non-technical";
  category?: "bug" | "feature" | "improvement" | "general";
  title: string;
  description: string;
  email?: string;
  status: "pending" | "in-progress" | "completed" | "dismissed";
  metadata?: Record<string, unknown>;
  aiAnalysis?: FeedbackClassification;
  relatedPRUrl?: string;
  relatedPRNumber?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackClassification {
  type: "technical" | "non-technical";
  confidence: number;
  category?: "bug" | "feature" | "improvement" | "general";
  extractedInfo?: Record<string, string>;
}

export interface FeedbackProject {
  id: string;
  name: string;
  apiKey: string;
  description?: string;
  ownerId: string;
  githubToken?: string;
  githubRepo?: string;
  settings: FeedbackProjectSettings;
  createdAt: string;
}

export interface FeedbackProjectSettings {
  enableAutoPR: boolean;
  autoClassify: boolean;
  prAssignee?: string;
  defaultTargetBranch?: string;
}

export interface DashboardUser {
  id: string;
  email: string;
  passwordHash: string;
  name?: string;
  createdAt: string;
}

export interface GitHubConnection {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  githubUserId: number;
  githubUsername: string;
  scopes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
