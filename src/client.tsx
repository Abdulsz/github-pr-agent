import { useState, useCallback } from "react";
import { useAgent } from "agents/react";
import type { AgentState, PRRequest } from "./types";

// Styles — minimal black UI, white font, subtle borders
const styles = {
  container: {
    minHeight: "100vh",
    background: "#000",
    color: "#fff",
    fontFamily: '"Manrope", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  main: {
    maxWidth: "800px",
    margin: "0 auto",
    padding: "2rem",
  },
  header: {
    textAlign: "center" as const,
    marginBottom: "3rem",
  },
  title: {
    fontSize: "2.5rem",
    fontWeight: 700,
    color: "#fff",
    marginBottom: "0.5rem",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    color: "#888",
    fontSize: "1.1rem",
  },
  card: {
    background: "rgba(255, 255, 255, 0.06)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    borderRadius: "16px",
    padding: "2rem",
    marginBottom: "1.5rem",
    border: "1px solid rgba(255, 255, 255, 0.12)",
  },
  label: {
    display: "block",
    marginBottom: "0.5rem",
    fontWeight: 500,
    color: "#fff",
  },
  input: {
    width: "100%",
    padding: "0.75rem 1rem",
    borderRadius: "12px",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    background: "rgba(255, 255, 255, 0.06)",
    color: "#fff",
    fontSize: "1rem",
    marginBottom: "1rem",
    outline: "none",
    transition: "border-color 0.2s",
    boxSizing: "border-box" as const,
  },
  textarea: {
    width: "100%",
    padding: "0.75rem 1rem",
    borderRadius: "12px",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    background: "rgba(255, 255, 255, 0.06)",
    color: "#fff",
    fontSize: "1rem",
    marginBottom: "1rem",
    minHeight: "120px",
    resize: "vertical" as const,
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box" as const,
  },
  button: {
    padding: "0.875rem 2rem",
    borderRadius: "12px",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    fontWeight: 600,
    fontSize: "1rem",
    cursor: "pointer",
    transition: "border-color 0.2s, opacity 0.2s",
  },
  primaryButton: {
    background: "#fff",
    color: "#000",
    borderColor: "#fff",
  },
  secondaryButton: {
    background: "transparent",
    color: "#fff",
    marginLeft: "1rem",
  },
  disabledButton: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.25rem 0.75rem",
    borderRadius: "12px",
    fontSize: "0.875rem",
    fontWeight: 500,
    border: "1px solid rgba(255, 255, 255, 0.12)",
  },
  connectedBadge: {
    borderColor: "rgba(255, 255, 255, 0.4)",
    color: "#fff",
  },
  disconnectedBadge: {
    borderColor: "rgba(255, 255, 255, 0.12)",
    color: "#888",
  },
  progressList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
  },
  progressItem: {
    padding: "0.5rem 0",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  successBox: {
    background: "rgba(255, 255, 255, 0.06)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "16px",
    padding: "1rem",
  },
  errorBox: {
    background: "rgba(255, 255, 255, 0.06)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "16px",
    padding: "1rem",
  },
  link: {
    color: "#fff",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
    fontWeight: 500,
  },
  spinner: {
    width: "16px",
    height: "16px",
    border: "2px solid rgba(255, 255, 255, 0.2)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    display: "inline-block",
  },
  helpText: {
    fontSize: "0.85rem",
    color: "#888",
    marginTop: "0.25rem",
    marginBottom: "1rem",
  },
  planCard: {
    marginBottom: "1rem",
  },
  stepList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
  },
  stepItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.5rem 0",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
    fontSize: "0.9rem",
  },
  stepIcon: {
    width: "20px",
    textAlign: "center" as const,
    fontWeight: 600,
  },
};

// Add keyframes for spinner + minimal focus styles
const spinnerKeyframes = `
@keyframes spin {
  to { transform: rotate(360deg); }
}
input:focus, textarea:focus {
  border-color: rgba(255, 255, 255, 0.4);
}
`;

// Default state
const defaultState: AgentState = {
  status: "idle",
  githubConnected: false,
  progressMessages: [],
};

export default function App() {
  const [repoUrl, setRepoUrl] = useState("");
  const [description, setDescription] = useState("");
  const [branchName, setBranchName] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [githubUsername, setGithubUsername] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [useReAct, setUseReAct] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [localState, setLocalState] = useState<AgentState>(defaultState);

  // Connect to the GitHub PR Agent
  const agent = useAgent({
    agent: "GitHubPRAgent",
    onStateUpdate: (state: AgentState) => {
      setLocalState(state);
      if (state.status === "completed" || state.status === "error") {
        setIsSubmitting(false);
      }
    },
  });

  // Use local state or default
  const state = localState;

  // Get username from state if available (for persistence)
  const displayUsername = githubUsername || (state as AgentState & { githubUsername?: string }).githubUsername || "user";

  const handleConnectGitHub = useCallback(async () => {
    if (!githubToken.trim()) {
      setConnectionError("Please enter your GitHub Personal Access Token");
      return;
    }

    setIsConnecting(true);
    setConnectionError("");

    try {
      const result = await agent.call("setGitHubToken", [githubToken]);
      if (result && typeof result === "object") {
        const typedResult = result as {
          connected: boolean;
          username?: string;
          error?: string;
        };
        if (typedResult.connected && typedResult.username) {
          setGithubUsername(typedResult.username);
          setGithubToken(""); // Clear token from UI for security
        } else if (typedResult.error) {
          setConnectionError(typedResult.error);
        }
      }
    } catch (error) {
      console.error("Failed to connect to GitHub:", error);
      setConnectionError(
        error instanceof Error ? error.message : "Failed to connect"
      );
    } finally {
      setIsConnecting(false);
    }
  }, [agent, githubToken]);

  const handleDisconnect = useCallback(async () => {
    try {
      await agent.call("disconnect");
      setGithubUsername("");
    } catch (error) {
      console.error("Failed to disconnect:", error);
    }
  }, [agent]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!repoUrl || !description) {
        alert("Please fill in the repository URL and description");
        return;
      }

      setIsSubmitting(true);

      const request: PRRequest = {
        repoUrl,
        description,
        branchName: branchName || undefined,
      };

      try {
        await agent.call(useReAct ? "createPRReAct" : "createPR", [request]);
      } catch (error) {
        console.error("Failed to create PR:", error);
        setIsSubmitting(false);
      }
    },
    [agent, repoUrl, description, branchName, useReAct]
  );

  const handleReset = useCallback(async () => {
    try {
      await agent.call("reset");
      setRepoUrl("");
      setDescription("");
      setBranchName("");
      setIsSubmitting(false);
    } catch (error) {
      console.error("Failed to reset:", error);
    }
  }, [agent]);

  const isLoading =
    isSubmitting ||
    isConnecting ||
    ["connecting", "analyzing", "generating", "creating_pr"].includes(
      state.status
    );

  return (
    <div style={styles.container}>
      <style>{spinnerKeyframes}</style>
      <main style={styles.main}>
        {/* Header */}
        <header style={styles.header}>
          <h1 style={styles.title}>GitHub PR Agent</h1>
          <p style={styles.subtitle}>
            Describe a fix or feature, and I'll create a PR for you
          </p>
        </header>

        {/* GitHub Connection Status */}
        <div style={styles.card}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: state.githubConnected ? 0 : "1rem",
            }}
          >
            <div>
              <strong>GitHub Connection</strong>
              <div style={{ marginTop: "0.5rem" }}>
                <span
                  style={{
                    ...styles.statusBadge,
                    ...(state.githubConnected
                      ? styles.connectedBadge
                      : styles.disconnectedBadge),
                  }}
                >
                  {state.githubConnected
                    ? `✓ Connected as ${displayUsername}`
                    : "○ Not Connected"}
                </span>
              </div>
            </div>
            {state.githubConnected && (
              <button
                onClick={handleDisconnect}
                style={{
                  ...styles.button,
                  ...styles.secondaryButton,
                  marginLeft: 0,
                }}
              >
                Disconnect
              </button>
            )}
          </div>

          {!state.githubConnected && (
            <div>
              <label style={styles.label}>GitHub Personal Access Token</label>
              <input
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                style={styles.input}
                disabled={isConnecting}
              />
              <p style={styles.helpText}>
                Create a token at{" "}
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.link}
                >
                  GitHub Settings → Personal Access Tokens
                </a>{" "}
                with <code>repo</code> scope
              </p>

              {connectionError && (
                <div style={{ ...styles.errorBox, marginBottom: "1rem" }}>
                  <p style={{ margin: 0, color: "#fff" }}>
                    {connectionError}
                  </p>
                </div>
              )}

              <button
                onClick={handleConnectGitHub}
                style={{
                  ...styles.button,
                  ...styles.primaryButton,
                  ...(isConnecting ? styles.disabledButton : {}),
                }}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span style={styles.spinner} />
                    Connecting...
                  </span>
                ) : (
                  "Connect to GitHub"
                )}
              </button>
            </div>
          )}
        </div>

        {/* PR Request Form */}
        <div style={styles.card}>
          <form onSubmit={handleSubmit}>
            <div>
              <label style={styles.label}>Repository URL</label>
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="e.g., owner/repo or https://github.com/owner/repo"
                style={styles.input}
                disabled={isLoading}
              />
            </div>

            <div>
              <label style={styles.label}>Describe the Fix/Feature</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Add a dark mode toggle to the settings page. It should save the preference to localStorage and apply the theme immediately."
                style={styles.textarea}
                disabled={isLoading}
              />
            </div>

            <div>
              <label style={styles.label}>Branch Name (optional)</label>
              <input
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="e.g., feature/dark-mode (auto-generated if empty)"
                style={styles.input}
                disabled={isLoading}
              />
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  cursor: "pointer",
                  color: "#fff",
                }}
              >
                <input
                  type="checkbox"
                  checked={useReAct}
                  onChange={(e) => setUseReAct(e.target.checked)}
                  disabled={isLoading}
                />
                <span title="ReAct: Agent reasons autonomously and uses tools to explore the repo before creating the PR">
                  ReAct (autonomous reasoning)
                </span>
              </label>
              <div style={{ display: "flex", gap: "1rem" }}>
                <button
                  type="button"
                  onClick={handleReset}
                  style={{
                    ...styles.button,
                    ...styles.secondaryButton,
                    marginLeft: 0,
                  }}
                  disabled={isLoading}
                >
                  Reset
                </button>
                <button
                  type="submit"
                style={{
                  ...styles.button,
                  ...styles.primaryButton,
                  ...(isLoading || !state.githubConnected
                    ? styles.disabledButton
                    : {}),
                }}
                disabled={isLoading || !state.githubConnected}
              >
                {isSubmitting ? (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span style={styles.spinner} />
                    {useReAct ? "ReAct reasoning..." : "Processing..."}
                  </span>
                ) : (
                  useReAct ? "Create PR (ReAct)" : "Create PR"
                )}
              </button>
              </div>
            </div>
          </form>
        </div>

        {/* Execution plan (structured steps) — only while running, hide when result exists */}
        {state.plan && state.plan.steps.length > 0 && !state.result && (
          <div style={{ ...styles.card, ...styles.planCard }}>
            <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>
              Execution plan
            </h3>
            <p
              style={{
                margin: "0 0 1rem 0",
                fontSize: "0.875rem",
                color: "#888",
              }}
            >
              Step {state.plan.currentStepIndex + 1} of {state.plan.steps.length}
            </p>
            <ul style={styles.stepList}>
              {state.plan.steps.map((step, idx) => {
                const icon =
                  step.status === "completed"
                    ? "✓"
                    : step.status === "running"
                      ? "●"
                      : step.status === "error"
                        ? "✗"
                        : "○";
                const color =
                  step.status === "completed"
                    ? "#fff"
                    : step.status === "running"
                      ? "#fff"
                      : step.status === "error"
                        ? "#fff"
                        : "#888";
                return (
                  <li key={step.id} style={styles.stepItem}>
                    <span style={{ ...styles.stepIcon, color }}>{icon}</span>
                    <span
                      style={{
                        color:
                          step.status === "pending"
                            ? "#888"
                            : "#fff",
                      }}
                    >
                      {step.label}
                    </span>
                    {step.error && (
                      <span style={{ color: "#fff", fontSize: "0.8rem", opacity: 0.9 }}>
                        {" "}
                        — {step.error}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Progress — only while running, hide when result exists so old runs don't linger */}
        {state.progressMessages.length > 0 && !state.result && (
          <div style={styles.card}>
            <h3 style={{ marginTop: 0, marginBottom: "1rem" }}>Progress</h3>
            <ul style={styles.progressList}>
              {state.progressMessages.map((msg: string, idx: number) => (
                <li key={idx} style={styles.progressItem}>
                  <span style={{ color: "#fff" }}>→</span>
                  {msg}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Result */}
        {state.result && (
          <div style={styles.card}>
            {state.result.success ? (
              <div style={styles.successBox}>
                <h3
                  style={{
                    marginTop: 0,
                    marginBottom: "0.5rem",
                    color: "#fff",
                  }}
                >
                  ✓ PR Created Successfully!
                </h3>
                <p style={{ margin: 0 }}>
                  Branch: <code>{state.result.branchName}</code>
                </p>
                {state.result.prUrl && (
                  <p style={{ margin: "0.5rem 0 0 0" }}>
                    <a
                      href={state.result.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.link}
                    >
                      View Pull Request →
                    </a>
                  </p>
                )}
              </div>
            ) : (
              <div style={styles.errorBox}>
                <h3
                  style={{
                    marginTop: 0,
                    marginBottom: "0.5rem",
                    color: "#fff",
                  }}
                >
                  ✗ Error
                </h3>
                <p style={{ margin: 0 }}>{state.result.error}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <footer
          style={{
            textAlign: "center",
            marginTop: "2rem",
            color: "#888",
            fontSize: "0.875rem",
          }}
        >
          <p>
            Built with{" "}
            <a
              href="https://developers.cloudflare.com/agents/"
              target="_blank"
              rel="noopener noreferrer"
              style={styles.link}
            >
              Cloudflare Agents SDK
            </a>{" "}
            +{" "}
            <a
              href="https://developers.cloudflare.com/workers-ai/"
              target="_blank"
              rel="noopener noreferrer"
              style={styles.link}
            >
              Workers AI
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
