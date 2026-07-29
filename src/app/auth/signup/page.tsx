// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/auth/signup/page.tsx   (REPLACES existing file)
//
// Session 107 — Restyled to match login page's tan/cream palette.
//   Purple gradient → warm cream background with tan card.
//   Removed "house rules" reference → just "I confirm I'm 18 or older."
//   Same auth logic (email + password → Supabase signUp).
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!confirm) {
      setError("Please confirm you're 18 or older.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    if (!supabase) {
      setLoading(false);
      setError("Accounts aren't enabled yet. You can still play without an account.");
      return;
    }
    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { is_18_plus: confirm },
      },
    });
    setLoading(false);

    if (signupError) {
      setError(signupError.message);
      return;
    }

    if (data.session) {
      router.push("/");
      router.refresh();
    } else {
      setNeedsEmailConfirm(true);
    }
  };

  /* ── Email-confirmation screen ── */
  if (needsEmailConfirm) {
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
          textAlign: "center",
          boxShadow: "0 4px 24px rgba(58, 42, 24, 0.08)",
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✉️</div>
          <h1 style={{
            fontSize: 24,
            fontWeight: 800,
            color: C.text,
            margin: "0 0 8px",
            letterSpacing: -0.5,
          }}>
            Check your email
          </h1>
          <p style={{ fontSize: 15, color: C.textDim, margin: 0, lineHeight: 1.6 }}>
            We sent a confirmation link to{" "}
            <strong style={{ color: C.text }}>{email}</strong>.
            Click it to finish signing up.
          </p>
        </div>
      </div>
    );
  }

  /* ── Signup form ── */
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
            Create your Spotlight account
          </h1>
          <p style={{
            fontSize: 14,
            color: C.textFaint,
            margin: 0,
          }}>
            Share photos, learn English, have fun
          </p>
        </div>

        <form onSubmit={handleSignup}>
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
          <div style={{ marginBottom: 20 }}>
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
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
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

          {/* Age confirmation — no "house rules" */}
          <label style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            fontSize: 14,
            color: C.textDim,
            marginBottom: 20,
            cursor: "pointer",
            lineHeight: 1.4,
          }}>
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
              style={{
                marginTop: 2,
                width: 16,
                height: 16,
                accentColor: C.accent,
                flexShrink: 0,
              }}
            />
            <span>I confirm I&apos;m 18 or older.</span>
          </label>

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
            {loading ? "Creating account…" : "Sign up"}
          </button>
        </form>

        {/* Log in link */}
        <p style={{
          textAlign: "center",
          marginTop: 20,
          fontSize: 14,
          color: C.textDim,
        }}>
          Already have an account?{" "}
          <Link href="/auth/login" style={{
            color: C.accent,
            fontWeight: 600,
            textDecoration: "none",
          }}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
