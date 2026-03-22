import { useState } from "react";

const NPM = "npm install @devfeedback/react-widget";

const fontBody = '"Manrope", -apple-system, BlinkMacSystemFont, sans-serif';

const theme = {
  bg: "#000000",
  bgElevated: "#111111",
  panel: "#161616",
  panelAlt: "#1d1d1d",
  line: "#2a2a2a",
  text: "#f5f1e8",
  textMuted: "rgba(245, 241, 232, 0.62)",
  textSoft: "rgba(245, 241, 232, 0.74)",
  sand: "#c8a977",
  sage: "#6f8f84",
  white: "#f5f1e8",
  dark: "#111111",
} as const;

const workflow = [
  {
    label: "Widget",
    title: "Customer report lands in-app",
    meta: "checkout bug · mobile safari",
    tone: theme.sage,
  },
  {
    label: "AI Route",
    title: "Technical issue auto-classified",
    meta: "bug · engineering queue",
    tone: theme.sand,
  },
  {
    label: "Inbox",
    title: "Team triages in one queue",
    meta: "pending -> in progress",
    tone: theme.sand,
  },
  {
    label: "PR",
    title: "Ready for GitHub handoff",
    meta: "branch + PR link attached",
    tone: theme.sage,
  },
] as const;

const proofItems = [
  "Technical vs non-technical routing",
  "Project-scoped API keys",
  "Auto-PR for engineering feedback",
  "Embeddable widget for any app",
] as const;

const systemSteps = [
  {
    id: "01",
    title: "Collect signal at the source",
    body: "Drop a lightweight widget into your app so customers can report bugs, requests, and friction without leaving the product.",
  },
  {
    id: "02",
    title: "Separate noise from engineering work",
    body: "Classify submissions into technical and non-technical lanes so product triage and engineering follow-up stop competing for the same inbox.",
  },
  {
    id: "03",
    title: "Route action to the right system",
    body: "Keep non-technical feedback in the queue and send engineering-ready issues toward GitHub when auto-PR is enabled.",
  },
] as const;

const queueRows = [
  {
    title: "Bug: checkout timeout on iOS",
    tag: "technical",
    status: "PR ready",
    tone: theme.sage,
  },
  {
    title: "Request: add saved filters",
    tag: "non-technical",
    status: "triage",
    tone: theme.sand,
  },
  {
    title: "Improvement: clarify trial limits",
    tag: "non-technical",
    status: "pending",
    tone: theme.sand,
  },
] as const;

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
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={styles.page}>
      <header style={styles.nav}>
        <div style={styles.brandWrap}>
          <span style={styles.brand}>DevFeedback</span>
          <span style={styles.brandTag}>AI feedback ops</span>
        </div>
        <div style={styles.navActions}>
          <button type="button" onClick={onOpenAgent} style={styles.navGhost}>
            PR Agent
          </button>
          <button type="button" onClick={onSignIn} style={styles.navPrimary}>
            Dashboard
          </button>
        </div>
      </header>

      <main>
        <section style={styles.hero}>
          <div style={styles.heroCopy}>
            <div style={styles.kickerRow}>
              <span style={styles.kickerDot} />
              <span style={styles.kicker}>AI Feedback Ops</span>
            </div>

            <h1 style={styles.h1}>Turn user feedback into shipped work.</h1>
            <p style={styles.lead}>
              Embed a lightweight widget, separate technical from non-technical submissions, triage
              everything in one inbox, and route engineering-ready feedback toward GitHub without
              losing context.
            </p>

            <div style={styles.heroActions}>
              <button type="button" onClick={onSignIn} style={styles.btnPrimary}>
                Open dashboard
              </button>
              <button type="button" onClick={onOpenAgent} style={styles.btnSecondary}>
                GitHub PR Agent
              </button>
            </div>

            <div style={styles.proofRow}>
              {proofItems.map((item) => (
                <span key={item} style={styles.proofPill}>
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div style={styles.heroVisual}>
            <div style={styles.visualFrame}>
              <div style={styles.visualTopLine} />

              <div style={styles.commandBar}>
                <span style={styles.commandLabel}>Live pipeline</span>
                <div style={styles.commandMetrics}>
                  <span style={styles.metricBadgeBlue}>42 technical</span>
                  <span style={styles.metricBadgeMint}>12 PR ready</span>
                </div>
              </div>

              <div style={styles.workflowRail}>
                {workflow.map((step, index) => (
                  <div key={step.label} style={styles.workflowCard}>
                    <div style={styles.workflowHead}>
                      <span style={{ ...styles.workflowChip, color: step.tone, borderColor: `${step.tone}44` }}>
                        {step.label}
                      </span>
                      <span style={styles.workflowIndex}>0{index + 1}</span>
                    </div>
                    <div style={styles.workflowTitle}>{step.title}</div>
                    <div style={styles.workflowMeta}>{step.meta}</div>
                  </div>
                ))}
              </div>

              <div style={styles.visualGrid}>
                <section style={styles.queuePanel}>
                  <div style={styles.panelHead}>
                    <div>
                      <div style={styles.panelEyebrow}>Feedback inbox</div>
                      <div style={styles.panelTitle}>Technical and product signal in one queue</div>
                    </div>
                    <span style={styles.panelBadge}>Live triage</span>
                  </div>

                  <div style={styles.filterRow}>
                    <span style={styles.filterChipActive}>All</span>
                    <span style={styles.filterChip}>Technical</span>
                    <span style={styles.filterChip}>Non-technical</span>
                  </div>

                  <div style={styles.queueList}>
                    {queueRows.map((row) => (
                      <div key={row.title} style={styles.queueRow}>
                        <span style={{ ...styles.queueDot, background: row.tone }} />
                        <div style={styles.queueText}>
                          <div style={styles.queueTitle}>{row.title}</div>
                          <div style={styles.queueMeta}>{row.tag}</div>
                        </div>
                        <span style={styles.queueStatus}>{row.status}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <aside style={styles.sideStack}>
                  <div style={styles.classifierPanel}>
                    <div style={styles.panelEyebrow}>AI route</div>
                    <div style={styles.classifierItem}>
                      <span style={styles.classifierKey}>Type</span>
                      <span style={styles.classifierValueSage}>technical</span>
                    </div>
                    <div style={styles.classifierItem}>
                      <span style={styles.classifierKey}>Category</span>
                      <span style={styles.classifierValue}>bug</span>
                    </div>
                    <div style={styles.classifierItem}>
                      <span style={styles.classifierKey}>Path</span>
                      <span style={styles.classifierValueSand}>engineering queue</span>
                    </div>
                  </div>

                  <div style={styles.prPanel}>
                    <div style={styles.panelEyebrowDark}>GitHub handoff</div>
                    <div style={styles.prTitle}>Auto-PR enabled</div>
                    <div style={styles.prCode}>fix/checkout-timeout-ios</div>
                    <div style={styles.prMeta}>PR #184 linked to feedback thread</div>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </section>

        <section style={styles.systemSection}>
          <div style={styles.sectionIntro}>
            <div style={styles.sectionLabel}>System flow</div>
            <h2 style={styles.sectionTitle}>Built for the feedback loop between product and engineering.</h2>
            <p style={styles.sectionBody}>
              The landing page should sell the operating model, not just list features. DevFeedback
              works when raw customer reports become a routed queue with a clear next action.
            </p>
          </div>

          <div style={styles.stepGrid}>
            {systemSteps.map((step) => (
              <article key={step.id} style={styles.stepCard}>
                <div style={styles.stepId}>{step.id}</div>
                <h3 style={styles.stepTitle}>{step.title}</h3>
                <p style={styles.stepBody}>{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section style={styles.installSection}>
          <div style={styles.installCard}>
            <div>
              <div style={styles.sectionLabel}>Developer setup</div>
              <h2 style={styles.sectionTitle}>Embed the widget and start collecting signal.</h2>
              <p style={styles.sectionBody}>
                Use the React package with a project API key from the dashboard. Same-origin works
                out of the box, and deployed hosts can be configured in widget options.
              </p>
            </div>

            <div style={styles.codeRow}>
              <code style={styles.code}>{NPM}</code>
              <button type="button" onClick={copyInstall} style={styles.copyBtn}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100svh",
    position: "relative",
    overflow: "hidden",
    background: theme.bg,
    color: theme.text,
    fontFamily: fontBody,
  },
  nav: {
    position: "relative",
    zIndex: 1,
    maxWidth: 1240,
    margin: "0 auto",
    padding: "1.15rem 1.5rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },
  brandWrap: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap" as const,
  },
  brand: {
    fontSize: "1.05rem",
    fontWeight: 800,
    letterSpacing: "-0.03em",
  },
  brandTag: {
    color: theme.textMuted,
    fontSize: "0.78rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.16em",
  },
  navActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  navGhost: {
    border: `1px solid ${theme.line}`,
    background: theme.bgElevated,
    color: theme.text,
    padding: "0.78rem 1rem",
    borderRadius: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: fontBody,
  },
  navPrimary: {
    border: "none",
    background: theme.white,
    color: theme.dark,
    padding: "0.78rem 1rem",
    borderRadius: 12,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: fontBody,
  },
  hero: {
    position: "relative",
    zIndex: 1,
    maxWidth: 1240,
    margin: "0 auto",
    padding: "2.5rem 1.5rem 3rem",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.02fr) minmax(0, 1fr)",
    gap: "2rem",
    alignItems: "center",
  },
  heroCopy: {
    maxWidth: 580,
  },
  kickerRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    marginBottom: "1rem",
  },
  kickerDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: theme.sage,
  },
  kicker: {
    color: theme.textMuted,
    fontSize: "0.8rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.18em",
    fontWeight: 700,
  },
  h1: {
    margin: 0,
    fontFamily: fontBody,
    fontSize: "clamp(2.9rem, 7vw, 5.6rem)",
    lineHeight: 0.95,
    letterSpacing: "-0.06em",
    maxWidth: 540,
  },
  lead: {
    margin: "1.3rem 0 0 0",
    color: theme.textSoft,
    fontSize: "1.08rem",
    lineHeight: 1.7,
    maxWidth: 520,
  },
  heroActions: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap" as const,
    marginTop: "2rem",
  },
  btnPrimary: {
    border: "none",
    background: theme.sand,
    color: "#120f0a",
    padding: "0.95rem 1.2rem",
    borderRadius: 12,
    fontSize: "0.95rem",
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: fontBody,
  },
  btnSecondary: {
    border: `1px solid ${theme.line}`,
    background: theme.panel,
    color: theme.text,
    padding: "0.95rem 1.2rem",
    borderRadius: 12,
    fontSize: "0.95rem",
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: fontBody,
  },
  proofRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 10,
    marginTop: "1.5rem",
  },
  proofPill: {
    padding: "0.56rem 0.8rem",
    borderRadius: 999,
    border: `1px solid ${theme.line}`,
    background: theme.bgElevated,
    color: theme.textMuted,
    fontSize: "0.82rem",
    lineHeight: 1.2,
  },
  heroVisual: {
    minWidth: 0,
  },
  visualFrame: {
    position: "relative",
    borderRadius: 28,
    padding: "1rem",
    background: theme.panel,
    border: `1px solid ${theme.line}`,
    overflow: "hidden",
  },
  visualTopLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    background: "linear-gradient(90deg, rgba(111,143,132,0) 0%, rgba(200,169,119,0.9) 50%, rgba(111,143,132,0) 100%)",
  },
  commandBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "0.2rem 0 1rem",
    flexWrap: "wrap" as const,
  },
  commandLabel: {
    color: theme.textMuted,
    fontSize: "0.78rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.16em",
    fontWeight: 700,
  },
  commandMetrics: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
  },
  metricBadgeBlue: {
    padding: "0.42rem 0.6rem",
    borderRadius: 999,
    background: "rgba(111,143,132,0.14)",
    border: "1px solid rgba(111,143,132,0.26)",
    color: theme.sage,
    fontSize: "0.78rem",
    fontWeight: 700,
  },
  metricBadgeMint: {
    padding: "0.42rem 0.6rem",
    borderRadius: 999,
    background: "rgba(200,169,119,0.14)",
    border: "1px solid rgba(200,169,119,0.26)",
    color: theme.sand,
    fontSize: "0.78rem",
    fontWeight: 700,
  },
  workflowRail: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 10,
    marginBottom: "1rem",
  },
  workflowCard: {
    padding: "0.9rem",
    borderRadius: 18,
    border: `1px solid ${theme.line}`,
    background: theme.panelAlt,
    minWidth: 0,
  },
  workflowHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  workflowChip: {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.26rem 0.45rem",
    border: "1px solid",
    borderRadius: 999,
    fontSize: "0.72rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    fontWeight: 700,
  },
  workflowIndex: {
    color: theme.textMuted,
    fontSize: "0.75rem",
  },
  workflowTitle: {
    fontSize: "0.86rem",
    fontWeight: 700,
    lineHeight: 1.35,
  },
  workflowMeta: {
    marginTop: 8,
    color: theme.textMuted,
    fontSize: "0.77rem",
    lineHeight: 1.4,
  },
  visualGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.2fr) minmax(200px, 0.72fr)",
    gap: 12,
  },
  queuePanel: {
    borderRadius: 22,
    background: theme.bgElevated,
    color: theme.text,
    padding: "1rem",
    minWidth: 0,
  },
  panelHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: "0.9rem",
    flexWrap: "wrap" as const,
  },
  panelEyebrow: {
    fontSize: "0.74rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.16em",
    color: theme.textMuted,
    fontWeight: 800,
  },
  panelTitle: {
    marginTop: 6,
    fontSize: "1rem",
    fontWeight: 800,
    lineHeight: 1.2,
    letterSpacing: "-0.03em",
  },
  panelBadge: {
    padding: "0.36rem 0.58rem",
    borderRadius: 999,
    background: "rgba(111,143,132,0.14)",
    color: theme.sage,
    fontSize: "0.72rem",
    fontWeight: 800,
    whiteSpace: "nowrap" as const,
  },
  filterRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    marginBottom: "0.85rem",
  },
  filterChipActive: {
    padding: "0.4rem 0.65rem",
    borderRadius: 999,
    background: theme.sand,
    color: "#120f0a",
    fontSize: "0.78rem",
    fontWeight: 700,
  },
  filterChip: {
    padding: "0.4rem 0.65rem",
    borderRadius: 999,
    background: theme.panelAlt,
    color: theme.textMuted,
    fontSize: "0.78rem",
    fontWeight: 700,
  },
  queueList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  queueRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0.8rem 0",
    borderBottom: `1px solid ${theme.line}`,
  },
  queueDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
  },
  queueText: {
    minWidth: 0,
    flex: 1,
  },
  queueTitle: {
    fontSize: "0.88rem",
    fontWeight: 700,
    lineHeight: 1.3,
  },
  queueMeta: {
    marginTop: 4,
    color: theme.textMuted,
    fontSize: "0.76rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  },
  queueStatus: {
    color: theme.textMuted,
    fontSize: "0.76rem",
    fontWeight: 700,
    whiteSpace: "nowrap" as const,
  },
  sideStack: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 12,
  },
  classifierPanel: {
    borderRadius: 20,
    background: theme.bgElevated,
    border: `1px solid ${theme.line}`,
    padding: "1rem",
  },
  classifierItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "0.55rem 0",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    fontSize: "0.84rem",
  },
  classifierKey: {
    color: theme.textMuted,
  },
  classifierValue: {
    color: theme.text,
    fontWeight: 700,
  },
  classifierValueSage: {
    color: theme.sage,
    fontWeight: 700,
  },
  classifierValueSand: {
    color: theme.sand,
    fontWeight: 700,
  },
  prPanel: {
    borderRadius: 20,
    padding: "1rem",
    background: theme.panelAlt,
    border: "1px solid rgba(200,169,119,0.2)",
    color: theme.text,
  },
  panelEyebrowDark: {
    fontSize: "0.74rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.16em",
    color: "rgba(232,237,242,0.7)",
    fontWeight: 800,
  },
  prTitle: {
    marginTop: 8,
    fontSize: "1rem",
    fontWeight: 800,
  },
  prCode: {
    marginTop: 10,
    borderRadius: 12,
    background: theme.bg,
    border: "1px solid rgba(255,255,255,0.08)",
    padding: "0.65rem 0.75rem",
    fontFamily: 'ui-monospace, "SFMono-Regular", monospace',
    fontSize: "0.8rem",
    color: theme.sand,
  },
  prMeta: {
    marginTop: 10,
    color: theme.textMuted,
    fontSize: "0.8rem",
    lineHeight: 1.5,
  },
  systemSection: {
    position: "relative",
    zIndex: 1,
    maxWidth: 1240,
    margin: "0 auto",
    padding: "1.5rem 1.5rem 0",
  },
  sectionIntro: {
    maxWidth: 720,
    marginBottom: "1.4rem",
  },
  sectionLabel: {
    color: theme.sand,
    fontSize: "0.78rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.18em",
    fontWeight: 800,
  },
  sectionTitle: {
    margin: "0.65rem 0 0 0",
    fontFamily: fontBody,
    fontSize: "clamp(1.7rem, 3.3vw, 2.7rem)",
    lineHeight: 1.02,
    letterSpacing: "-0.05em",
  },
  sectionBody: {
    margin: "0.8rem 0 0 0",
    color: theme.textSoft,
    fontSize: "1rem",
    lineHeight: 1.7,
  },
  stepGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 14,
  },
  stepCard: {
    borderRadius: 22,
    border: `1px solid ${theme.line}`,
    background: "rgba(17,24,39,0.72)",
    padding: "1.2rem",
  },
  stepId: {
    color: theme.sage,
    fontSize: "0.82rem",
    fontWeight: 800,
    letterSpacing: "0.08em",
  },
  stepTitle: {
    margin: "0.7rem 0 0 0",
    fontSize: "1.08rem",
    fontWeight: 800,
    lineHeight: 1.2,
  },
  stepBody: {
    margin: "0.7rem 0 0 0",
    color: theme.textSoft,
    lineHeight: 1.65,
    fontSize: "0.94rem",
  },
  installSection: {
    position: "relative",
    zIndex: 1,
    maxWidth: 1240,
    margin: "0 auto",
    padding: "3rem 1.5rem 4.5rem",
  },
  installCard: {
    borderRadius: 28,
    border: `1px solid ${theme.line}`,
    background: theme.panel,
    padding: "1.4rem",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 420px)",
    gap: "1rem",
    alignItems: "end",
  },
  codeRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap" as const,
    borderRadius: 18,
    border: `1px solid ${theme.line}`,
    background: theme.bg,
    padding: "0.9rem",
  },
  code: {
    flex: 1,
    minWidth: 220,
    color: theme.text,
    fontFamily: 'ui-monospace, "SFMono-Regular", monospace',
    fontSize: "0.86rem",
    wordBreak: "break-all" as const,
  },
  copyBtn: {
    border: "none",
    background: theme.white,
    color: theme.dark,
    padding: "0.72rem 0.95rem",
    borderRadius: 12,
    fontSize: "0.84rem",
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: fontBody,
    whiteSpace: "nowrap" as const,
  },
};
