import { useState } from "react";

interface FeedbackWidgetProps {
  projectId: string;
  apiKey: string;
  apiBaseUrl?: string;
  config?: {
    theme?: "light" | "dark";
    position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
    primaryColor?: string;
    title?: string;
  };
}

const positionMap: Record<string, React.CSSProperties> = {
  "bottom-right": { bottom: 20, right: 20 },
  "bottom-left": { bottom: 20, left: 20 },
  "top-right": { top: 20, right: 20 },
  "top-left": { top: 20, left: 20 },
};

export function FeedbackWidget({
  projectId,
  apiKey,
  apiBaseUrl = "",
  config = {},
}: FeedbackWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const {
    theme = "light",
    position = "bottom-right",
    primaryColor = "#000000",
    title: widgetTitle = "Send feedback",
  } = config;

  const isDark = theme === "dark";
  const containerBg = isDark ? "#000" : "#fff";
  const textColor = isDark ? "#fff" : "#000";
  const borderColor = isDark ? "rgba(255,255,255,0.24)" : "rgba(0,0,0,0.24)";
  const inputBg = isDark ? "#000" : "#fff";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${apiBaseUrl}/api/feedback/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          projectId,
          title,
          description,
          email: email || undefined,
          metadata: {
            userAgent: navigator.userAgent,
            url: window.location.href,
            referrer: document.referrer,
          },
        }),
      });

      if (response.ok) {
        setSubmitted(true);
        setTimeout(() => {
          setTitle("");
          setDescription("");
          setEmail("");
          setSubmitted(false);
          setIsOpen(false);
        }, 2000);
      } else {
        const data = await response.json().catch(() => null);
        setError((data as { error?: string })?.error || "Failed to submit feedback");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: "fixed", zIndex: 9999, ...positionMap[position] }}>
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          title="Send feedback"
          style={{
            width: 56,
            height: 56,
            borderRadius: 3,
            border: `1px solid ${isDark ? "#fff" : "#000"}`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            backgroundColor: primaryColor,
            color: "#fff",
            boxShadow: "none",
            transition: "transform 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
        >
          +
        </button>
      ) : (
        <div
          style={{
            background: containerBg,
            borderRadius: 3,
            border: `1px solid ${borderColor}`,
            boxShadow: "none",
            width: 360,
            maxHeight: 600,
            display: "flex",
            flexDirection: "column",
            color: textColor,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          <div
            style={{
              padding: 16,
              borderBottom: `1px solid ${borderColor}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 16 }}>{widgetTitle}</span>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 18,
                padding: 0,
                color: textColor,
                lineHeight: 1,
              }}
            >
              x
            </button>
          </div>

          {submitted ? (
            <div style={{ padding: "32px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 8, fontWeight: 800 }}>OK</div>
              <p style={{ margin: 0, fontWeight: 600 }}>Thanks for your feedback.</p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              style={{
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <input
                type="text"
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                style={{
                  padding: "8px 12px",
                  border: `1px solid ${borderColor}`,
                  borderRadius: 3,
                  fontSize: 14,
                  background: inputBg,
                  color: textColor,
                  outline: "none",
                  boxSizing: "border-box",
                  width: "100%",
                }}
              />
              <textarea
                placeholder="Describe your feedback or report an issue..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={4}
                style={{
                  padding: "8px 12px",
                  border: `1px solid ${borderColor}`,
                  borderRadius: 3,
                  fontSize: 14,
                  fontFamily: "inherit",
                  background: inputBg,
                  color: textColor,
                  outline: "none",
                  resize: "vertical",
                  boxSizing: "border-box",
                  width: "100%",
                }}
              />
              <input
                type="email"
                placeholder="Your email (optional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  padding: "8px 12px",
                  border: `1px solid ${borderColor}`,
                  borderRadius: 3,
                  fontSize: 14,
                  background: inputBg,
                  color: textColor,
                  outline: "none",
                  boxSizing: "border-box",
                  width: "100%",
                }}
              />

              {error && <p style={{ margin: 0, color: textColor, fontSize: 13 }}>{error}</p>}

              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  border: `1px solid ${isDark ? "#fff" : "#000"}`,
                  borderRadius: 3,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: loading ? "not-allowed" : "pointer",
                  backgroundColor: primaryColor,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? "Sending..." : "Send feedback"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
