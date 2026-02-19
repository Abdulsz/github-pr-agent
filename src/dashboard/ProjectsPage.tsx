import { useEffect, useState, useCallback } from "react";

interface Project {
  id: string;
  name: string;
  apiKey: string;
  description?: string;
  githubRepo?: string;
  hasGithubToken: boolean;
  settings: {
    enableAutoPR: boolean;
    autoClassify: boolean;
  };
  createdAt: string;
}

interface ProjectsPageProps {
  token: string;
  onLogout: () => void;
  onSelectProject: (projectId: string) => void;
}

export function ProjectsPage({ token, onLogout, onSelectProject }: ProjectsPageProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createdKey, setCreatedKey] = useState<{ projectId: string; apiKey: string; name: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Create form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formRepo, setFormRepo] = useState("");
  const [formGithubToken, setFormGithubToken] = useState("");
  const [formAutoPR, setFormAutoPR] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

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

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreating(true);

    try {
      const body: Record<string, unknown> = {
        name: formName,
        description: formDesc || undefined,
        githubRepo: formRepo || undefined,
        githubToken: formGithubToken || undefined,
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
      setFormGithubToken("");
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
    <div style={styles.container}>
      <main style={styles.main}>
        <header style={styles.header}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h1 style={styles.title}>Projects</h1>
              <p style={styles.subtitle}>
                {user.name || user.email || "Your projects"}
              </p>
            </div>
            <button onClick={onLogout} style={styles.logoutBtn}>
              Sign Out
            </button>
          </div>
        </header>

        {/* Newly created project key display */}
        {createdKey && (
          <div style={styles.successCard}>
            <h3 style={{ margin: "0 0 0.75rem 0", color: "#fff" }}>
              Project "{createdKey.name}" created
            </h3>
            <p style={{ margin: "0 0 1rem 0", color: "#aaa", fontSize: "0.9rem" }}>
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
            + New Project
          </button>
        ) : (
          <div style={styles.card}>
            <h3 style={{ margin: "0 0 1rem 0" }}>New Project</h3>
            <form onSubmit={handleCreate}>
              <label style={styles.label}>Project Name *</label>
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
                  <label style={styles.label}>GitHub Personal Access Token</label>
                  <input
                    type="password"
                    value={formGithubToken}
                    onChange={(e) => setFormGithubToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    style={styles.input}
                    disabled={creating}
                  />
                  <p style={styles.helpText}>
                    Needs <code style={styles.code}>repo</code> scope.
                    Token is encrypted at rest. Required for auto-PR.
                  </p>

                  <label style={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={formAutoPR}
                      onChange={(e) => setFormAutoPR(e.target.checked)}
                      disabled={creating}
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
            <p style={{ margin: 0, color: "#888" }}>Loading projects...</p>
          </div>
        ) : projects.length === 0 && !showCreate ? (
          <div style={styles.card}>
            <p style={{ margin: 0, color: "#888" }}>
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
                      <p style={{ margin: "4px 0 0 0", color: "#888", fontSize: "0.9rem" }}>
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
                      <span style={{ color: "#aaa", fontSize: "0.85rem" }}>{p.githubRepo}</span>
                      {p.settings.enableAutoPR && (
                        <span style={styles.autoPRBadge}>Auto-PR</span>
                      )}
                    </div>
                  )}

                  <div style={styles.metaRow}>
                    <span style={styles.metaLabel}>Created</span>
                    <span style={{ color: "#666", fontSize: "0.85rem" }}>
                      {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#000",
    color: "#fff",
    fontFamily: '"Manrope", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  main: {
    maxWidth: 800,
    margin: "0 auto",
    padding: "2rem",
  },
  header: {
    marginBottom: "2rem",
  },
  title: {
    fontSize: "2rem",
    fontWeight: 700,
    color: "#fff",
    margin: 0,
    letterSpacing: "-0.02em",
  },
  subtitle: {
    color: "#888",
    fontSize: "1rem",
    marginTop: "0.25rem",
  },
  logoutBtn: {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "#888",
    padding: "6px 14px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 500,
  },
  card: {
    background: "rgba(255,255,255,0.06)",
    backdropFilter: "blur(12px)",
    borderRadius: 16,
    padding: "1.5rem",
    marginBottom: "1rem",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  successCard: {
    background: "rgba(255,255,255,0.06)",
    backdropFilter: "blur(12px)",
    borderRadius: 16,
    padding: "1.5rem",
    marginBottom: "1.5rem",
    border: "1px solid rgba(255,255,255,0.25)",
  },
  label: {
    display: "block",
    marginBottom: "0.5rem",
    fontWeight: 500,
    color: "#fff",
    fontSize: "0.9rem",
  },
  input: {
    width: "100%",
    padding: "0.75rem 1rem",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    fontSize: "1rem",
    marginBottom: "0.75rem",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  helpText: {
    fontSize: "0.8rem",
    color: "#888",
    marginTop: "-0.5rem",
    marginBottom: "1rem",
  },
  code: {
    background: "rgba(255,255,255,0.1)",
    padding: "1px 5px",
    borderRadius: 4,
    fontSize: "0.85rem",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    cursor: "pointer",
    color: "#fff",
    fontSize: "0.9rem",
    marginBottom: "0.5rem",
  },
  button: {
    padding: "0.75rem 1.5rem",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.2)",
    fontWeight: 600,
    fontSize: "0.9rem",
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
  },
  disabledButton: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  errorBox: {
    background: "rgba(239, 68, 68, 0.15)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: 12,
    padding: "0.75rem 1rem",
    marginBottom: "0.75rem",
    color: "#fca5a5",
    fontSize: "0.9rem",
  },
  textBtn: {
    background: "none",
    border: "none",
    color: "#888",
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
    color: "#888",
    fontSize: "0.85rem",
    fontWeight: 500,
    minWidth: 80,
  },
  credValue: {
    background: "rgba(255,255,255,0.08)",
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: "0.85rem",
    color: "#fff",
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  copyBtn: {
    background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.2)",
    color: "#fff",
    padding: "4px 12px",
    borderRadius: 6,
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
    color: "#666",
    fontSize: "0.8rem",
    fontWeight: 500,
    minWidth: 70,
  },
  metaValue: {
    background: "rgba(255,255,255,0.08)",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: "0.8rem",
    color: "#aaa",
  },
  autoPRBadge: {
    background: "rgba(59,130,246,0.2)",
    color: "#60a5fa",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: "0.75rem",
    fontWeight: 600,
  },
};
