import { Agent, routeAgentRequest, callable } from "agents";
import type { Env, AgentState, PRRequest, FileChange, PRResult } from "./types";

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

// GitHub API helper class
class GitHubAPI {
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

  // Use AI to analyze the request and generate code changes
  private async generateChanges(
    request: PRRequest,
    repoContents: string
  ): Promise<FileChange[]> {
    this.addProgress("Using AI to analyze and generate code changes...");

    const prompt = `You are a code generation assistant. Output ONLY valid JSON.

${repoContents}

User request: ${request.description.substring(0, 500)}${request.description.length > 500 ? '...' : ''}

RULES:
1. Use exact file paths from the structure above
2. For HTML files at root, use "index.html" not "assets/index.html"  
3. Keep changes minimal and focused
4. For adding content to existing files, include the full updated file

Output JSON array:
[{"path":"filename","content":"file content","action":"create|update"}]

Output ONLY the JSON array. Start with [ end with ]`;

    try {
      // Use Workers AI - try 70B for better quality, fallback to 8B
      console.log("Calling Workers AI...");
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
        response = await this.env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct",
          {
            prompt,
            max_tokens: 4096,
          }
        );
      }
      console.log("Workers AI response received");

      // Get the response text
      let text =
        typeof response === "string"
          ? response
          : (response as { response?: string }).response || "";

      console.log("AI raw response (first 500 chars):", text.substring(0, 500));

      // Clean up the response - remove markdown, leading/trailing text
      text = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      // Try to find JSON array in the response
      const jsonStart = text.indexOf("[");
      const jsonEnd = text.lastIndexOf("]");
      
      if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
        throw new Error("No valid JSON array found in AI response");
      }

      const jsonString = text.substring(jsonStart, jsonEnd + 1);
      const changes = JSON.parse(jsonString) as FileChange[];

      if (!Array.isArray(changes) || changes.length === 0) {
        throw new Error("AI returned empty or invalid changes array");
      }

      this.addProgress(`Generated ${changes.length} file change(s)`);
      return changes;
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error";
      console.error("AI generation error:", errorMsg);
      throw new Error(`AI generation failed: ${errorMsg}`);
    }
  }

  // Main method to create a PR - callable by clients
  @callable()
  async createPR(request: PRRequest): Promise<PRResult> {
    console.log("createPR called with request:", JSON.stringify(request));
    try {
      // Validate input
      const repoInfo = this.parseRepoUrl(request.repoUrl);
      console.log("Parsed repo info:", repoInfo);
      if (!repoInfo) {
        throw new Error(
          "Invalid GitHub repository URL. Use format: owner/repo or https://github.com/owner/repo"
        );
      }

      // Check GitHub connection - try to restore from state if needed
      console.log("GitHub instance:", this.github ? "connected" : "null");
      if (!this.ensureGitHubConnection()) {
        console.log("GitHub not connected and no stored token, returning error");
        return {
          success: false,
          error: "GitHub not connected. Please set your GitHub Personal Access Token first.",
        };
      }
      console.log("GitHub connection verified/restored");

      this.setState({
        ...this.state,
        status: "analyzing",
        currentRequest: request,
        progressMessages: [],
        result: undefined,
        errorMessage: undefined,
      });

      this.addProgress(
        `Starting PR creation for ${repoInfo.owner}/${repoInfo.repo}`
      );

      // Get repository contents
      this.addProgress("Fetching repository contents...");

      let repoContents = "";
      try {
        // Get top-level files to understand the project
        const contents = await this.github.getRepoContents(
          repoInfo.owner,
          repoInfo.repo
        );

        if (Array.isArray(contents)) {
          repoContents = "Repository structure:\n";
          for (const item of contents) {
            repoContents += `- ${item.path} (${item.type})\n`;
            
            // Expand directories one level deep to show structure
            if (item.type === "dir") {
              try {
                const subContents = await this.github.getRepoContents(
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

        // Try to get main index.html to understand project structure
        try {
          const indexHtml = await this.github.getFileContent(
            repoInfo.owner,
            repoInfo.repo,
            "index.html"
          );
          if (indexHtml.content) {
            const decodedIndex = decodeURIComponent(
              escape(atob(indexHtml.content.replace(/\n/g, "")))
            );
            // Only include first 1000 chars to keep context manageable
            repoContents += `\nindex.html exists at root (first 1000 chars):\n${decodedIndex.substring(0, 1000)}...\n`;
          }
        } catch {
          // index.html not found at root
        }

        // Try to get README
        try {
          const readme = await this.github.getFileContent(
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
          // README not found, continue
        }

        this.addProgress("Repository contents fetched");
      } catch (e) {
        this.addProgress(`Note: Could not fetch repo contents: ${e}`);
      }

      // Generate code changes
      this.setState({ ...this.state, status: "generating" });
      const changes = await this.generateChanges(request, repoContents);

      this.setState({
        ...this.state,
        generatedChanges: changes,
      });

      // Create a branch and PR
      this.setState({ ...this.state, status: "creating_pr" });
      const branchName =
        request.branchName ||
        `feature/${Date.now()}-${request.description
          .slice(0, 20)
          .replace(/[^a-z0-9]/gi, "-")
          .toLowerCase()}`;
      const targetBranch = request.targetBranch || "main";

      this.addProgress(`Creating branch: ${branchName}`);

      // Get the SHA of the target branch
      const targetRef = await this.github.getRef(
        repoInfo.owner,
        repoInfo.repo,
        targetBranch
      );
      const baseSha = targetRef.object.sha;

      // Create new branch
      await this.github.createRef(
        repoInfo.owner,
        repoInfo.repo,
        branchName,
        baseSha
      );
      this.addProgress(`Branch ${branchName} created`);

      // Commit changes
      for (const change of changes) {
        if (change.action === "delete") {
          this.addProgress(
            `Skipping delete for ${change.path} (not supported)`
          );
          continue;
        }

        this.addProgress(
          `${change.action === "create" ? "Creating" : "Updating"} ${change.path}...`
        );

        try {
          // Check if file exists to get SHA for updates
          let sha: string | undefined;
          if (change.action === "update") {
            try {
              const existingFile = await this.github.getFileContent(
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

          await this.github.createOrUpdateFile(
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

      // Create Pull Request
      this.addProgress("Creating pull request...");

      const prResult = await this.github.createPullRequest(
        repoInfo.owner,
        repoInfo.repo,
        request.description.slice(0, 100),
        `## Summary\n\n${request.description}\n\n## Changes\n\n${changes.map((c) => `- ${c.action}: \`${c.path}\``).join("\n")}\n\n---\n*Created by GitHub PR Agent on Cloudflare*`,
        branchName,
        targetBranch
      );

      this.addProgress(`Pull request created successfully!`);

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

  // Get current status - callable by clients
  @callable()
  async getStatus() {
    return {
      status: this.state.status,
      githubConnected: this.state.githubConnected,
      progressMessages: this.state.progressMessages,
      result: this.state.result,
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
