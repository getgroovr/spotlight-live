// Root landing for spotlight-live.
//
// SLICE ONE: the game is playable without an account, so the root simply
// welcomes the player and points them at /play. The auth pages (/auth/login,
// /auth/signup) still exist and work; they'll be wired into the main flow in
// the accounts slice, at which point this page can branch on signed-in state
// again (the prior Supabase-redirect version is preserved in git history).
import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        background: "#D9BE8E",
        color: "#3A2A18",
        fontFamily: "'Outfit', system-ui, sans-serif",
        padding: "2rem",
        boxSizing: "border-box",
      }}
    >
      <h1 style={{ fontSize: 44, fontWeight: 800, margin: 0, letterSpacing: 1 }}>
        Spotlight
      </h1>
      <p style={{ fontSize: 16, color: "#6E5536", maxWidth: 420, lineHeight: 1.6, marginTop: 12 }}>
        The shuffle-stop showcase. Hit stop, see who lands in the spotlight,
        watch their video, and leave them a comment.
      </p>
      <Link
        href="/play"
        style={{
          marginTop: 28,
          display: "inline-block",
          padding: "14px 32px",
          fontSize: 16,
          fontWeight: 700,
          background: "#D98A2B",
          color: "#3A2A18",
          borderRadius: 30,
          textDecoration: "none",
          letterSpacing: 0.5,
        }}
      >
        Play now →
      </Link>
    </main>
  );
}
