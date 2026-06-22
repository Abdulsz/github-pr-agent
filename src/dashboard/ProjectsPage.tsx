import { useEffect, useState, useCallback } from "react";
import { DashboardShell } from "./DashboardShell";
import { GitHubConnectButton } from "../components/GitHubConnect";

interface Project {
  id: string;
  name: string;
  apiKey: string;
  description?: string;
  githubRepo?: string;
  hasGithubConnection: boolean;
  githubUsername?: string;
  settings: {
    enableAutoPR: boolean;
    autoClassify: boolean;
  };
  createdAt: string;
}

interface GitHubStatus {
  connected: boolean;
  username?: string;
}

interface ProjectsPageProps {
  token: string;
  onLogout: () => void;
  onSelectProject: (projectId: string) => void;
  onHome: () => void;
  onOpenAgent: () => void;
}

export function ProjectsPage({ token, onLogout, onSelectProject, onHome, onOpenAgent }: ProjectsPageProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createdKey, setCreatedKey] = useState<{ projectId: string; apiKey: string; name: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Create form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formRepo, setFormRepo] = useState("");
  const [formAutoPR, setFormAutoPR] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [githubStatus, setGithubStatus] = useState<GitHubStatus>({ connected: false });
  const [githubLoading, setGithubLoading] = useState(true);
  const [connectingGithub, setConnectingGithub] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/feedback/projects", { headers: authHeaders });
      const data = (await res.json()) as { success: boolean; data?: Project[] };
      if (data.success) setProjects(data.data ?? []);
    } catch (e) {
      console.error("Failed to fetch projects:", e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchGitHubStatus = useCallback(async () => {
    setGithubLoading(true);
    try {
      const res = await fetch("/api/github/oauth/status", { headers: authHeaders });
      const data = (await res.json()) as { success: boolean; data?: GitHubStatus };
      if (data.success && data.data) setGithubStatus(data.data);
    } catch (e) {
      console.error("Failed to fetch GitHub status:", e);
    } finally {
      setGithubLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchProjects();
    fetchGitHubStatus();

    const params = new URLSearchParams(window.location.search);
    if (params.get("github") === "connected") {
      fetchGitHubStatus();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [fetchProjects, fetchGitHubStatus]);

  async function handleConnectGitHub() {
    setConnectingGithub(true);
    try {
      const res = await fetch("/api/github/oauth/authorize", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          returnTo: "/projects",
          frontendOrigin: window.location.origin,
        }),
      });
      const data = (await res.json()) as { success: boolean; data?: { url: string }; error?: string };
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
        return;
      }
      console.error("Failed to start GitHub OAuth:", data.error);
    } catch (e) {
      console.error("Failed to start GitHub OAuth:", e);
    } finally {
      setConnectingGithub(false);
    }
  }

  async function handleDisconnectGitHub() {
    try {
      await fetch("/api/github/oauth/disconnect", {
        method: "DELETE",
        headers: authHeaders,
      });
      setGithubStatus({ connected: false });
    } catch (e) {
      console.error("Failed to disconnect GitHub:", e);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreating(true);

    try {
      if (formAutoPR && formRepo && !githubStatus.connected) {
        setCreateError("Connect your GitHub account before enabling auto-PR");
        return;
      }

      const body: Record<string, unknown> = {
        name: formName,
        description: formDesc || undefined,
        githubRepo: formRepo || undefined,
        settings: { enableAutoPR: formAutoPR, autoClassify: true },
      };

      const res = await fetch("/api/feedback/projects", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as {
        success: boolean;
        data?: { projectId: string; apiKey: string; name: string };
        error?: string;
      };

      if (!data.success || !data.data) {
        setCreateError(data.error || "Failed to create project");
        return;
      }

      setCreatedKey(data.data);
      setFormName("");
      setFormDesc("");
      setFormRepo("");
      setFormAutoPR(false);
      setShowCreate(false);
      fetchProjects();
    } catch {
      setCreateError("Network error");
    } finally {
      setCreating(false);
    }
  }

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("authUser") || "{}");
    } catch {
      return {};
    }
  })();

  return (
    <DashboardShell
      active="projects"
      userLabel={user.name || user.email || "Account"}
      userSub={user.email}
      onLogout={onLogout}
      onHome={onHome}
      onProjects={() => {}}
      onAgent={onOpenAgent}
    >
      <main style={styles.main}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Projects</h1>
            <p style={styles.subtitle}>
              {user.name || user.email || "Your projects"}
            </p>
          </div>
        </header>

        <div style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h3 style={{ margin: "0 0 0.25rem 0", fontSize: "1rem" }}>GitHub integration</h3>
              <p style={{ margin: 0, color: "rgba(0,0,0,0.62)", fontSize: "0.9rem" }}>
                {githubLoading
                  ? "Checking connection..."
                  : githubStatus.connected
                    ? `Connected as @${githubStatus.username}`
                    : "Sign in with GitHub to enable auto-PR for your projects"}
              </p>
            </div>
            {!githubLoading && (
              githubStatus.connected ? (
                <button onClick={handleDisconnectGitHub} style={{ ...styles.button, ...styles.secondaryButton, padding: "6px 16px", fontSize: "0.85rem" }}>
                  Disconnect
                </button>
              ) : (
                <GitHubConnectButton
                  onClick={handleConnectGitHub}
                  loading={connectingGithub}
                  variant="light"
                  label="Connect GitHub"
                />
              )
            )}
          </div>
        </div>

        {/* Newly created project key display */}
        {createdKey && (
          <div style={styles.successCard}>
            <h3 style={{ margin: "0 0 0.75rem 0", color: "#000" }}>
              Project "{createdKey.name}" created
            </h3>
            <p style={{ margin: "0 0 1rem 0", color: "rgba(0,0,0,0.62)", fontSize: "0.9rem" }}>
              Save these credentials -- the API key won't be shown in full again.
            </p>

            <div style={styles.credRow}>
              <span style={styles.credLabel}>Project ID</span>
              <code style={styles.credValue}>{createdKey.projectId}</code>
              <button
                onClick={() => copyToClipboard(createdKey.projectId, "pid")}
                style={styles.copyBtn}
              >
                {copiedField === "pid" ? "Copied" : "Copy"}
              </button>
            </div>

            <div style={styles.credRow}>
              <span style={styles.credLabel}>API Key</span>
              <code style={styles.credValue}>{createdKey.apiKey}</code>
              <button
                onClick={() => copyToClipboard(createdKey.apiKey, "key")}
                style={styles.copyBtn}
              >
                {copiedField === "key" ? "Copied" : "Copy"}
              </button>
            </div>

            <button
              onClick={() => setCreatedKey(null)}
              style={{ ...styles.textBtn, marginTop: "0.75rem" }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Create project button or form */}
        {!showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            style={{ ...styles.button, ...styles.primaryButton, marginBottom: "1.5rem" }}
          >
            New project
          </button>
        ) : (
          <div style={styles.card}>
            <h3 style={{ margin: "0 0 1rem 0" }}>New project</h3>
            <form onSubmit={handleCreate}>
              <label style={styles.label}>Project name *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="My App"
                style={styles.input}
                required
                disabled={creating}
              />

              <label style={styles.label}>Description</label>
              <input
                type="text"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Brief description (optional)"
                style={styles.input}
                disabled={creating}
              />

              <label style={styles.label}>GitHub Repository</label>
              <input
                type="text"
                value={formRepo}
                onChange={(e) => setFormRepo(e.target.value)}
                placeholder="owner/repo or https://github.com/owner/repo"
                style={styles.input}
                disabled={creating}
              />
              <p style={styles.helpText}>
                Connect a repo to enable automatic PR creation for technical feedback.
              </p>

              {formRepo && (
                <>
                  {!githubStatus.connected && (
                    <div style={styles.warningBox}>
                      <p style={{ margin: 0 }}>
                        Connect your GitHub account above to enable auto-PR for this repository.
                      </p>
                    </div>
                  )}

                  <label style={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={formAutoPR}
                      onChange={(e) => setFormAutoPR(e.target.checked)}
                      disabled={creating || !githubStatus.connected}
                    />
                    <span>Enable auto-PR for technical feedback</span>
                  </label>
                </>
              )}

              {createError && (
                <div style={styles.errorBox}>
                  <p style={{ margin: 0 }}>{createError}</p>
                </div>
              )}

              <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
                <button
                  type="submit"
                  disabled={creating}
                  style={{
                    ...styles.button,
                    ...styles.primaryButton,
                    ...(creating ? styles.disabledButton : {}),
                  }}
                >
                  {creating ? "Creating..." : "Create Project"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setCreateError(""); }}
                  style={{ ...styles.button, ...styles.secondaryButton }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Project list */}
        {loading ? (
          <div style={styles.card}>
                <p style={{ margin: 0, color: "rgba(0,0,0,0.62)" }}>Loading projects...</p>
          </div>
        ) : projects.length === 0 && !showCreate ? (
          <div style={styles.card}>
            <p style={{ margin: 0, color: "rgba(0,0,0,0.62)" }}>
              No projects yet. Create one to get started.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {projects.map((p) => (
              <div key={p.id} style={styles.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>{p.name}</h3>
                    {p.description && (
                      <p style={{ margin: "4px 0 0 0", color: "rgba(0,0,0,0.62)", fontSize: "0.9rem" }}>
                        {p.description}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => onSelectProject(p.id)}
                    style={{ ...styles.button, ...styles.primaryButton, padding: "6px 16px", fontSize: "0.85rem" }}
                  >
                    View Feedback
                  </button>
                </div>

                <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={styles.metaRow}>
                    <span style={styles.metaLabel}>API Key</span>
                    <code style={styles.metaValue}>
                      {p.apiKey.slice(0, 12)}...{p.apiKey.slice(-4)}
                    </code>
                    <button
                      onClick={() => copyToClipboard(p.apiKey, `key-${p.id}`)}
                      style={styles.copyBtn}
                    >
                      {copiedField === `key-${p.id}` ? "Copied" : "Copy"}
                    </button>
                  </div>

                  <div style={styles.metaRow}>
                    <span style={styles.metaLabel}>Project ID</span>
                    <code style={styles.metaValue}>{p.id.slice(0, 8)}...</code>
                    <button
                      onClick={() => copyToClipboard(p.id, `pid-${p.id}`)}
                      style={styles.copyBtn}
                    >
                      {copiedField === `pid-${p.id}` ? "Copied" : "Copy"}
                    </button>
                  </div>

                  {p.githubRepo && (
                    <div style={styles.metaRow}>
                      <span style={styles.metaLabel}>Repo</span>
                      <span style={{ color: "rgba(0,0,0,0.62)", fontSize: "0.85rem" }}>{p.githubRepo}</span>
                      {p.settings.enableAutoPR && (
                        <span style={styles.autoPRBadge}>Auto-PR</span>
                      )}
                    </div>
                  )}

                  {p.settings.enableAutoPR && (
                    <div style={styles.metaRow}>
                      <span style={styles.metaLabel}>GitHub</span>
                      <span style={{ color: "rgba(0,0,0,0.62)", fontSize: "0.85rem" }}>
                        {p.hasGithubConnection
                          ? p.githubUsername
                            ? `Connected as @${p.githubUsername}`
                            : "Connected"
                          : "Not connected"}
                      </span>
                    </div>
                  )}

                  <div style={styles.metaRow}>
                    <span style={styles.metaLabel}>Created</span>
                    <span style={{ color: "rgba(0,0,0,0.62)", fontSize: "0.85rem" }}>
                      {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </DashboardShell>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: 800,
    margin: "0 auto",
    padding: "2rem",
    fontFamily: '"Manrope", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  header: {
    marginBottom: "2rem",
  },
  title: {
    fontSize: "2rem",
    fontWeight: 700,
    color: "#000",
    margin: 0,
    letterSpacing: "-0.02em",
  },
  subtitle: {
    color: "rgba(0,0,0,0.62)",
    fontSize: "1rem",
    marginTop: "0.25rem",
  },
  card: {
    background: "#fff",
    borderRadius: 3,
    padding: "1.5rem",
    marginBottom: "1rem",
    border: "1px solid rgba(0,0,0,0.18)",
    boxShadow: "none",
  },
  successCard: {
    background: "#fff",
    borderRadius: 3,
    padding: "1.5rem",
    marginBottom: "1.5rem",
    border: "1px solid #000",
  },
  label: {
    display: "block",
    marginBottom: "0.5rem",
    fontWeight: 500,
    color: "#000",
    fontSize: "0.9rem",
  },
  input: {
    width: "100%",
    padding: "0.75rem 1rem",
    borderRadius: 3,
    border: "1px solid rgba(0,0,0,0.24)",
    background: "#fff",
    color: "#000",
    fontSize: "1rem",
    marginBottom: "0.75rem",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  helpText: {
    fontSize: "0.8rem",
    color: "rgba(0,0,0,0.62)",
    marginTop: "-0.5rem",
    marginBottom: "1rem",
  },
  code: {
    background: "#fff",
    padding: "1px 5px",
    borderRadius: 3,
    fontSize: "0.85rem",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    cursor: "pointer",
    color: "#000",
    fontSize: "0.9rem",
    marginBottom: "0.5rem",
  },
  button: {
    padding: "0.75rem 1.5rem",
    borderRadius: 3,
    border: "1px solid #000",
    fontWeight: 600,
    fontSize: "0.9rem",
    cursor: "pointer",
    transition: "border-color 0.2s, opacity 0.2s",
  },
  primaryButton: {
    background: "#000",
    color: "#fff",
    borderColor: "#000",
  },
  secondaryButton: {
    background: "transparent",
    color: "#000",
    borderColor: "rgba(0,0,0,0.24)",
  },
  disabledButton: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  errorBox: {
    background: "#fff",
    border: "1px solid #000",
    borderRadius: 3,
    padding: "0.75rem 1rem",
    marginBottom: "0.75rem",
    color: "#000",
    fontSize: "0.9rem",
  },
  warningBox: {
    background: "#fff",
    border: "1px solid #000",
    borderRadius: 3,
    padding: "0.75rem 1rem",
    marginBottom: "0.75rem",
    color: "#000",
    fontSize: "0.9rem",
  },
  textBtn: {
    background: "none",
    border: "none",
    color: "rgba(0,0,0,0.62)",
    cursor: "pointer",
    fontSize: "0.85rem",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
    padding: 0,
  },
  credRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    marginBottom: "0.5rem",
  },
  credLabel: {
    color: "rgba(0,0,0,0.62)",
    fontSize: "0.85rem",
    fontWeight: 500,
    minWidth: 80,
  },
  credValue: {
    background: "#fff",
    padding: "4px 10px",
    borderRadius: 3,
    fontSize: "0.85rem",
    color: "#000",
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  copyBtn: {
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.24)",
    color: "#000",
    padding: "4px 12px",
    borderRadius: 3,
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 500,
    whiteSpace: "nowrap" as const,
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  metaLabel: {
    color: "rgba(0,0,0,0.62)",
    fontSize: "0.8rem",
    fontWeight: 500,
    minWidth: 70,
  },
  metaValue: {
    background: "#fff",
    padding: "2px 8px",
    borderRadius: 3,
    fontSize: "0.8rem",
    color: "#000",
  },
  autoPRBadge: {
    background: "#000",
    color: "#fff",
    padding: "2px 8px",
    borderRadius: 3,
    fontSize: "0.75rem",
    fontWeight: 600,
  },
};
