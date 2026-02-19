import { useEffect, useState, useCallback } from "react";
import type { Feedback } from "../types";

type FilterType = "all" | "technical" | "non-technical";
const FILTER_TABS: FilterType[] = ["all", "technical", "non-technical"];
const STATUS_OPTIONS = ["pending", "in-progress", "completed", "dismissed"];

interface DashboardProps {
  projectId: string;
  token: string;
  onBack: () => void;
  onLogout: () => void;
}

export function Dashboard({ projectId, token, onBack, onLogout }: DashboardProps) {
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchFeedback = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const url = new URL(
        `/api/dashboard/projects/${projectId}/feedback`,
        window.location.origin
      );
      if (filter !== "all") url.searchParams.set("type", filter);

      const response = await fetch(url.toString(), { headers: authHeaders });

      if (response.status === 401) {
        onLogout();
        return;
      }

      if (response.ok) {
        const data = (await response.json()) as {
          success: boolean;
          data?: Feedback[];
        };
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
      const res = await fetch(
        `/api/dashboard/projects/${projectId}/feedback/${feedbackId}`,
        {
          method: "PATCH",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      if (res.status === 401) {
        onLogout();
        return;
      }
      fetchFeedback();
    } catch (e) {
      console.error("Failed to update status:", e);
    }
  }

  return (
    <div style={styles.container}>
      <main style={styles.main}>
        <header style={styles.header}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button onClick={onBack} style={styles.backBtn}>
                {"<- Projects"}
              </button>
              <h1 style={styles.title}>Feedback</h1>
            </div>
            <button onClick={onLogout} style={styles.logoutBtn}>
              Sign Out
            </button>
          </div>
          <p style={styles.subtitle}>Project: {projectId.slice(0, 8)}...</p>
        </header>

        {/* Filter tabs */}
        <div style={styles.card}>
          <div style={{ display: "flex", gap: 8 }}>
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
        </div>

        {/* Feedback list */}
        {loading ? (
          <div style={styles.card}>
            <p style={{ margin: 0, color: "#888" }}>Loading...</p>
          </div>
        ) : feedbackList.length === 0 ? (
          <div style={styles.card}>
            <p style={{ margin: 0, color: "#888" }}>
              No feedback yet. Integrate the widget or use the API to submit feedback.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {feedbackList.map((fb) => (
              <div key={fb.id} style={styles.card}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 8,
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
                    {fb.title}
                  </h3>
                  <span
                    style={{
                      ...styles.badge,
                      ...(fb.type === "technical"
                        ? styles.badgeTechnical
                        : styles.badgeNonTechnical),
                    }}
                  >
                    {fb.type}
                  </span>
                </div>

                {fb.category && (
                  <span style={styles.categoryBadge}>{fb.category}</span>
                )}

                <p style={{ margin: "8px 0", color: "#aaa", fontSize: "0.9rem" }}>
                  {fb.description}
                </p>

                {fb.relatedPRUrl && (
                  <a
                    href={fb.relatedPRUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.prLink}
                  >
                    {"-> View PR #"}
                    {fb.relatedPRNumber}
                  </a>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 12,
                  }}
                >
                  <small style={{ color: "#666" }}>
                    {fb.email && `${fb.email} · `}
                    {new Date(fb.createdAt).toLocaleDateString()}
                  </small>
                  <select
                    value={fb.status}
                    onChange={(e) => updateStatus(fb.id, e.target.value)}
                    style={styles.statusSelect}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
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
    maxWidth: 900,
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
    marginTop: "0.5rem",
  },
  backBtn: {
    background: "none",
    border: "none",
    color: "#888",
    cursor: "pointer",
    fontSize: "0.9rem",
    padding: 0,
    whiteSpace: "nowrap" as const,
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
    padding: "1.25rem",
    marginBottom: "1rem",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  filterBtn: {
    padding: "6px 14px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "transparent",
    color: "#aaa",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 500,
  },
  filterBtnActive: {
    background: "#fff",
    color: "#000",
    borderColor: "#fff",
  },
  badge: {
    padding: "3px 8px",
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap" as const,
  },
  badgeTechnical: {
    background: "rgba(59,130,246,0.2)",
    color: "#60a5fa",
  },
  badgeNonTechnical: {
    background: "rgba(251,191,36,0.2)",
    color: "#fbbf24",
  },
  categoryBadge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 500,
    background: "rgba(255,255,255,0.08)",
    color: "#aaa",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  prLink: {
    color: "#60a5fa",
    textDecoration: "none",
    fontSize: 14,
    display: "inline-block",
  },
  statusSelect: {
    padding: "4px 8px",
    borderRadius: 6,
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    fontSize: 13,
    cursor: "pointer",
  },
};
