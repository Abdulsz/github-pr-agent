import { useEffect, useState, useCallback } from "react";
import type { Feedback } from "../types";
import { DashboardShell } from "./DashboardShell";

type FilterType = "all" | "technical" | "non-technical";
const FILTER_TABS: FilterType[] = ["all", "technical", "non-technical"];
const STATUS_OPTIONS = ["pending", "in-progress", "completed", "dismissed"];

interface DashboardProps {
  projectId: string;
  token: string;
  onBack: () => void;
  onLogout: () => void;
  onHome: () => void;
  onOpenAgent: () => void;
}

export function Dashboard({ projectId, token, onBack, onLogout, onHome, onOpenAgent }: DashboardProps) {
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchFeedback = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const url = new URL(`/api/dashboard/projects/${projectId}/feedback`, window.location.origin);
      if (filter !== "all") url.searchParams.set("type", filter);

      const response = await fetch(url.toString(), { headers: authHeaders });
      if (response.status === 401) {
        onLogout();
        return;
      }

      if (response.ok) {
        const data = (await response.json()) as { success: boolean; data?: Feedback[] };
        setFeedbackList(data.data ?? []);
      }
    } catch (e) {
      console.error("Failed to fetch feedback:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, filter, token]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  async function updateStatus(feedbackId: string, status: string) {
    try {
      const res = await fetch(`/api/dashboard/projects/${projectId}/feedback/${feedbackId}`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      fetchFeedback();
    } catch (e) {
      console.error("Failed to update status:", e);
    }
  }

  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("authUser") || "{}") as { email?: string; name?: string };
    } catch {
      return {};
    }
  })();

  return (
    <DashboardShell
      active="dashboard"
      userLabel={user.name || user.email || "Account"}
      userSub={user.email}
      onLogout={onLogout}
      onHome={onHome}
      onProjects={onBack}
      onAgent={onOpenAgent}
    >
      <main style={styles.main}>
        <header style={styles.header}>
          <button onClick={onBack} style={styles.backBtn}>
            Projects
          </button>
          <h1 style={styles.title}>Inbox</h1>
          <p style={styles.subtitle}>Project {projectId.slice(0, 8)}. Filter, triage, and update status.</p>
        </header>

        <div style={styles.toolbar}>
          {FILTER_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              style={{
                ...styles.filterBtn,
                ...(filter === tab ? styles.filterBtnActive : {}),
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={styles.panel}>
            <p style={styles.emptyText}>Loading...</p>
          </div>
        ) : feedbackList.length === 0 ? (
          <div style={styles.panel}>
            <p style={styles.emptyText}>No feedback yet. Add the widget to start collecting reports.</p>
          </div>
        ) : (
          <div style={styles.list}>
            {feedbackList.map((fb) => (
              <article key={fb.id} style={styles.panel}>
                <div style={styles.itemHead}>
                  <h3 style={styles.itemTitle}>{fb.title}</h3>
                  <span
                    style={{
                      ...styles.badge,
                      ...(fb.type === "technical" ? styles.badgeDark : styles.badgeLight),
                    }}
                  >
                    {fb.type}
                  </span>
                </div>

                {fb.category && <span style={styles.categoryBadge}>{fb.category}</span>}

                <p style={styles.description}>{fb.description}</p>

                {fb.relatedPRUrl && (
                  <a href={fb.relatedPRUrl} target="_blank" rel="noopener noreferrer" style={styles.prLink}>
                    View PR #{fb.relatedPRNumber}
                  </a>
                )}

                <div style={styles.itemFooter}>
                  <small style={styles.meta}>
                    {fb.email && `${fb.email} - `}
                    {new Date(fb.createdAt).toLocaleDateString()}
                  </small>
                  <select value={fb.status} onChange={(e) => updateStatus(fb.id, e.target.value)} style={styles.statusSelect}>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </DashboardShell>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: 940,
    margin: "0 auto",
    padding: "2.5rem",
    fontFamily: '"Manrope", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  header: {
    marginBottom: "2rem",
  },
  title: {
    margin: "0.6rem 0 0",
    fontSize: "2.6rem",
    lineHeight: 0.96,
    fontWeight: 800,
    color: "#000",
    letterSpacing: "-0.05em",
  },
  subtitle: {
    color: "rgba(0,0,0,0.62)",
    fontSize: "1rem",
    marginTop: "0.7rem",
  },
  backBtn: {
    background: "none",
    border: "none",
    color: "rgba(0,0,0,0.62)",
    cursor: "pointer",
    fontSize: "0.9rem",
    padding: 0,
    whiteSpace: "nowrap",
    fontFamily: "inherit",
    fontWeight: 700,
  },
  toolbar: {
    display: "flex",
    gap: 8,
    marginBottom: "1rem",
    flexWrap: "wrap",
  },
  filterBtn: {
    padding: "7px 14px",
    borderRadius: 3,
    border: "1px solid rgba(0,0,0,0.24)",
    background: "#fff",
    color: "rgba(0,0,0,0.62)",
    cursor: "pointer",
    fontSize: "0.86rem",
    fontWeight: 800,
    fontFamily: "inherit",
  },
  filterBtnActive: {
    background: "#000",
    color: "#fff",
    borderColor: "#000",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  panel: {
    background: "#fff",
    borderRadius: 3,
    padding: "1.25rem",
    border: "1px solid rgba(0,0,0,0.18)",
  },
  emptyText: {
    margin: 0,
    color: "rgba(0,0,0,0.62)",
  },
  itemHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 8,
  },
  itemTitle: {
    margin: 0,
    fontSize: "1.05rem",
    fontWeight: 800,
    color: "#000",
  },
  badge: {
    padding: "3px 8px",
    borderRadius: 3,
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
    border: "1px solid #000",
  },
  badgeDark: {
    background: "#000",
    color: "#fff",
  },
  badgeLight: {
    background: "#fff",
    color: "#000",
  },
  categoryBadge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 3,
    fontSize: 11,
    fontWeight: 800,
    background: "#fff",
    color: "#000",
    border: "1px solid rgba(0,0,0,0.24)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  description: {
    margin: "10px 0",
    color: "#000",
    fontSize: "0.93rem",
    lineHeight: 1.55,
  },
  prLink: {
    color: "#000",
    textDecoration: "underline",
    textUnderlineOffset: "3px",
    fontSize: 14,
    display: "inline-block",
    fontWeight: 800,
  },
  itemFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    flexWrap: "wrap",
  },
  meta: {
    color: "rgba(0,0,0,0.62)",
  },
  statusSelect: {
    padding: "5px 8px",
    borderRadius: 3,
    border: "1px solid rgba(0,0,0,0.24)",
    background: "#fff",
    color: "#000",
    fontSize: 13,
    cursor: "pointer",
  },
};
