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
              ...(active === "dashboard" ? styles.navItemActive : styles.navItemMuted),
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
    background: "#000",
    color: "#000",
  },
  sidebar: {
    width: 236,
    flexShrink: 0,
    background: "#000",
    color: "#fff",
    padding: "1.25rem",
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid rgba(255,255,255,0.22)",
  },
  brandBtn: {
    background: "none",
    border: "none",
    color: "#fff",
    fontWeight: 800,
    fontSize: "1.05rem",
    cursor: "pointer",
    textAlign: "left",
    padding: "0 0 1.4rem",
    fontFamily: "inherit",
  },
  profileBlock: {
    borderTop: "1px solid rgba(255,255,255,0.22)",
    borderBottom: "1px solid rgba(255,255,255,0.22)",
    padding: "1rem 0",
    marginBottom: "1rem",
  },
  profileName: {
    fontWeight: 800,
    fontSize: "0.95rem",
  },
  profileEmail: {
    fontSize: "0.78rem",
    color: "rgba(255,255,255,0.62)",
    marginTop: 4,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    flex: 1,
  },
  navItem: {
    background: "transparent",
    border: "1px solid transparent",
    color: "rgba(255,255,255,0.62)",
    textAlign: "left",
    padding: "10px 12px",
    borderRadius: 3,
    fontSize: "0.9rem",
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  navItemActive: {
    background: "#fff",
    color: "#000",
    borderColor: "#fff",
  },
  navItemMuted: {
    cursor: "default",
  },
  sideFooter: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingTop: "1rem",
    borderTop: "1px solid rgba(255,255,255,0.22)",
  },
  sideLink: {
    background: "none",
    border: "none",
    color: "#fff",
    textAlign: "left",
    padding: "6px 0",
    fontSize: "0.86rem",
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 700,
  },
  sideLinkMuted: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.55)",
    textAlign: "left",
    padding: "6px 0",
    fontSize: "0.86rem",
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 700,
  },
  mainWrap: {
    flex: 1,
    background: "#fff",
    overflow: "auto",
  },
};
