import type { ReactNode } from "react";

type ShellNav = "projects" | "dashboard";

export function DashboardShell({
  children,
  active,
  userLabel,
  userSub,
  onLogout,
  onHome,
  onProjects,
  onAgent,
}: {
  children: ReactNode;
  active: ShellNav;
  userLabel: string;
  userSub?: string;
  onLogout: () => void;
  onHome: () => void;
  onProjects: () => void;
  onAgent: () => void;
}) {
  return (
    <div style={styles.layout}>
      <aside style={styles.sidebar}>
        <button type="button" onClick={onHome} style={styles.brandBtn}>
          DevFeedback
        </button>
        <div style={styles.profileBlock}>
          <div style={styles.avatar} aria-hidden />
          <div style={styles.profileName}>{userLabel}</div>
          {userSub && <div style={styles.profileEmail}>{userSub}</div>}
        </div>
        <nav style={styles.nav}>
          <button
            type="button"
            onClick={onProjects}
            style={{
              ...styles.navItem,
              ...(active === "projects" ? styles.navItemActive : {}),
            }}
          >
            Projects
          </button>
          <span
            style={{
              ...styles.navItem,
              ...(active === "dashboard" ? styles.navItemActive : { opacity: 0.45, cursor: "default" }),
            }}
          >
            Inbox
          </span>
        </nav>
        <div style={styles.sideFooter}>
          <button type="button" onClick={onAgent} style={styles.sideLink}>
            PR Agent
          </button>
          <button type="button" onClick={onLogout} style={styles.sideLinkMuted}>
            Sign out
          </button>
        </div>
      </aside>
      <div style={styles.mainWrap}>{children}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    minHeight: "100vh",
    display: "flex",
    fontFamily: '"Manrope", -apple-system, BlinkMacSystemFont, sans-serif',
    background: "#0c0c0c",
    color: "#262a41",
  },
  sidebar: {
    width: 220,
    flexShrink: 0,
    background: "#141414",
    color: "#fff",
    padding: "1.25rem 1rem",
    display: "flex",
    flexDirection: "column" as const,
    borderRight: "1px solid rgba(255,255,255,0.06)",
  },
  brandBtn: {
    background: "none",
    border: "none",
    color: "#fff",
    fontWeight: 700,
    fontSize: "1.05rem",
    letterSpacing: "-0.02em",
    cursor: "pointer",
    textAlign: "left" as const,
    padding: "0 0 1.25rem 0",
    fontFamily: "inherit",
  },
  profileBlock: {
    marginBottom: "1.5rem",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: "rgba(255,255,255,0.12)",
    marginBottom: 10,
  },
  profileName: {
    fontWeight: 600,
    fontSize: "0.95rem",
  },
  profileEmail: {
    fontSize: "0.8rem",
    opacity: 0.55,
    marginTop: 2,
  },
  nav: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
    flex: 1,
  },
  navItem: {
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.45)",
    textAlign: "left" as const,
    padding: "10px 12px",
    borderRadius: 10,
    fontSize: "0.9rem",
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  navItemActive: {
    background: "rgba(255,255,255,0.1)",
    color: "#fff",
  },
  sideFooter: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
    paddingTop: "1rem",
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  sideLink: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.65)",
    textAlign: "left" as const,
    padding: "6px 12px",
    fontSize: "0.85rem",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  sideLinkMuted: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.35)",
    textAlign: "left" as const,
    padding: "6px 12px",
    fontSize: "0.8rem",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  mainWrap: {
    flex: 1,
    background: "#f4f6fa",
    overflow: "auto",
  },
};
