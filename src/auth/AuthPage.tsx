import { useState } from "react";

interface AuthPageProps {
  onAuth: (token: string, user: { id: string; email: string; name?: string }) => void;
}

export function AuthPage({ onAuth }: AuthPageProps) {
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
          <h1 style={styles.title}>Feedback Service</h1>
          <p style={styles.subtitle}>
            {mode === "login" ? "Sign in to your account" : "Create a new account"}
          </p>
        </header>

        <div style={styles.card}>
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

            <div>
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
            </div>

            <div>
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
            </div>

            {error && (
              <div style={styles.errorBox}>
                <p style={{ margin: 0 }}>{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.button,
                ...styles.primaryButton,
                ...(loading ? styles.disabledButton : {}),
                width: "100%",
                marginTop: "0.5rem",
              }}
            >
              {loading
                ? mode === "login"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "login"
                  ? "Sign In"
                  : "Create Account"}
            </button>
          </form>

          <div style={styles.switchRow}>
            <span style={{ color: "#888" }}>
              {mode === "login" ? "Don't have an account?" : "Already have an account?"}
            </span>
            <button
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
    background: "#000",
    color: "#fff",
    fontFamily: '"Manrope", -apple-system, BlinkMacSystemFont, sans-serif',
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  main: {
    width: "100%",
    maxWidth: 440,
    padding: "2rem",
  },
  header: {
    textAlign: "center",
    marginBottom: "2rem",
  },
  title: {
    fontSize: "2rem",
    fontWeight: 700,
    color: "#fff",
    marginBottom: "0.5rem",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    color: "#888",
    fontSize: "1rem",
  },
  card: {
    background: "rgba(255, 255, 255, 0.06)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    borderRadius: 16,
    padding: "2rem",
    border: "1px solid rgba(255, 255, 255, 0.12)",
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
    border: "1px solid rgba(255, 255, 255, 0.2)",
    background: "rgba(255, 255, 255, 0.06)",
    color: "#fff",
    fontSize: "1rem",
    marginBottom: "1rem",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  button: {
    padding: "0.875rem 2rem",
    borderRadius: 12,
    border: "1px solid rgba(255, 255, 255, 0.2)",
    fontWeight: 600,
    fontSize: "1rem",
    cursor: "pointer",
    transition: "border-color 0.2s, opacity 0.2s",
  },
  primaryButton: {
    background: "#fff",
    color: "#000",
    borderColor: "#fff",
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
    marginBottom: "1rem",
    color: "#fca5a5",
    fontSize: "0.9rem",
  },
  switchRow: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "0.5rem",
    marginTop: "1.5rem",
    fontSize: "0.9rem",
  },
  switchButton: {
    background: "none",
    border: "none",
    color: "#fff",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "0.9rem",
    padding: 0,
  },
};
