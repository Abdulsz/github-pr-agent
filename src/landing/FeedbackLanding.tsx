import { useState } from "react";

const API_ORIGIN = "https://github-pr-agent.zakariatimalma.workers.dev";
const NPM = "npm install @devfeedback/react-widget";
const HTML_SNIPPET = `<script src="${API_ORIGIN}/embed.js"></script>
<script>
  FeedbackWidget.init({
    projectId: "YOUR_PROJECT_ID",
    apiKey: "YOUR_API_KEY",
    theme: "light",
    position: "bottom-right",
    primaryColor: "#d7ff3f",
    title: "Help us improve!",
    onSubmit: function (data) {
      console.log("Submitted:", data);
    }
  });
</script>`;
const REACT_SNIPPET = `import { FeedbackWidget } from "@devfeedback/react-widget";

<FeedbackWidget
  projectId="YOUR_PROJECT_ID"
  apiKey="YOUR_API_KEY"
  apiBaseUrl="${API_ORIGIN}"
  config={{
    theme: "dark",
    position: "bottom-right",
    primaryColor: "#d7ff3f",
    title: "Help us improve!",
  }}
  onSubmit={(data) => console.log("Submitted:", data)}
/>`;
const fontBody = '"Manrope", -apple-system, BlinkMacSystemFont, sans-serif';
const fontDisplay = '"Archivo", "Manrope", -apple-system, BlinkMacSystemFont, sans-serif';

const theme = {
  ink: "#0a0a0a",
  paper: "#f4f4f1",
  accent: "#d7ff3f",
  line: "rgba(244,244,241,0.16)",
  muted: "rgba(244,244,241,0.62)",
  faint: "rgba(244,244,241,0.4)",
} as const;

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const routes = ["Widget", "AI route", "Inbox", "GitHub PR"] as const;
const proof = ["Embedded widget", "AI classification", "Team inbox", "Optional auto-PR"] as const;

export function FeedbackLanding({
  onSignIn,
  onOpenAgent,
}: {
  onSignIn: () => void;
  onOpenAgent: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [snippet, setSnippet] = useState<"html" | "react">("html");

  function copyText(id: string, text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1600);
  }

  function scrollToWidget() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("widget")?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
  }

  return (
    <div style={styles.page}>
      <style>{motionCss}</style>
      <div aria-hidden="true" style={styles.grain} />
      <header style={styles.navOuter}>
        <div style={styles.nav} className="df-nav">
          <button type="button" onClick={onSignIn} style={styles.brandButton} className="df-brand">
            DevFeedback
          </button>
          <nav style={styles.navActions} className="df-nav-actions">
            <button type="button" onClick={scrollToWidget} style={styles.navLink} className="df-btn-ghost df-nav-compact">
              Widget
            </button>
            <button
              type="button"
              onClick={onOpenAgent}
              style={styles.navLink}
              className="df-btn-ghost df-nav-compact df-nav-agent"
            >
              PR Agent
            </button>
            <button type="button" onClick={onSignIn} style={styles.navPrimary} className="df-btn-primary df-nav-compact">
              Dashboard
            </button>
          </nav>
        </div>
      </header>

      <main>
        <section style={styles.heroOuter}>
          <div aria-hidden="true" style={styles.heroGlow} />
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
          <div style={styles.hero} className="df-hero-grid">
          <div style={styles.heroCopy} className="df-enter df-hero-copy">
            <p style={styles.kicker}>Feedback ops for product teams</p>
            <h1 style={styles.h1} className="df-h1">
              Feedback in.
              <br />
              <em style={styles.h1Em}>Pull requests</em> out.
            </h1>
            <p style={styles.lead}>
              Collect reports in-app, classify them with AI, and move technical feedback toward a
              pull request.
            </p>
            <div style={styles.heroActions}>
              <button type="button" onClick={onSignIn} style={styles.btnPrimary} className="df-btn-primary">
                Open dashboard
              </button>
              <button type="button" onClick={onOpenAgent} style={styles.btnSecondary} className="df-btn-ghost">
                Try PR Agent
              </button>
            </div>
          </div>

          <div style={styles.signalBoard} className="df-enter df-delay df-signal-board">
            <div style={styles.boardHeader}>
              <span>Signal pipeline</span>
              <span style={styles.boardLive}>Live</span>
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
          </div>
        </section>

        <section id="loop" style={styles.loopSection}>
          <div style={styles.loopInner}>
            <h2 style={styles.sectionTitle}>One loop from customer report to team action.</h2>
            <div style={styles.proofGrid} className="df-proof-grid">
              {proof.map((item) => (
                <div key={item} style={styles.proofItem}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="widget" style={styles.widgetSection} className="df-widget-section">
          <div style={styles.widgetInner} className="df-widget-inner">
            <h2 style={styles.widgetTitle}>Add the widget with one script tag.</h2>
            <p style={styles.widgetLead}>
              Create a project, copy the ID and API key, and paste this on any page. Reports land in
              your dashboard inbox.
            </p>

            <div style={styles.snippetShell}>
              <div style={styles.snippetHead} className="df-snippet-head">
                <div style={styles.snippetTabs} className="df-snippet-tabs" role="tablist" aria-label="Widget install snippets">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={snippet === "html"}
                    onClick={() => setSnippet("html")}
                    style={{
                      ...styles.snippetTab,
                      ...(snippet === "html" ? styles.snippetTabActive : {}),
                    }}
                    className={snippet === "html" ? "df-btn-ghost df-snippet-tab-active" : "df-btn-ghost"}
                  >
                    HTML / JS
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={snippet === "react"}
                    onClick={() => setSnippet("react")}
                    style={{
                      ...styles.snippetTab,
                      ...(snippet === "react" ? styles.snippetTabActive : {}),
                    }}
                    className={snippet === "react" ? "df-btn-ghost df-snippet-tab-active" : "df-btn-ghost"}
                  >
                    React
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => copyText(snippet, snippet === "html" ? HTML_SNIPPET : REACT_SNIPPET)}
                  style={styles.copyBtn}
                  className="df-btn-primary df-snippet-copy"
                >
                  {copied === snippet ? "Copied" : "Copy"}
                </button>
              </div>
              <pre style={styles.snippetPre} className="df-code-pre" tabIndex={0}>
                <code style={styles.snippetCode}>{snippet === "html" ? HTML_SNIPPET : REACT_SNIPPET}</code>
              </pre>
            </div>

            {snippet === "react" ? (
              <div style={styles.npmRow} className="df-npm-row">
                <code style={styles.code}>{NPM}</code>
                <button
                  type="button"
                  onClick={() => copyText("npm", NPM)}
                  style={styles.copyBtn}
                  className="df-btn-primary"
                >
                  {copied === "npm" ? "Copied" : "Copy"}
                </button>
              </div>
            ) : null}

            <div style={styles.widgetNotes} className="df-widget-notes">
              <div style={styles.noteBlock}>
                <h3 style={styles.noteHeading}>What you need</h3>
                <p style={styles.noteBody}>
                  After you create a project, copy <code>projectId</code> and <code>apiKey</code> from
                  the dashboard and replace the placeholders. The script host is also the API host, so
                  you do not set a base URL for the HTML embed.
                </p>
                <p style={styles.noteBody}>
                  The widget posts to <code>POST /api/feedback/submit</code> with an{" "}
                  <code>X-API-Key</code> header. CORS is open, so it works from any domain. Title and
                  description are required. Email is optional.
                </p>
              </div>
              <div style={styles.noteBlock}>
                <h3 style={styles.noteHeading}>Init options</h3>
                <p style={styles.noteBody}>
                  Required: <code>projectId</code>, <code>apiKey</code>. Optional:{" "}
                  <code>theme</code> (light or dark), <code>position</code> (bottom-right, bottom-left,
                  top-right, top-left), <code>primaryColor</code>, <code>title</code>,{" "}
                  <code>showEmail</code>.
                </p>
                <p style={styles.noteBody}>
                  Callbacks: <code>onSubmit</code>, <code>onError</code>, <code>onOpen</code>. After
                  init, call <code>FeedbackWidget.open()</code>, <code>close()</code>, or{" "}
                  <code>destroy()</code>. React users should also pass <code>apiBaseUrl</code> when the
                  app is not on this origin.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="cta" style={styles.finalCta}>
          <div aria-hidden="true" style={styles.finalGlow} />
          <h2 style={styles.finalTitle}>
            Start with the feedback <em style={styles.finalEm}>already inside</em> your product.
          </h2>
          <button type="button" onClick={onSignIn} style={styles.finalButton} className="df-btn-primary">
            Open dashboard
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
button { transition: transform 160ms ease, background 160ms ease, border-color 160ms ease, color 160ms ease; }
button:hover { transform: translateY(-1px); }
button:active { transform: translateY(0) scale(0.98); }
.df-btn-primary:hover { background: #d7ff3f !important; border-color: #d7ff3f !important; color: #0a0a0a !important; }
.df-btn-ghost:hover { border-color: #f4f4f1 !important; }
button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 3px;
}
@media (prefers-reduced-motion: reduce) {
  .df-enter { animation: none; }
  .df-hero-signal { animation: none; }
  button { transition: none !important; }
}
#widget { scroll-margin-top: 16px; }
.df-widget-inner { min-width: 0; max-width: 100%; }
.df-widget-notes code {
  border-radius: 0;
  border-color: rgba(244,244,241,0.16);
  color: #f4f4f1;
  word-break: break-word;
}
.df-snippet-tab-active {
  background: #f4f4f1 !important;
  color: #0a0a0a !important;
  border-color: #f4f4f1 !important;
}
.df-snippet-tab-active:hover {
  background: #d7ff3f !important;
  border-color: #d7ff3f !important;
  color: #0a0a0a !important;
}
.df-code-pre {
  scrollbar-color: rgba(244,244,241,0.28) transparent;
  max-width: 100%;
  box-sizing: border-box;
}
.df-code-pre code {
  border: 0 !important;
  padding: 0 !important;
  border-radius: 0 !important;
  font-size: inherit !important;
  background: transparent !important;
  white-space: pre-wrap !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}
@media (max-width: 1080px) {
  .df-proof-grid { grid-template-columns: 1fr 1fr !important; }
}
@media (max-width: 860px) {
  .df-hero-grid { grid-template-columns: 1fr !important; grid-template-rows: auto !important; }
  .df-hero-copy { align-self: start !important; }
  .df-section-grid { grid-template-columns: 1fr !important; }
  .df-signal-board { min-height: 420px !important; }
  .df-widget-notes { grid-template-columns: 1fr !important; }
}
@media (max-width: 640px) {
  .df-nav { padding: 0 16px !important; }
  .df-nav-actions { gap: 6px !important; }
  .df-nav-compact { padding: 8px 9px !important; font-size: 0.8rem !important; }
  .df-widget-section { padding: 56px 16px !important; }
  .df-snippet-head {
    flex-wrap: wrap !important;
    align-items: stretch !important;
    gap: 8px !important;
  }
  .df-snippet-copy { width: 100%; }
  .df-code-pre { font-size: 0.75rem !important; padding: 14px 12px !important; }
  .df-npm-row { flex-wrap: wrap !important; }
  .df-npm-row button { width: 100%; }
}
@media (max-width: 480px) {
  .df-nav-agent { display: none !important; }
  .df-brand { font-size: 0.92rem !important; }
  .df-snippet-tabs button { padding: 10px 12px !important; flex: 1; }
}
@media (max-width: 560px) {
  .df-hero-grid { padding-left: 20px !important; padding-right: 20px !important; }
  .df-signal-board { padding: 12px !important; }
  .df-proof-grid { grid-template-columns: 1fr !important; }
  .df-h1 { font-size: clamp(1.9rem, 9.4vw, 2.4rem) !important; }
}
@media (max-height: 720px) {
  .df-h1 { font-size: clamp(2.6rem, min(4.6vw, 7.4svh), 4rem) !important; }
}
`;

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100svh",
    background: theme.ink,
    color: theme.paper,
    fontFamily: fontBody,
    overflowX: "hidden",
  },
  grain: {
    position: "fixed",
    inset: 0,
    zIndex: 60,
    pointerEvents: "none",
    backgroundImage: GRAIN,
    backgroundRepeat: "repeat",
    backgroundSize: 140,
    opacity: 0.07,
  },
  navOuter: {
    borderBottom: `1px solid ${theme.line}`,
  },
  nav: {
    height: 72,
    maxWidth: 1440,
    margin: "0 auto",
    padding: "0 32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandButton: {
    border: 0,
    background: "transparent",
    color: theme.paper,
    fontFamily: fontDisplay,
    fontSize: "1.02rem",
    fontWeight: 800,
    letterSpacing: "-0.02em",
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
    color: theme.paper,
    borderRadius: 0,
    padding: "10px 14px",
    fontFamily: "inherit",
    fontWeight: 700,
    cursor: "pointer",
  },
  navPrimary: {
    border: `1px solid ${theme.paper}`,
    background: theme.paper,
    color: theme.ink,
    borderRadius: 0,
    padding: "10px 14px",
    fontFamily: "inherit",
    fontWeight: 800,
    cursor: "pointer",
  },
  heroOuter: {
    position: "relative",
    overflow: "hidden",
    isolation: "isolate",
  },
  hero: {
    position: "relative",
    minHeight: "calc(100svh - 72px)",
    maxWidth: 1440,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "minmax(0, 0.94fr) minmax(340px, 0.72fr)",
    gridTemplateRows: "1fr",
    gap: "clamp(32px, 6vw, 88px)",
    alignItems: "start",
    padding: "clamp(24px, 4vw, 48px) 32px clamp(28px, 4vw, 56px)",
  },
  heroGlow: {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
    background:
      "radial-gradient(ellipse 54% 46% at 22% 92%, rgba(215,255,63,0.09) 0%, rgba(215,255,63,0.02) 45%, transparent 70%)," +
      "radial-gradient(ellipse 44% 38% at 74% 8%, rgba(244,244,241,0.05) 0%, transparent 65%)",
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
    margin: "0 0 18px",
    color: theme.muted,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    fontSize: "0.78rem",
    fontWeight: 700,
  },
  h1: {
    margin: 0,
    maxWidth: 820,
    fontFamily: fontDisplay,
    fontSize: "clamp(3rem, min(5.9vw, 9svh), 5.1rem)",
    lineHeight: 1.1,
    letterSpacing: "-0.045em",
    wordSpacing: "0.08em",
    fontWeight: 900,
    paddingBottom: "0.06em",
  },
  h1Em: {
    fontStyle: "italic",
    fontWeight: 800,
    color: theme.accent,
    letterSpacing: "-0.03em",
  },
  lead: {
    margin: "20px 0 0",
    maxWidth: 480,
    color: theme.muted,
    fontSize: "clamp(0.9rem, 1.1vw, 1.02rem)",
    lineHeight: 1.55,
  },
  heroActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 26,
  },
  btnPrimary: {
    border: `1px solid ${theme.paper}`,
    background: theme.paper,
    color: theme.ink,
    borderRadius: 0,
    padding: "14px 20px",
    fontFamily: "inherit",
    fontWeight: 800,
    cursor: "pointer",
  },
  btnSecondary: {
    border: `1px solid ${theme.line}`,
    background: "transparent",
    color: theme.paper,
    borderRadius: 0,
    padding: "14px 20px",
    fontFamily: "inherit",
    fontWeight: 800,
    cursor: "pointer",
  },
  signalBoard: {
    position: "relative",
    zIndex: 1,
    border: `1px solid ${theme.line}`,
    borderRadius: 0,
    minHeight: 480,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: 18,
    background: "rgba(10,10,10,0.82)",
    backdropFilter: "blur(2px)",
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
    fontWeight: 700,
  },
  boardLive: {
    color: theme.accent,
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
    color: theme.faint,
    fontSize: "0.82rem",
    fontWeight: 700,
  },
  routeName: {
    fontFamily: fontDisplay,
    fontSize: "clamp(1.35rem, 2.6vw, 2.3rem)",
    fontWeight: 800,
    letterSpacing: "-0.035em",
  },
  ticket: {
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    border: `1px solid ${theme.paper}`,
    borderRadius: 0,
    padding: 18,
  },
  ticketLabel: {
    display: "inline-block",
    marginBottom: 10,
    color: theme.accent,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontSize: "0.74rem",
    fontWeight: 700,
  },
  ticketTitle: {
    margin: 0,
    maxWidth: 340,
    fontFamily: fontDisplay,
    fontSize: "1.4rem",
    lineHeight: 1.08,
    letterSpacing: "-0.03em",
    fontWeight: 700,
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
  loopSection: {
    padding: "clamp(72px, 9vw, 128px) 32px",
    borderTop: `1px solid ${theme.line}`,
  },
  loopInner: {
    maxWidth: 1376,
    margin: "0 auto",
  },
  sectionTitle: {
    margin: 0,
    maxWidth: 760,
    fontFamily: fontDisplay,
    fontSize: "clamp(2rem, 4.4vw, 4rem)",
    lineHeight: 1.02,
    letterSpacing: "-0.04em",
    fontWeight: 800,
  },
  proofGrid: {
    marginTop: "clamp(40px, 5vw, 72px)",
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "clamp(20px, 3vw, 40px)",
  },
  proofItem: {
    paddingTop: 18,
    borderTop: `1px solid ${theme.line}`,
    fontSize: "1.12rem",
    fontWeight: 700,
  },
  widgetSection: {
    padding: "clamp(72px, 9vw, 128px) 32px",
    borderTop: `1px solid ${theme.line}`,
  },
  widgetInner: {
    maxWidth: 1376,
    margin: "0 auto",
    minWidth: 0,
  },
  widgetTitle: {
    margin: 0,
    maxWidth: 820,
    fontFamily: fontDisplay,
    fontSize: "clamp(1.55rem, 7vw, 3.4rem)",
    lineHeight: 1.12,
    letterSpacing: "-0.04em",
    fontWeight: 800,
  },
  widgetLead: {
    margin: "18px 0 0",
    maxWidth: "65ch",
    color: theme.muted,
    fontSize: "1.02rem",
    lineHeight: 1.55,
  },
  snippetShell: {
    marginTop: "clamp(32px, 4vw, 48px)",
    border: `1px solid ${theme.line}`,
    background: "rgba(10,10,10,0.55)",
    minWidth: 0,
    overflow: "hidden",
  },
  snippetHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: 10,
    borderBottom: `1px solid ${theme.line}`,
  },
  snippetTabs: {
    display: "flex",
    gap: 8,
    minWidth: 0,
    flex: 1,
  },
  snippetTab: {
    border: `1px solid ${theme.line}`,
    background: "transparent",
    color: theme.paper,
    borderRadius: 0,
    padding: "10px 14px",
    fontFamily: "inherit",
    fontWeight: 700,
    cursor: "pointer",
  },
  snippetTabActive: {
    border: `1px solid ${theme.paper}`,
    background: theme.paper,
    color: theme.ink,
  },
  snippetPre: {
    margin: 0,
    padding: "22px 20px",
    overflowX: "auto",
    maxWidth: "100%",
    fontSize: "0.88rem",
    lineHeight: 1.65,
    fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
  },
  snippetCode: {
    display: "block",
    minWidth: 0,
    color: theme.paper,
    border: 0,
    borderRadius: 0,
    padding: 0,
    background: "transparent",
    fontFamily: "inherit",
    fontSize: "inherit",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },
  npmRow: {
    marginTop: 12,
    display: "flex",
    gap: 10,
    alignItems: "center",
    border: `1px solid ${theme.line}`,
    borderRadius: 0,
    padding: 10,
  },
  widgetNotes: {
    marginTop: "clamp(40px, 5vw, 64px)",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "clamp(28px, 5vw, 64px)",
  },
  noteBlock: {
    paddingTop: 18,
    borderTop: `1px solid ${theme.line}`,
  },
  noteHeading: {
    margin: 0,
    fontFamily: fontDisplay,
    fontSize: "1.2rem",
    letterSpacing: "-0.03em",
    fontWeight: 800,
  },
  noteBody: {
    margin: "12px 0 0",
    maxWidth: "58ch",
    color: theme.muted,
    fontSize: "0.96rem",
    lineHeight: 1.6,
  },
  code: {
    flex: 1,
    minWidth: 0,
    color: theme.paper,
    border: 0,
    fontSize: "0.92rem",
    wordBreak: "break-all",
    fontFamily: 'ui-monospace, "SFMono-Regular", monospace',
  },
  copyBtn: {
    border: `1px solid ${theme.paper}`,
    background: theme.paper,
    color: theme.ink,
    borderRadius: 0,
    padding: "11px 14px",
    fontFamily: "inherit",
    fontWeight: 800,
    cursor: "pointer",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  finalCta: {
    position: "relative",
    padding: "clamp(96px, 12vw, 176px) 32px",
    borderTop: `1px solid ${theme.line}`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 32,
    overflow: "hidden",
    isolation: "isolate",
  },
  finalGlow: {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
    background:
      "radial-gradient(ellipse 46% 62% at 50% 108%, rgba(215,255,63,0.10) 0%, rgba(215,255,63,0.02) 50%, transparent 72%)",
  },
  finalTitle: {
    position: "relative",
    zIndex: 1,
    margin: 0,
    maxWidth: 860,
    fontFamily: fontDisplay,
    fontSize: "clamp(2.2rem, 4.8vw, 4.6rem)",
    lineHeight: 1.1,
    letterSpacing: "-0.04em",
    fontWeight: 800,
    paddingBottom: "0.06em",
  },
  finalEm: {
    fontStyle: "italic",
    color: theme.accent,
    letterSpacing: "-0.03em",
  },
  finalButton: {
    position: "relative",
    zIndex: 1,
    border: `1px solid ${theme.paper}`,
    background: theme.paper,
    color: theme.ink,
    borderRadius: 0,
    padding: "16px 24px",
    fontFamily: "inherit",
    fontWeight: 800,
    cursor: "pointer",
  },
};
