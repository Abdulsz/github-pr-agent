import { useEffect, useState } from "react";
import { GitHubConnectButton } from "../components/GitHubConnect";

interface AuthPageProps {
  onAuth: (token: string, user: { id: string; email: string; name?: string }) => void;
  onBackHome?: () => void;
}

export function AuthPage({ onAuth, onBackHome }: AuthPageProps) {
  const [error, setError] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  // Complete the sign-in when GitHub redirects back with a session token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = hashParams.get("token");
    const githubStatus = params.get("github");

    if (githubStatus === "error") {
      setError(params.get("message") || "GitHub sign-in failed. Please try again.");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (!token) return;

    window.history.replaceState({}, "", window.location.pathname);
    setFinishing(true);

    (async () => {
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as {
          success: boolean;
          data?: { id: string; email: string; name?: string };
          error?: string;
        };

        if (!data.success || !data.data) {
          setError(data.error || "Sign-in failed. Please try again.");
          return;
        }

        localStorage.setItem("authToken", token);
        localStorage.setItem("authUser", JSON.stringify(data.data));
        onAuth(token, data.data);
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setFinishing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleGitHubSignIn() {
    setRedirecting(true);
    setError("");
    const params = new URLSearchParams({
      context: "login",
      returnTo: "/auth",
      frontendOrigin: window.location.origin,
    });
    window.location.href = `/api/github/oauth/authorize?${params.toString()}`;
  }

  return (
    <div style={styles.container}>
      <main style={styles.main}>
        <header style={styles.header}>
          {onBackHome && (
            <button type="button" onClick={onBackHome} style={styles.backLink}>
              Back to DevFeedback
            </button>
          )}
          <h1 style={styles.title}>Sign in</h1>
          <p style={styles.subtitle}>
            One GitHub sign-in unlocks your feedback workspace and auto-PRs.
          </p>
        </header>

        <div style={styles.panel}>
          {error && <div style={styles.errorBox}>{error}</div>}

          <GitHubConnectButton
            onClick={handleGitHubSignIn}
            loading={redirecting || finishing}
            label={finishing ? "Finishing sign-in..." : "Continue with GitHub"}
            variant="light"
          />

          <p style={styles.helpText}>
            We request <code>repo</code> scope so the agent can open pull requests
            on your behalf, and <code>user:email</code> to create your account.
            No separate GitHub connection step is needed later.
          </p>
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#fff",
    color: "#000",
    fontFamily: '"Manrope", -apple-system, BlinkMacSystemFont, sans-serif',
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  main: {
    width: "100%",
    maxWidth: 460,
    padding: "2rem",
  },
  header: {
    marginBottom: "2rem",
  },
  backLink: {
    display: "inline-flex",
    marginBottom: "1.35rem",
    background: "none",
    border: "none",
    color: "rgba(0,0,0,0.62)",
    fontSize: "0.9rem",
    cursor: "pointer",
    fontFamily: "inherit",
    padding: 0,
  },
  title: {
    margin: 0,
    color: "#000",
    fontSize: "2.5rem",
    lineHeight: 0.96,
    fontWeight: 800,
    letterSpacing: "-0.05em",
  },
  subtitle: {
    margin: "0.75rem 0 0",
    color: "rgba(0,0,0,0.62)",
    fontSize: "1rem",
  },
  panel: {
    background: "#fff",
    borderRadius: 3,
    padding: "1.5rem",
    border: "1px solid rgba(0,0,0,0.2)",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "1rem",
  },
  errorBox: {
    background: "#fff",
    border: "1px solid #000",
    borderRadius: 3,
    padding: "0.75rem 0.9rem",
    color: "#000",
    fontSize: "0.9rem",
    width: "100%",
    boxSizing: "border-box",
  },
  helpText: {
    margin: 0,
    color: "rgba(0,0,0,0.62)",
    fontSize: "0.85rem",
    lineHeight: 1.5,
  },
};
