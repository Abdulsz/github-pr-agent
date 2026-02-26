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
    primaryColor = "#007bff",
    title: widgetTitle = "Send us your feedback",
  } = config;

  const isDark = theme === "dark";

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

  const containerBg = isDark ? "#1f2937" : "#fff";
  const textColor = isDark ? "#f3f4f6" : "#111827";
  const borderColor = isDark ? "#374151" : "#e5e7eb";
  const inputBg = isDark ? "#374151" : "#fff";
  const inputBorder = isDark ? "#4b5563" : "#d1d5db";

  return (
    <div style={{ position: "fixed", zIndex: 9999, ...positionMap[position] }}>
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          title="Send feedback"
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            backgroundColor: primaryColor,
            color: "#fff",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            transition: "transform 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          {"💬"}
        </button>
      ) : (
        <div
          style={{
            background: containerBg,
            borderRadius: 12,
            boxShadow: "0 5px 40px rgba(0,0,0,0.16)",
            width: 360,
            maxHeight: 600,
            display: "flex",
            flexDirection: "column",
            color: textColor,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: 16,
              borderBottom: `1px solid ${borderColor}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 16 }}>{widgetTitle}</span>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 20,
                padding: 0,
                color: textColor,
                lineHeight: 1,
              }}
            >
              {"✕"}
            </button>
          </div>

          {/* Body */}
          {submitted ? (
            <div style={{ padding: "32px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{"✅"}</div>
              <p style={{ margin: 0, fontWeight: 500 }}>Thanks for your feedback!</p>
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
                  border: `1px solid ${inputBorder}`,
                  borderRadius: 6,
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
                  border: `1px solid ${inputBorder}`,
                  borderRadius: 6,
                  fontSize: 14,
                  fontFamily: "inherit",
                  background: inputBg,
                  color: textColor,
                  outline: "none",
                  resize: "vertical" as const,
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
                  border: `1px solid ${inputBorder}`,
                  borderRadius: 6,
                  fontSize: 14,
                  background: inputBg,
                  color: textColor,
                  outline: "none",
                  boxSizing: "border-box",
                  width: "100%",
                }}
              />

              {error && (
                <p style={{ margin: 0, color: "#ef4444", fontSize: 13 }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  borderRadius: 6,
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: loading ? "not-allowed" : "pointer",
                  backgroundColor: primaryColor,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? "Sending..." : "Send Feedback"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
