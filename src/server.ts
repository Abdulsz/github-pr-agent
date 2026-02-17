import { Agent, routeAgentRequest, callable } from "agents";
import type { Env, AgentState, PRRequest, FileChange, PRResult, ExecutionPlan, PlanStep } from "./types";
import { runReActAgent } from "./react-agent";

// Structured plan step IDs for PR creation (order defines execution)
const PLAN_STEP_IDS = [
  "validate_input",
  "ensure_github",
  "fetch_repo",
  "generate_changes",
  "create_branch",
  "apply_changes",
  "create_pr",
] as const;

function createExecutionPlan(): ExecutionPlan {
  const steps: PlanStep[] = PLAN_STEP_IDS.map((id) => ({
    id,
    label: id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    status: "pending",
  }));
  return {
    steps,
    currentStepIndex: 0,
    createdAt: Date.now(),
  };
}

function setStepStatus(
  plan: ExecutionPlan,
  stepIndex: number,
  status: PlanStep["status"],
  error?: string
): ExecutionPlan {
  const steps = plan.steps.map((s, i) => {
    if (i !== stepIndex) return s;
    const next: PlanStep = { ...s, status, error };
    if (status === "running") next.startedAt = Date.now();
    if (status === "completed" || status === "error" || status === "skipped")
      next.completedAt = Date.now();
    return next;
  });
  return { ...plan, steps, currentStepIndex: stepIndex };
}

// GitHub API response types
interface GitHubUser {
  login: string;
  id: number;
  name?: string;
}

interface GitHubContent {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir";
  content?: string;
}

interface GitHubRef {
  ref: string;
  object: {
    sha: string;
    type: string;
  };
}

interface GitHubPullRequest {
  id: number;
  number: number;
  html_url: string;
  state: string;
}

// GitHub API helper class (exported for ReAct agent)
export class GitHubAPI {
  private token: string;
  private baseUrl = "https://api.github.com";

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "GitHub-PR-Agent-Cloudflare",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<T>;
  }

  async getUser(): Promise<GitHubUser> {
    return this.request<GitHubUser>("/user");
  }

  async getRepoContents(owner: string, repo: string, path: string = ""): Promise<GitHubContent[]> {
    return this.request<GitHubContent[]>(`/repos/${owner}/${repo}/contents/${path}`);
  }

  async getRef(owner: string, repo: string, ref: string): Promise<GitHubRef> {
    return this.request<GitHubRef>(`/repos/${owner}/${repo}/git/ref/heads/${ref}`);
  }

  async createRef(owner: string, repo: string, ref: string, sha: string): Promise<GitHubRef> {
    return this.request<GitHubRef>(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${ref}`,
        sha,
      }),
    });
  }

  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<GitHubContent> {
    const query = ref ? `?ref=${ref}` : "";
    return this.request<GitHubContent>(`/repos/${owner}/${repo}/contents/${path}${query}`);
  }

  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string,
    sha?: string
  ): Promise<{ content: GitHubContent }> {
    const body: Record<string, string> = {
      message,
      content: btoa(unescape(encodeURIComponent(content))), // Base64 encode
      branch,
    };
    if (sha) {
      body.sha = sha;
    }

    return this.request<{ content: GitHubContent }>(`/repos/${owner}/${repo}/contents/${path}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string
  ): Promise<GitHubPullRequest> {
    return this.request<GitHubPullRequest>(`/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title,
        body,
        head,
        base,
      }),
    });
  }

  // Compare two refs to determine if there are commits ahead on head vs base
  async compareCommits(
    owner: string,
    repo: string,
    base: string,
    head: string
  ): Promise<{ ahead_by: number; behind_by: number; total_commits: number } & Record<string, unknown>> {
    return this.request(
      `/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`
    );
  }
}

// GitHub PR Agent - Creates PRs from natural language descriptions
export class GitHubPRAgent extends Agent<Env, AgentState> {
  private github: GitHubAPI | null = null;

  // Initial state
  initialState: AgentState = {
    status: "idle",
    githubConnected: false,
    progressMessages: [],
  };

  // Called when the agent starts - restore GitHub connection if token exists
  async onStart() {
    console.log("Agent onStart - checking for stored token");

    // Clean up any stale MCP server connections from storage.
    // The agents framework auto-restores these before onStart(), which
    // causes errors when the remote MCP server (e.g. mcp.github.com) is
    // unreachable. We don't use MCP servers, so wipe the table.
    try {
      this.sql`DELETE FROM cf_agents_mcp_servers`;
      console.log("Cleared stale MCP server connections from storage");
    } catch {
      // Table may not exist on first run - that's fine
    }

    // Restore GitHub connection from stored token if available
    if (this.state.githubToken && !this.github) {
      console.log("Restoring GitHub connection from stored token");
      this.github = new GitHubAPI(this.state.githubToken);
    }
  }

  // Add a progress message and broadcast to clients
  private addProgress(message: string) {
    console.log("Progress:", message);
    const messages = [...this.state.progressMessages, message];
    this.setState({
      ...this.state,
      progressMessages: messages,
    });
  }

  // Ensure GitHub connection is active (restore from state if needed)
  private ensureGitHubConnection(): boolean {
    if (this.github) return true;
    
    // Try to restore from stored token
    if (this.state.githubToken) {
      console.log("Restoring GitHub connection from stored token");
      this.github = new GitHubAPI(this.state.githubToken);
      return true;
    }
    
    return false;
  }

  // Set GitHub token and verify connection
  @callable()
  async setGitHubToken(token: string): Promise<{
    connected: boolean;
    username?: string;
    error?: string;
  }> {
    console.log("setGitHubToken called");
    try {
      this.addProgress("Verifying GitHub token...");

      this.github = new GitHubAPI(token);
      const user = await this.github.getUser();

      // Store token in state to persist across reloads
      this.setState({
        ...this.state,
        status: "idle",
        githubConnected: true,
        githubToken: token,
        githubUsername: user.login,
        githubAuthUrl: undefined,
        errorMessage: undefined,
      });

      this.addProgress(`Connected to GitHub as ${user.login}!`);
      return { connected: true, username: user.login };
    } catch (error) {
      console.error("Error verifying GitHub token:", error);
      const errorMsg = error instanceof Error ? error.message : "Unknown error";

      this.github = null;
      this.setState({
        ...this.state,
        status: "error",
        githubConnected: false,
        githubToken: undefined,
        githubUsername: undefined,
        errorMessage: `Failed to connect to GitHub: ${errorMsg}`,
      });

      return { connected: false, error: errorMsg };
    }
  }

  // Check if connected to GitHub
  @callable()
  async checkGitHubStatus(): Promise<{
    connected: boolean;
    username?: string;
  }> {
    if (!this.github) {
      return { connected: false };
    }

    try {
      const user = await this.github.getUser();
      return { connected: true, username: user.login };
    } catch {
      this.github = null;
      this.setState({
        ...this.state,
        githubConnected: false,
      });
      return { connected: false };
    }
  }

  // Parse GitHub repo URL to extract owner and repo
  private parseRepoUrl(url: string): { owner: string; repo: string } | null {
    // Handle various GitHub URL formats
    const patterns = [
      /github\.com\/([^\/]+)\/([^\/\s]+)/,
      /^([^\/]+)\/([^\/\s]+)$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          owner: match[1],
          repo: match[2].replace(/\.git$/, ""),
        };
      }
    }
    return null;
  }

  // Validate parsed AI output against FileChange schema
  private validateChanges(
    data: unknown
  ): { valid: true; changes: FileChange[] } | { valid: false; error: string } {
    if (!Array.isArray(data)) {
      return { valid: false, error: "Output must be a JSON array." };
    }
    if (data.length === 0) {
      return { valid: false, error: "Array must not be empty; include at least one file change." };
    }
    const validActions = ["create", "update", "delete"];
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (item === null || typeof item !== "object") {
        return { valid: false, error: `Item ${i + 1}: must be an object.` };
      }
      const obj = item as Record<string, unknown>;
      if (typeof obj.path !== "string" || !obj.path.trim()) {
        return { valid: false, error: `Item ${i + 1}: "path" must be a non-empty string.` };
      }
      if (typeof obj.content !== "string") {
        return { valid: false, error: `Item ${i + 1}: "content" must be a string.` };
      }
      if (!validActions.includes(obj.action as string)) {
        return {
          valid: false,
          error: `Item ${i + 1}: "action" must be one of: create, update, delete. Got: ${JSON.stringify(obj.action)}.`,
        };
      }
    }
    return {
      valid: true,
      changes: data as FileChange[],
    };
  }

  // Use AI to analyze the request and generate code changes (with self-correcting validation loop)
  private async generateChanges(
    request: PRRequest,
    repoContents: string
  ): Promise<FileChange[]> {
    const maxAttempts = 3;
    let lastValidationError = "";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.addProgress(
        attempt === 1
          ? "Using AI to analyze and generate code changes..."
          : `Validating output (attempt ${attempt}/${maxAttempts})...`
      );

      const retryHint =
        lastValidationError &&
        `\n\nPREVIOUS ATTEMPT WAS REJECTED. Fix the following and output ONLY the corrected JSON array:\n${lastValidationError}`;

      const descriptionStr = String(request.description ?? "");
      const prompt = `You are a code generation assistant. Output ONLY valid JSON.

${repoContents}

User request: ${descriptionStr.substring(0, 500)}${descriptionStr.length > 500 ? "..." : ""}

RULES:
1. Use exact file paths from the structure above
2. For HTML files at root, use "index.html" not "assets/index.html"
3. Keep changes minimal and focused
4. For adding content to existing files, include the full updated file
5. Each object MUST have: "path" (string), "content" (string), "action" ("create" | "update" | "delete")
${retryHint}

Output JSON array:
[{"path":"filename","content":"file content","action":"create|update|delete"}]

Output ONLY the JSON array. Start with [ end with ]`;

      try {
        // Use Workers AI - try 70B for better quality, fallback to 8B
        console.log(`Calling Workers AI (attempt ${attempt})...`);
        let response;
        try {
          response = await this.env.AI.run(
            "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
            {
              prompt,
              max_tokens: 4096,
            }
          );
        } catch (e) {
          console.log("70B model failed, trying 8B fallback:", e);
          response = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
            prompt,
            max_tokens: 4096,
          });
        }
        console.log("Workers AI response received");

        const raw =
          typeof response === "string"
            ? response
            : (response as { response?: unknown }).response;
        let text =
          typeof raw === "string"
            ? raw
            : raw != null
              ? String(raw)
              : "";

        console.log("AI raw response (first 500 chars):", String(text).substring(0, 500));

        text = text
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();

        const jsonStart = text.indexOf("[");
        const jsonEnd = text.lastIndexOf("]");

        if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
          lastValidationError = "No valid JSON array found (response must start with [ and end with ]).";
          continue;
        }

        const jsonString = text.substring(jsonStart, jsonEnd + 1);
        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonString);
        } catch {
          lastValidationError = "Output is not valid JSON. Check quotes, commas, and escaping.";
          continue;
        }

        const result = this.validateChanges(parsed);
        if (result.valid) {
          this.addProgress(`Generated ${result.changes.length} file change(s)`);
          return result.changes;
        }

        lastValidationError = result.error;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        console.error("AI generation error:", errorMsg);
        throw new Error(`AI generation failed: ${errorMsg}`);
      }
    }

    throw new Error(
      `AI output could not be validated after ${maxAttempts} attempts. Last error: ${lastValidationError}`
    );
  }

  // Execute one plan step and update state (for structured multi-step execution)
  private setPlanStepRunning(stepIndex: number) {
    if (!this.state.plan) return;
    const plan = setStepStatus(this.state.plan, stepIndex, "running");
    this.setState({ ...this.state, plan, status: "analyzing" });
  }

  private setPlanStepCompleted(stepIndex: number) {
    if (!this.state.plan) return;
    const plan = setStepStatus(this.state.plan, stepIndex, "completed");
    this.setState({ ...this.state, plan });
  }

  private setPlanStepError(stepIndex: number, error: string) {
    if (!this.state.plan) return;
    const plan = setStepStatus(this.state.plan, stepIndex, "error", error);
    this.setState({ ...this.state, plan });
  }

  // Main method to create a PR - structured multi-step execution via plan
  @callable()
  async createPR(request: PRRequest): Promise<PRResult> {
    console.log("createPR called with request:", JSON.stringify(request));
    const plan = createExecutionPlan();
    this.setState({
      ...this.state,
      status: "analyzing",
      currentRequest: request,
      progressMessages: [],
      result: undefined,
      errorMessage: undefined,
      plan,
    });
    this.addProgress(`Starting PR creation (${plan.steps.length} steps)`);

    let repoInfo: { owner: string; repo: string } | null = null;
    let repoContents = "";
    let changes: FileChange[] = [];
    let branchName = "";
    const targetBranch = request.targetBranch || "main";

    try {
      // Step 0: Validate input
      const step0 = 0;
      this.setPlanStepRunning(step0);
      this.addProgress("Validating repository URL...");
      repoInfo = this.parseRepoUrl(request.repoUrl);
      if (!repoInfo) {
        throw new Error(
          "Invalid GitHub repository URL. Use format: owner/repo or https://github.com/owner/repo"
        );
      }
      this.setPlanStepCompleted(step0);
      this.addProgress(`Repository: ${repoInfo.owner}/${repoInfo.repo}`);

      // Step 1: Ensure GitHub connection
      const step1 = 1;
      this.setPlanStepRunning(step1);
      if (!this.ensureGitHubConnection()) {
        throw new Error(
          "GitHub not connected. Please set your GitHub Personal Access Token first."
        );
      }
      this.setPlanStepCompleted(step1);
      this.addProgress("GitHub connection verified");

      // Step 2: Fetch repository contents
      const step2 = 2;
      this.setPlanStepRunning(step2);
      this.setState({ ...this.state, status: "analyzing" });
      this.addProgress("Fetching repository contents...");
      try {
        const contents = await this.github!.getRepoContents(
          repoInfo.owner,
          repoInfo.repo
        );
        if (Array.isArray(contents)) {
          repoContents = "Repository structure:\n";
          for (const item of contents) {
            repoContents += `- ${item.path} (${item.type})\n`;
            if (item.type === "dir") {
              try {
                const subContents = await this.github!.getRepoContents(
                  repoInfo.owner,
                  repoInfo.repo,
                  item.path
                );
                if (Array.isArray(subContents)) {
                  for (const subItem of subContents) {
                    repoContents += `  - ${subItem.path} (${subItem.type})\n`;
                  }
                }
              } catch {
                // Skip if can't read directory
              }
            }
          }
        }
        try {
          const indexHtml = await this.github!.getFileContent(
            repoInfo.owner,
            repoInfo.repo,
            "index.html"
          );
          if (indexHtml.content) {
            const decodedIndex = decodeURIComponent(
              escape(atob(indexHtml.content.replace(/\n/g, "")))
            );
            repoContents += `\nindex.html exists at root (first 1000 chars):\n${decodedIndex.substring(0, 1000)}...\n`;
          }
        } catch {
          // index.html not found at root
        }
        try {
          const readme = await this.github!.getFileContent(
            repoInfo.owner,
            repoInfo.repo,
            "README.md"
          );
          if (readme.content) {
            const decodedReadme = decodeURIComponent(
              escape(atob(readme.content.replace(/\n/g, "")))
            );
            repoContents += `\nREADME.md:\n${decodedReadme}\n`;
          }
        } catch {
          // README not found
        }
        this.addProgress("Repository contents fetched");
      } catch (e) {
        this.addProgress(`Note: Could not fetch repo contents: ${e}`);
      }
      this.setPlanStepCompleted(step2);

      // Step 3: Generate code changes
      const step3 = 3;
      this.setPlanStepRunning(step3);
      this.setState({ ...this.state, status: "generating" });
      changes = await this.generateChanges(request, repoContents);
      this.setState({ ...this.state, generatedChanges: changes });
      this.setPlanStepCompleted(step3);

      // Step 4: Create branch
      const step4 = 4;
      this.setPlanStepRunning(step4);
      this.setState({ ...this.state, status: "creating_pr" });
      branchName =
        request.branchName ||
        `feature/${Date.now()}-${request.description
          .slice(0, 20)
          .replace(/[^a-z0-9]/gi, "-")
          .toLowerCase()}`;
      this.addProgress(`Creating branch: ${branchName}`);
      const targetRef = await this.github!.getRef(
        repoInfo.owner,
        repoInfo.repo,
        targetBranch
      );
      await this.github!.createRef(
        repoInfo.owner,
        repoInfo.repo,
        branchName,
        targetRef.object.sha
      );
      this.addProgress(`Branch ${branchName} created`);
      this.setPlanStepCompleted(step4);

      // Step 5: Apply changes (commit each file)
      const step5 = 5;
      this.setPlanStepRunning(step5);
      for (const change of changes) {
        if (change.action === "delete") {
          this.addProgress(`Skipping delete for ${change.path} (not supported)`);
          continue;
        }
        this.addProgress(
          `${change.action === "create" ? "Creating" : "Updating"} ${change.path}...`
        );
        try {
          let sha: string | undefined;
          if (change.action === "update") {
            try {
              const existingFile = await this.github!.getFileContent(
                repoInfo.owner,
                repoInfo.repo,
                change.path,
                branchName
              );
              sha = existingFile.sha;
            } catch {
              // File doesn't exist, will create
            }
          }
          await this.github!.createOrUpdateFile(
            repoInfo.owner,
            repoInfo.repo,
            change.path,
            change.content,
            `${change.action}: ${change.path} - ${request.description.slice(0, 50)}`,
            branchName,
            sha
          );
          this.addProgress(`${change.path} committed`);
        } catch (e) {
          this.addProgress(
            `Warning: Could not ${change.action} ${change.path}: ${e}`
          );
        }
      }
      this.setPlanStepCompleted(step5);

      // Step 6: Create pull request
      const step6 = 6;
      this.setPlanStepRunning(step6);
      // Ensure there are commits between target and feature branch before creating PR
      this.addProgress("Verifying branch has commits before creating PR...");
      const comparison = await this.github!.compareCommits(
        repoInfo.owner,
        repoInfo.repo,
        targetBranch,
        branchName
      );
      if (!comparison || typeof (comparison as any).ahead_by !== "number") {
        throw new Error("Could not compare branches to verify commits");
      }
      if ((comparison as any).ahead_by <= 0) {
        throw new Error(
          `No commits between ${targetBranch} and ${branchName}. Commit changes before creating a PR.`
        );
      }
      this.addProgress("Creating pull request...");
      const prResult = await this.github!.createPullRequest(
        repoInfo.owner,
        repoInfo.repo,
        request.description.slice(0, 100),
        `## Summary\n\n${request.description}\n\n## Changes\n\n${changes.map((c) => `- ${c.action}: \`${c.path}\``).join("\n")}\n\n---\n*Created by GitHub PR Agent on Cloudflare*`,
        branchName,
        targetBranch
      );
      this.addProgress("Pull request created successfully!");
      this.setPlanStepCompleted(step6);

      const result: PRResult = {
        success: true,
        prUrl: prResult.html_url,
        branchName,
      };
      this.setState({
        ...this.state,
        status: "completed",
        result,
      });
      return result;
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error";
      this.addProgress(`Error: ${errorMsg}`);
      const result: PRResult = {
        success: false,
        error: errorMsg,
      };
      this.setState({
        ...this.state,
        status: "error",
        result,
        errorMessage: errorMsg,
      });
      return result;
    }
  }

  // Create PR using ReAct - Full autonomous reasoning (Reasoning + Acting loop)
  @callable()
  async createPRReAct(request: PRRequest): Promise<PRResult> {
    console.log("createPRReAct called with request:", JSON.stringify(request));
    try {
      const repoInfo = this.parseRepoUrl(request.repoUrl);
      if (!repoInfo) {
        throw new Error(
          "Invalid GitHub repository URL. Use format: owner/repo or https://github.com/owner/repo"
        );
      }

      if (!this.ensureGitHubConnection()) {
        return {
          success: false,
          error: "GitHub not connected. Please set your GitHub Personal Access Token first.",
        };
      }

      this.setState({
        ...this.state,
        status: "analyzing",
        currentRequest: request,
        progressMessages: [],
        result: undefined,
        errorMessage: undefined,
      });

      this.addProgress(`Starting ReAct autonomous PR creation for ${repoInfo.owner}/${repoInfo.repo}`);
      this.addProgress("Agent will reason and act autonomously using GitHub tools...");

      const ctx = {
        github: this.github!,
        repoInfo,
        request,
        addProgress: (msg: string) => this.addProgress(msg),
      };

      const result = await runReActAgent(this.env, ctx);

      if (result.success) {
        const prResult: PRResult = {
          success: true,
          prUrl: result.prUrl,
          branchName: result.branchName,
        };
        this.setState({
          ...this.state,
          status: "completed",
          result: prResult,
        });
        return prResult;
      }

      const errorResult: PRResult = {
        success: false,
        error: result.error || "ReAct agent could not complete the task",
      };
      this.setState({
        ...this.state,
        status: "error",
        result: errorResult,
        errorMessage: errorResult.error,
      });
      return errorResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.addProgress(`Error: ${errorMsg}`);
      const result: PRResult = { success: false, error: errorMsg };
      this.setState({
        ...this.state,
        status: "error",
        result,
        errorMessage: errorMsg,
      });
      return result;
    }
  }

  // Reset the agent state - callable by clients
  @callable()
  async reset() {
    // Preserve GitHub connection when resetting
    this.setState({
      ...this.initialState,
      githubConnected: this.state.githubConnected,
      githubToken: this.state.githubToken,
      githubUsername: this.state.githubUsername,
    });
  }

  // Get current status - callable by clients (includes structured plan when running)
  @callable()
  async getStatus() {
    return {
      status: this.state.status,
      githubConnected: this.state.githubConnected,
      progressMessages: this.state.progressMessages,
      result: this.state.result,
      plan: this.state.plan,
    };
  }

  // Disconnect from GitHub
  @callable()
  async disconnect() {
    this.github = null;
    this.setState({
      ...this.initialState,
      githubConnected: false,
      githubToken: undefined,
      githubUsername: undefined,
    });
    return { disconnected: true };
  }
}

// Route requests to agents
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Serve static files for the frontend
    if (url.pathname === "/" || url.pathname.startsWith("/assets")) {
      // This will be handled by Vite in development
      // and by the built assets in production
    }

    // Route agent requests
    return (
      (await routeAgentRequest(request, env)) ??
      new Response("Not found", { status: 404 })
    );
  },
};
