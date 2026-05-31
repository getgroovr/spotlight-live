// ─────────────────────────────────────────────────────────────────────────
// src/app/student/login/page.tsx — returning-student sign-in.
//
// "I already joined, just get me back to my profile." An email field that
// requests a magic link (via requestLoginLink), then a "check your email"
// confirmation. The link lands on /auth/confirm → /student/dashboard, the
// same path the join flow uses. No game replay.
//
// This is the STUDENT door (magic link). The teacher signs in at /auth/login
// (password) — different mechanism, kept separate on purpose.
// ─────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { requestLoginLink } from "./actions";

export const dynamic = "force-dynamic";

const C = {
  bg: "#FBF6EC",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
};
const F = "'Outfit',sans-serif";

export default async function StudentLogin({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const sent = sp.sent === "1";
  const error = sp.error;

  return (
    <div style={{ background: C.bg, minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "2rem 1rem", fontFamily: F, color: C.text }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>

      <div style={{ width: "100%", maxWidth: 440, background: C.panel,
        border: `1px solid ${C.panelEdge}`, borderRadius: 20,
        padding: "32px 28px", boxShadow: "0 12px 40px rgba(0,0,0,0.08)" }}>

        <div style={{ fontSize: 12, letterSpacing: 3, textTransform: "uppercase",
          color: C.light, marginBottom: 10 }}>
          Spotlight
        </div>

        {sent ? (
          <>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 10px" }}>
              Check your email
            </h1>
            <p style={{ fontSize: 14, color: C.textDim, lineHeight: 1.6, margin: "0 0 20px" }}>
              If that email belongs to a class, a sign-in link is on its way.
              Open it on this device and it'll take you straight to your profile.
            </p>
            <p style={{ fontSize: 13, color: C.textFaint, lineHeight: 1.6, margin: 0 }}>
              Didn't get it? It can take a minute, and sometimes lands in spam.
              You can request another in a little while.
            </p>
            <div style={{ marginTop: 24 }}>
              <Link href="/student/login" style={{ fontSize: 13, color: C.light }}>
                ← Use a different email
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 8px" }}>
              Welcome back
            </h1>
            <p style={{ fontSize: 14, color: C.textDim, lineHeight: 1.6, margin: "0 0 22px" }}>
              Already joined? Enter your email and we'll send a link straight to
              your profile — no need to play again.
            </p>

            {error === "email" && (
              <div style={{ fontSize: 13, color: "#9A3412", background: "#FDE6CE",
                border: "1px solid #E9B384", borderRadius: 10, padding: "8px 12px",
                marginBottom: 14 }}>
                That doesn't look like a valid email. Try again?
              </div>
            )}
            {error === "config" && (
              <div style={{ fontSize: 13, color: "#9A3412", background: "#FDE6CE",
                border: "1px solid #E9B384", borderRadius: 10, padding: "8px 12px",
                marginBottom: 14 }}>
                The server isn't configured to send email right now.
              </div>
            )}

            <form action={requestLoginLink}>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                Your email
              </label>
              <input
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px",
                  fontFamily: F, fontSize: 14, background: "#FFFDF7", color: C.text,
                  border: `1px solid ${C.panelEdge}`, borderRadius: 10, outline: "none",
                  marginBottom: 16 }}
              />
              <button
                type="submit"
                style={{ width: "100%", padding: "13px", fontFamily: F, fontSize: 15,
                  fontWeight: 700, background: C.light, color: "#fff", border: "none",
                  borderRadius: 12, cursor: "pointer", letterSpacing: 0.5 }}
              >
                Email me a sign-in link →
              </button>
            </form>

            <p style={{ fontSize: 13, color: C.textFaint, lineHeight: 1.6, margin: "20px 0 0",
              textAlign: "center" }}>
              New here?{" "}
              <Link href="/play" style={{ color: C.light, fontWeight: 600 }}>
                Join a class →
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
