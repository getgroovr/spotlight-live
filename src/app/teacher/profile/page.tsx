// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/profile/page.tsx   (NEW FILE)
//
// Session 95 — Teacher profile edit page.
//
// Session 97 — Added Class | Deck | Profile nav bar for consistent
// navigation across all teacher pages.
//
// Teachers can edit their bio, teaching style, and toggle their public
// profile visibility. This page links from the teacher dashboard nav.
//
// Server component that loads profile data, renders a client form.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProfileForm from "./profile-form";

const C = {
  bg: "#FBF6EC",
  panelEdge: "#C9A877",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
};

function TopNav() {
  return (
    <nav
      style={{
        display: "flex",
        gap: 24,
        marginBottom: 16,
        fontSize: 14,
        borderBottom: `1px solid ${C.panelEdge}55`,
        paddingBottom: 0,
      }}
    >
      <Link
        href="/teacher/students"
        style={{
          color: C.textDim,
          textDecoration: "none",
          paddingBottom: 6,
          marginBottom: -1,
          fontWeight: 500,
        }}
      >
        Class
      </Link>
      <Link
        href="/teacher/deck"
        style={{
          color: C.textDim,
          textDecoration: "none",
          paddingBottom: 6,
          marginBottom: -1,
          fontWeight: 500,
        }}
      >
        Deck
      </Link>
      <span
        style={{
          fontWeight: 700,
          color: C.light,
          borderBottom: `2px solid ${C.light}`,
          paddingBottom: 6,
          marginBottom: -1,
        }}
      >
        Profile
      </span>
    </nav>
  );
}

export default async function TeacherProfilePage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, bio, teaching_style, avatar_url, is_public")
    .eq("id", user.id)
    .eq("role", "teacher")
    .maybeSingle();

  if (!profile) redirect("/login");

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <TopNav />
        <h1 style={styles.title}>Your Profile</h1>
        <p style={styles.subtitle}>
          This is what students see when they browse for a teacher.
        </p>

        {/* Preview link (only when public) */}
        {profile.is_public && (
          <a
            href={`/teachers/${profile.id}`}
            style={styles.previewLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            View your public profile →
          </a>
        )}

        <ProfileForm
          initialBio={profile.bio || ""}
          initialTeachingStyle={profile.teaching_style || ""}
          initialIsPublic={profile.is_public || false}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#F5ECD7",
    padding: "2rem 1rem",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  container: {
    maxWidth: "600px",
    margin: "0 auto",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "#3D2E1E",
    margin: "0 0 0.25rem",
  },
  subtitle: {
    fontSize: "0.95rem",
    color: "#7A6B5D",
    margin: "0 0 1.5rem",
  },
  previewLink: {
    display: "inline-block",
    marginBottom: "1.5rem",
    color: "#8A6D3B",
    fontWeight: 600,
    fontSize: "0.9rem",
    textDecoration: "none",
  },
};
