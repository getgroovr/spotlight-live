// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/auth/login/page.tsx   (REPLACES existing file)
//
// Session 89 — Restyled to match the app's tan/cream palette.
//   Purple gradient → warm cream background with tan card.
//   Same auth logic (email + password → Supabase signInWithPassword).
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";

const C = {
  bg: "#FBF6EC",
  card: "#FFFDF7",
  cardBorder: "#E8D5B5",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
  accent: "#D98A2B",
  accentHover: "#C47A20",
  error: "#C0392B",
  inputBg: "#FFFFFF",
  inputBorder: "#D4C4A8",
  inputFocus: "#D98A2B",
};
const F = "'Outfit', sans-serif";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{
      background: C.bg,
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem 1rem",
      fontFamily: F,
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>

      <div style={{
        background: C.card,
        border: `1px solid ${C.cardBorder}`,
        borderRadius: 20,
        padding: "40px 36px 36px",
        width: "100%",
        maxWidth: 420,
        boxShadow: "0 4px 24px rgba(58, 42, 24, 0.08)",
      }}>
        {/* Logo / Title */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            fontSize: 36,
            marginBottom: 8,
            filter: "drop-shadow(0 2px 8px rgba(217, 138, 43, 0.3))",
          }}>
            📸
          </div>
          <h1 style={{
            fontSize: 26,
            fontWeight: 800,
            color: C.text,
            margin: "0 0 4px",
            letterSpacing: -0.5,
          }}>
            Log in to Spotlight
          </h1>
          <p style={{
            fontSize: 14,
            color: C.textFaint,
            margin: 0,
          }}>
            Welcome back
          </p>
        </div>

        <form onSubmit={handleLogin}>
          {/* Email */}
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: C.textDim,
              marginBottom: 6,
              letterSpacing: 0.3,
            }}>
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 14px",
                fontSize: 15,
                fontFamily: F,
                color: C.text,
                background: C.inputBg,
                border: `1.5px solid ${C.inputBorder}`,
                borderRadius: 10,
                outline: "none",
                transition: "border-color 0.2s ease",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = C.inputFocus; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = C.inputBorder; }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: C.textDim,
              marginBottom: 6,
              letterSpacing: 0.3,
            }}>
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 14px",
                fontSize: 15,
                fontFamily: F,
                color: C.text,
                background: C.inputBg,
                border: `1.5px solid ${C.inputBorder}`,
                borderRadius: 10,
                outline: "none",
                transition: "border-color 0.2s ease",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = C.inputFocus; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = C.inputBorder; }}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: "#FDF2F0",
              border: `1px solid ${C.error}33`,
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 16,
              fontSize: 13,
              color: C.error,
              lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px",
              fontSize: 16,
              fontWeight: 700,
              fontFamily: F,
              color: "#fff",
              background: loading ? C.textFaint : C.accent,
              border: "none",
              borderRadius: 12,
              cursor: loading ? "not-allowed" : "pointer",
              letterSpacing: 0.5,
              boxShadow: "0 3px 12px rgba(217, 138, 43, 0.3)",
              transition: "background 0.2s ease, transform 0.15s ease",
            }}
            onMouseOver={(e) => { if (!loading) e.currentTarget.style.background = C.accentHover; }}
            onMouseOut={(e) => { if (!loading) e.currentTarget.style.background = C.accent; }}
          >
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>

        {/* Sign up link */}
        <p style={{
          textAlign: "center",
          marginTop: 20,
          fontSize: 14,
          color: C.textDim,
        }}>
          Don&apos;t have an account?{" "}
          <Link href="/auth/signup" style={{
            color: C.accent,
            fontWeight: 600,
            textDecoration: "none",
          }}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
