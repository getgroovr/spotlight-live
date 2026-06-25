// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/student/dashboard/RequestMagicLinkForm.tsx
//
// B53: When a student visits /student/dashboard without an active session,
// this form lets them request a new magic link instead of being dumped
// back to /play (the warm-up). One URL, one hub — the dashboard handles
// every state including "not signed in."
//
// If the student has never enrolled, the error message directs them to
// play the warm-up first. Otherwise, a new magic link is sent and they
// click through to re-authenticate.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState } from "react";
import { requestMagicLink } from "@/app/play/actions";

const C = {
  bg: "#FBF6EC",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  panelSoft: "#FFFDF7",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
};
const F = "'Outfit',sans-serif";

export default function RequestMagicLinkForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSubmit = async () => {
    if (!validEmail || loading) return;
    setError("");
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("email", email.trim());
      const result = await requestMagicLink(fd);
      if (result.ok) {
        setSent(true);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div style={{ textAlign: "center", padding: "2rem 0" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✉️</div>
        <h2 style={{
          fontFamily: F, fontSize: 22, fontWeight: 800,
          color: C.text, margin: "0 0 10px",
        }}>
          Check your email
        </h2>
        <p style={{
          fontFamily: F, fontSize: 14, color: C.textDim,
          lineHeight: 1.7, maxWidth: 380, margin: "0 auto",
        }}>
          We just sent you a sign-in link. Click it to open your dashboard —
          no password needed.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <label style={{
          fontFamily: F, fontSize: 13, fontWeight: 600, color: C.text,
          display: "block", marginBottom: 6,
        }}>
          Your email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          placeholder="you@example.com"
          style={{
            width: "100%", boxSizing: "border-box", padding: "10px 12px",
            fontFamily: F, fontSize: 14, background: C.panelSoft, color: C.text,
            border: `1px solid ${validEmail ? C.light + "88" : C.panelEdge}`,
            borderRadius: 10, outline: "none",
          }}
        />
      </div>

      {error && (
        <div style={{
          fontFamily: F, fontSize: 13, color: "#C0392B", marginBottom: 12,
          background: "#FDECEA", border: "1px solid #F5C6CB",
          borderRadius: 8, padding: "9px 12px", lineHeight: 1.5,
        }}>
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!validEmail || loading}
        style={{
          width: "100%", padding: "12px", fontFamily: F,
          fontSize: 15, fontWeight: 700, color: "#fff",
          background: validEmail && !loading ? C.light : C.panelEdge,
          border: "none", borderRadius: 10, cursor: validEmail && !loading ? "pointer" : "default",
          letterSpacing: 0.5,
        }}
      >
        {loading ? "Sending…" : "Send me a sign-in link"}
      </button>

      <p style={{
        fontFamily: F, fontSize: 12, color: C.textDim,
        lineHeight: 1.6, margin: "14px 0 0", textAlign: "center",
      }}>
        New here? <a href="/play" style={{ color: C.light, fontWeight: 600 }}>
        Play the warm-up round</a> to join a class first.
      </p>
    </div>
  );
}
