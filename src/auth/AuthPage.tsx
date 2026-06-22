import { useState } from "react";

interface AuthPageProps {
  onAuth: (token: string, user: { id: string; email: string; name?: string }) => void;
  onBackHome?: () => void;
}

export function AuthPage({ onAuth, onBackHome }: AuthPageProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body: Record<string, string> = { email, password };
      if (mode === "register" && name.trim()) body.name = name.trim();

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as {
        success: boolean;
        data?: { token: string; user: { id: string; email: string; name?: string } };
        error?: string;
      };

      if (!data.success || !data.data) {
        setError(data.error || "Something went wrong");
        return;
      }

      localStorage.setItem("authToken", data.data.token);
      localStorage.setItem("authUser", JSON.stringify(data.data.user));
      onAuth(data.data.token, data.data.user);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
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
          <h1 style={styles.title}>{mode === "login" ? "Sign in" : "Create account"}</h1>
          <p style={styles.subtitle}>Access your feedback workspace.</p>
        </header>

        <div style={styles.panel}>
          <form onSubmit={handleSubmit}>
            {mode === "register" && (
              <div>
                <label style={styles.label}>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  style={styles.input}
                  disabled={loading}
                />
              </div>
            )}

            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={styles.input}
              required
              disabled={loading}
            />

            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
              style={styles.input}
              required
              minLength={mode === "register" ? 8 : undefined}
              disabled={loading}
            />

            {error && <div style={styles.errorBox}>{error}</div>}

            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.button,
                ...styles.primaryButton,
                ...(loading ? styles.disabledButton : {}),
                width: "100%",
                marginTop: 8,
              }}
            >
              {loading
                ? mode === "login"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>

          <div style={styles.switchRow}>
            <span style={styles.mutedText}>
              {mode === "login" ? "Need an account?" : "Already have an account?"}
            </span>
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
              style={styles.switchButton}
            >
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </div>
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
  },
  label: {
    display: "block",
    marginBottom: "0.5rem",
    fontWeight: 700,
    color: "#000",
    fontSize: "0.88rem",
  },
  input: {
    width: "100%",
    padding: "0.78rem 0.9rem",
    borderRadius: 3,
    border: "1px solid rgba(0,0,0,0.24)",
    background: "#fff",
    color: "#000",
    fontSize: "1rem",
    marginBottom: "1rem",
    outline: "none",
    boxSizing: "border-box",
  },
  button: {
    padding: "0.86rem 1.3rem",
    borderRadius: 3,
    border: "1px solid #000",
    fontWeight: 800,
    fontSize: "0.96rem",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  primaryButton: {
    background: "#000",
    color: "#fff",
  },
  disabledButton: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  errorBox: {
    background: "#fff",
    border: "1px solid #000",
    borderRadius: 3,
    padding: "0.75rem 0.9rem",
    marginBottom: "1rem",
    color: "#000",
    fontSize: "0.9rem",
  },
  switchRow: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "0.5rem",
    marginTop: "1.35rem",
    fontSize: "0.9rem",
  },
  mutedText: {
    color: "rgba(0,0,0,0.62)",
  },
  switchButton: {
    background: "none",
    border: "none",
    color: "#000",
    textDecoration: "underline",
    textUnderlineOffset: "3px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: "0.9rem",
    padding: 0,
  },
};
