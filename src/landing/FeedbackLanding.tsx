import { useState } from "react";

const NPM = "npm install @devfeedback/react-widget";
const fontBody = '"Manrope", -apple-system, BlinkMacSystemFont, sans-serif';

const theme = {
  black: "#000000",
  white: "#ffffff",
  accent: "#d7ff3f",
  line: "rgba(255,255,255,0.22)",
  lineDark: "rgba(0,0,0,0.16)",
  muted: "rgba(255,255,255,0.68)",
  soft: "rgba(255,255,255,0.08)",
  inkMuted: "rgba(0,0,0,0.62)",
} as const;

const routes = ["Widget", "AI route", "Inbox", "GitHub PR"] as const;
const proof = ["Embedded widget", "AI classification", "Team inbox", "Optional auto-PR"] as const;

export function FeedbackLanding({
  onSignIn,
  onOpenAgent,
}: {
  onSignIn: () => void;
  onOpenAgent: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copyInstall() {
    void navigator.clipboard.writeText(NPM);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div style={styles.page}>
      <style>{motionCss}</style>
      <header style={styles.nav}>
        <button type="button" onClick={onSignIn} style={styles.brandButton}>
          DevFeedback
        </button>
        <nav style={styles.navActions}>
          <button type="button" onClick={onOpenAgent} style={styles.navLink}>
            PR Agent
          </button>
          <button type="button" onClick={onSignIn} style={styles.navPrimary}>
            Dashboard
          </button>
        </nav>
      </header>

      <main>
        <section style={styles.hero} className="df-hero-grid">
          <svg
            aria-hidden="true"
            className="df-hero-signal"
            viewBox="0 0 1440 824"
            preserveAspectRatio="none"
            style={styles.heroSignalArt}
          >
            <path
              d="M104 768 H342 V712 H548 V648 H802 V590 H1090"
              style={styles.signalPathAccent}
            />
            <circle cx="342" cy="712" r="5" style={styles.signalNodeAccent} />
            <circle cx="548" cy="648" r="5" style={styles.signalNodeAccent} />
            <circle cx="802" cy="590" r="5" style={styles.signalNodeAccent} />
            <circle cx="1090" cy="590" r="5" style={styles.signalNodeAccent} />
          </svg>
          <div style={styles.heroCopy} className="df-enter df-hero-copy">
            <p style={styles.kicker}>Feedback ops for product teams</p>
            <h1 style={styles.h1} className="df-h1">
              DevFeedback turns product feedback into engineering work.
            </h1>
            <p style={styles.lead}>
              Collect reports in-app, classify them as technical/non-technical with AI, and move technical feedback toward a pull request.
            </p>
            <div style={styles.heroActions}>
              <button type="button" onClick={onSignIn} style={styles.btnPrimary}>
                Open dashboard
              </button>
              <button type="button" onClick={onOpenAgent} style={styles.btnSecondary}>
                Try PR Agent
              </button>
            </div>
          </div>

          <div style={styles.signalBoard} className="df-enter df-delay df-signal-board">
            <div style={styles.boardHeader}>
              <span>Signal pipeline</span>
              <span>Live</span>
            </div>
            <div style={styles.signalRail}>
              {routes.map((route, index) => (
                <div key={route} style={styles.routeStep}>
                  <span style={styles.routeIndex}>{String(index + 1).padStart(2, "0")}</span>
                  <span style={styles.routeName}>{route}</span>
                </div>
              ))}
            </div>
            <div style={styles.ticket}>
              <div>
                <span style={styles.ticketLabel}>technical</span>
                <h2 style={styles.ticketTitle}>Checkout breaks on mobile Safari</h2>
              </div>
              <div style={styles.ticketMeta}>
                <span>classified</span>
                <span>branch ready</span>
              </div>
            </div>
          </div>
        </section>

        <section style={styles.whiteSection}>
          <div style={styles.sectionGrid} className="df-section-grid">
            <div>
              <p style={styles.sectionLabelDark}>What it does</p>
              <h2 style={styles.sectionTitleDark}>One loop from customer report to team action.</h2>
            </div>
            <div style={styles.proofList}>
              {proof.map((item) => (
                <div key={item} style={styles.proofItem}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={styles.blackSection}>
          <div style={styles.installLayout} className="df-section-grid">
            <div>
              <p style={styles.sectionLabel}>Install</p>
              <h2 style={styles.sectionTitle}>Add the widget, then triage from the dashboard.</h2>
            </div>
            <div style={styles.codeRow}>
              <code style={styles.code}>{NPM}</code>
              <button type="button" onClick={copyInstall} style={styles.copyBtn}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </section>

        <section style={styles.finalCta}>
          <h2 style={styles.finalTitle}>Start with the feedback already inside your product.</h2>
          <button type="button" onClick={onSignIn} style={styles.finalButton}>
            Open DevFeedback
          </button>
        </section>
      </main>
    </div>
  );
}

const motionCss = `
@keyframes dfUp {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
}
.df-enter { animation: dfUp 520ms ease both; }
.df-delay { animation-delay: 120ms; }
.df-hero-signal { animation: dfSignal 900ms ease both; }
@keyframes dfSignal {
  from { opacity: 0; stroke-dashoffset: 90; }
  to { opacity: 1; stroke-dashoffset: 0; }
}
button:hover { transform: translateY(-1px); }
button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 3px;
}
@media (prefers-reduced-motion: reduce) {
  .df-enter { animation: none; }
  .df-hero-signal { animation: none; }
  button { transition: none !important; }
}
@media (max-width: 860px) {
  .df-hero-grid { grid-template-columns: 1fr !important; grid-template-rows: auto !important; }
  .df-hero-copy { align-self: start !important; }
  .df-section-grid { grid-template-columns: 1fr !important; }
  .df-signal-board { min-height: 420px !important; }
}
@media (max-width: 560px) {
  .df-hero-grid { padding-left: 20px !important; padding-right: 20px !important; }
  .df-signal-board { padding: 12px !important; }
}
@media (max-height: 860px) {
  .df-h1 { font-size: clamp(3.45rem, min(6.6vw, 9.6svh), 6.25rem) !important; line-height: 0.92 !important; }
  .df-hero-grid { padding-top: clamp(20px, 3vw, 36px) !important; }
}
@media (max-height: 720px) {
  .df-h1 { font-size: clamp(2.9rem, min(5.6vw, 8.2svh), 4.8rem) !important; }
}
`;

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100svh",
    background: theme.black,
    color: theme.white,
    fontFamily: fontBody,
  },
  nav: {
    height: 76,
    padding: "0 32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: `1px solid ${theme.line}`,
  },
  brandButton: {
    border: 0,
    background: "transparent",
    color: theme.white,
    fontFamily: "inherit",
    fontSize: "1rem",
    fontWeight: 800,
    cursor: "pointer",
  },
  navActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  navLink: {
    border: `1px solid ${theme.line}`,
    background: "transparent",
    color: theme.white,
    borderRadius: 3,
    padding: "10px 14px",
    fontFamily: "inherit",
    fontWeight: 700,
    cursor: "pointer",
    transition: "transform 160ms ease",
  },
  navPrimary: {
    border: `1px solid ${theme.white}`,
    background: theme.white,
    color: theme.black,
    borderRadius: 3,
    padding: "10px 14px",
    fontFamily: "inherit",
    fontWeight: 800,
    cursor: "pointer",
    transition: "transform 160ms ease",
  },
  hero: {
    position: "relative",
    minHeight: "calc(100svh - 76px)",
    display: "grid",
    gridTemplateColumns: "minmax(0, 0.94fr) minmax(340px, 0.72fr)",
    gridTemplateRows: "1fr",
    gap: "clamp(32px, 6vw, 88px)",
    alignItems: "start",
    padding: "clamp(24px, 4vw, 48px) 32px clamp(28px, 4vw, 56px)",
    overflow: "hidden",
    isolation: "isolate",
  },
  heroSignalArt: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    zIndex: 0,
    pointerEvents: "none",
    opacity: 0.72,
  },
  heroCopy: {
    maxWidth: 820,
    alignSelf: "center",
    position: "relative",
    zIndex: 1,
  },
  kicker: {
    margin: "0 0 14px",
    color: theme.muted,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontSize: "0.78rem",
    fontWeight: 800,
  },
  h1: {
    margin: 0,
    maxWidth: 820,
    fontSize: "clamp(3.4rem, min(7vw, 9.5svh), 6.5rem)",
    lineHeight: 0.92,
    letterSpacing: "-0.05em",
    fontWeight: 800,
  },
  lead: {
    margin: "18px 0 0",
    maxWidth: 520,
    color: theme.muted,
    fontSize: "clamp(0.9rem, 1.1vw, 1.02rem)",
    lineHeight: 1.5,
  },
  heroActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 20,
  },
  btnPrimary: {
    border: `1px solid ${theme.white}`,
    background: theme.white,
    color: theme.black,
    borderRadius: 3,
    padding: "14px 18px",
    fontFamily: "inherit",
    fontWeight: 800,
    cursor: "pointer",
    transition: "transform 160ms ease",
  },
  btnSecondary: {
    border: `1px solid ${theme.line}`,
    background: "transparent",
    color: theme.white,
    borderRadius: 3,
    padding: "14px 18px",
    fontFamily: "inherit",
    fontWeight: 800,
    cursor: "pointer",
    transition: "transform 160ms ease",
  },
  signalBoard: {
    position: "relative",
    zIndex: 1,
    border: `1px solid ${theme.line}`,
    borderRadius: 4,
    minHeight: 480,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: 18,
    background: theme.black,
  },
  signalPathAccent: {
    fill: "none",
    stroke: theme.accent,
    strokeWidth: 1.5,
    vectorEffect: "non-scaling-stroke",
    strokeDasharray: "90 18",
    opacity: 0.46,
  },
  signalNodeAccent: {
    fill: theme.accent,
    opacity: 0.9,
  },
  boardHeader: {
    display: "flex",
    justifyContent: "space-between",
    color: theme.muted,
    fontSize: "0.78rem",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontWeight: 800,
  },
  signalRail: {
    display: "grid",
    gap: 0,
    borderTop: `1px solid ${theme.line}`,
    borderBottom: `1px solid ${theme.line}`,
  },
  routeStep: {
    display: "grid",
    gridTemplateColumns: "64px 1fr",
    borderBottom: `1px solid ${theme.line}`,
    minHeight: 78,
    alignItems: "center",
  },
  routeIndex: {
    color: theme.muted,
    fontSize: "0.82rem",
    fontWeight: 800,
  },
  routeName: {
    fontSize: "clamp(1.35rem, 2.6vw, 2.4rem)",
    fontWeight: 800,
    letterSpacing: "-0.04em",
  },
  ticket: {
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    border: `1px solid ${theme.white}`,
    borderRadius: 3,
    padding: 18,
  },
  ticketLabel: {
    display: "inline-block",
    marginBottom: 10,
    color: theme.muted,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontSize: "0.74rem",
    fontWeight: 800,
  },
  ticketTitle: {
    margin: 0,
    maxWidth: 340,
    fontSize: "1.45rem",
    lineHeight: 1.05,
    letterSpacing: "-0.04em",
  },
  ticketMeta: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    justifyContent: "space-between",
    color: theme.muted,
    fontSize: "0.8rem",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  whiteSection: {
    background: theme.white,
    color: theme.black,
    padding: "clamp(64px, 8vw, 112px) 32px",
  },
  sectionGrid: {
    maxWidth: 1180,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "minmax(0, 0.9fr) minmax(280px, 0.62fr)",
    gap: "clamp(36px, 7vw, 96px)",
    alignItems: "start",
  },
  sectionLabelDark: {
    margin: "0 0 16px",
    color: theme.inkMuted,
    fontSize: "0.78rem",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontWeight: 800,
  },
  sectionTitleDark: {
    margin: 0,
    fontSize: "clamp(2.2rem, 5vw, 5rem)",
    lineHeight: 0.95,
    letterSpacing: "-0.05em",
  },
  proofList: {
    borderTop: `1px solid ${theme.lineDark}`,
  },
  proofItem: {
    padding: "22px 0",
    borderBottom: `1px solid ${theme.lineDark}`,
    fontSize: "1.18rem",
    fontWeight: 800,
  },
  blackSection: {
    padding: "clamp(64px, 8vw, 108px) 32px",
    borderTop: `1px solid ${theme.line}`,
    borderBottom: `1px solid ${theme.line}`,
  },
  installLayout: {
    maxWidth: 1180,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "minmax(0, 0.9fr) minmax(320px, 0.72fr)",
    gap: "clamp(36px, 7vw, 96px)",
    alignItems: "end",
  },
  sectionLabel: {
    margin: "0 0 16px",
    color: theme.muted,
    fontSize: "0.78rem",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontWeight: 800,
  },
  sectionTitle: {
    margin: 0,
    fontSize: "clamp(2rem, 4.2vw, 4.2rem)",
    lineHeight: 0.98,
    letterSpacing: "-0.05em",
  },
  codeRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    border: `1px solid ${theme.line}`,
    borderRadius: 3,
    padding: 10,
  },
  code: {
    flex: 1,
    minWidth: 0,
    color: theme.white,
    border: 0,
    fontSize: "0.92rem",
    wordBreak: "break-all",
    fontFamily: 'ui-monospace, "SFMono-Regular", monospace',
  },
  copyBtn: {
    border: `1px solid ${theme.white}`,
    background: theme.white,
    color: theme.black,
    borderRadius: 3,
    padding: "11px 14px",
    fontFamily: "inherit",
    fontWeight: 800,
    cursor: "pointer",
    transition: "transform 160ms ease",
  },
  finalCta: {
    padding: "clamp(64px, 9vw, 128px) 32px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 24,
    flexWrap: "wrap",
  },
  finalTitle: {
    margin: 0,
    maxWidth: 780,
    fontSize: "clamp(2.1rem, 5vw, 5.2rem)",
    lineHeight: 0.95,
    letterSpacing: "-0.05em",
  },
  finalButton: {
    border: `1px solid ${theme.white}`,
    background: theme.white,
    color: theme.black,
    borderRadius: 3,
    padding: "14px 18px",
    fontFamily: "inherit",
    fontWeight: 800,
    cursor: "pointer",
    transition: "transform 160ms ease",
  },
};
