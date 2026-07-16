// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/page.tsx   (REPLACES existing file)
//
// Root page — auth-aware redirect.
//   Signed-in teacher  → /teacher/students
//   Signed-in student  → /student/dashboard
//   Signed-in admin    → /admin  (if multi mode)
//   Not signed in      → public landing with "Play now"
// ─────────────────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import Link from "next/link";

export default async function HomePage() {
  const supabase = await createClient();

  // ── If we have a valid session, redirect by role ──────────────────────
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, is_admin")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        // Route by primary role. is_admin is a capability, not a destination —
        // admin-flagged teachers still land on /teacher/students and reach
        // /admin via a link in the teacher header.
        if (profile.role === "student") {
          redirect("/student/dashboard");
        }

        if (profile.role === "teacher") {
          redirect("/teacher/students");
        }

        // Fallback: someone flagged is_admin with no teacher/student role
        // (a pure administrator who doesn't run classes).
        if (profile.is_admin) {
          redirect("/admin");
        }
      }
    }
  }

  // ── No session or no profile — show public landing ────────────────────
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
      <p
        style={{
          fontSize: 16,
          color: "#6E5536",
          maxWidth: 420,
          lineHeight: 1.6,
          marginTop: 12,
        }}
      >
        The shuffle-stop showcase. Hit stop, see who lands in the spotlight,
        look at your classmates&apos; pictures, and leave them a comment.
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