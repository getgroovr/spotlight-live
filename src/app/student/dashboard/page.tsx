// ─────────────────────────────────────────────────────────────────────────
// src/app/student/dashboard/page.tsx — the student profile.
//
// Landing page after the magic link. Two states:
//
//   1. INCOMPLETE — they've just clicked the link but haven't finished
//      joining. Shows a form (real name, screen name, and "why was this your
//      favorite?") with the favorite photo in view. Submits to saveProfile.
//      (Unchanged from before — uses their NEWEST class to populate it.)
//
//   2. COMPLETE — shows their profile as a HISTORY STRIP: one collapsible
//      tile per class they've ever enrolled in, newest first. The newest is
//      expanded; older ones collapse to a tile (favorite pic + class + date)
//      and expand on click into that class's full Round-1 archive. Each
//      expanded class offers a per-class CSV download to hand to a new teacher.
//
//   This is the Slice 1 Part 2 change: the profile spans EVERY class the
//   student has been in, not just the most-recent session. Read + per-class
//   scoping live in src/lib/student-archive.ts; the strip UI in
//   ./ProfileArchive.tsx.
//
// Auth: the magic link set a session cookie (via /auth/confirm). We read it
// with the SSR client; no session → /play.
// ─────────────────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { getStudentArchive } from "@/lib/student-archive";
import ProfileArchive from "./ProfileArchive";
import { saveProfile } from "@/app/play/actions";

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

export default async function StudentProfile() {
  const data = await getStudentArchive();

  if ("error" in data && data.error === "no-session") {
    redirect("/play");
  }

  if ("error" in data) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", padding: "4rem 1rem",
        fontFamily: F, color: C.text, textAlign: "center" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>Something&apos;s off</h1>
        <p style={{ color: C.textDim }}>
          {data.error === "not-enrolled"
            ? "We couldn't find your enrollment. Try playing again at /play."
            : data.error}
        </p>
      </div>
    );
  }

  const { student, classes } = data;
  const displayName = student.screen_name || student.name || "there";

  // The newest class drives the finish-joining form (the one they just joined).
  const newest = classes[0] || null;
  const newestFavorite = newest?.entries.find((e) => e.isFavorite) || null;

  // "Complete" = profile fields filled AND the newest class has its why-note.
  // Same gate as before, evaluated against the newest class.
  const isComplete = !!(student.name && student.screen_name && newest?.favoriteComment);

  // ── INCOMPLETE: finish-joining form ──────────────────────────────────
  if (!isComplete) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", padding: "2rem 1rem 4rem",
        fontFamily: F, color: C.text }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px" }}>
            Finish joining
          </h1>
          <p style={{ fontSize: 14, color: C.textDim, lineHeight: 1.6, margin: "0 0 24px" }}>
            You&apos;re almost in. This is your profile — the home base for the class.
            Each round you&apos;ll look at a set of photos, write about them, and add one
            of your own; everything you and your teacher write stacks up here over
            time. First, a couple of things:
          </p>

          <form action={saveProfile}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                Your name <span style={{ color: C.textFaint, fontWeight: 400 }}>— your teacher sees this</span>
              </label>
              <input
                name="name"
                type="text"
                required
                defaultValue={student.name || ""}
                placeholder="First name is fine"
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px",
                  fontFamily: F, fontSize: 14, background: "#FFFDF7", color: C.text,
                  border: `1px solid ${C.panelEdge}`, borderRadius: 10, outline: "none" }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                Screen name <span style={{ color: C.textFaint, fontWeight: 400 }}>— what classmates see</span>
              </label>
              <input
                name="screen_name"
                type="text"
                required
                defaultValue={student.screen_name || ""}
                placeholder="A name for the class to see"
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px",
                  fontFamily: F, fontSize: 14, background: "#FFFDF7", color: C.text,
                  border: `1px solid ${C.panelEdge}`, borderRadius: 10, outline: "none" }}
              />
            </div>

            {newestFavorite && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 8 }}>
                  Why was this your favorite? What did you like about it?
                </label>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start",
                  background: C.panel, border: `1px solid ${C.panelEdge}`,
                  borderRadius: 14, padding: 12, marginBottom: 10 }}>
                  {newestFavorite.publicUrl && (
                    <img src={newestFavorite.publicUrl} alt=""
                      style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 10,
                        border: `2px solid ${C.light}`, flexShrink: 0 }} />
                  )}
                  {newestFavorite.description_text && (
                    <p style={{ fontSize: 13, color: C.text, fontStyle: "italic",
                      lineHeight: 1.5, margin: 0, borderLeft: `2px solid ${C.light}`, paddingLeft: 10 }}>
                      &quot;{newestFavorite.description_text}&quot;
                    </p>
                  )}
                </div>
                <textarea
                  name="favorite_comment"
                  required
                  minLength={15}
                  rows={4}
                  placeholder="Tell your teacher what drew you to this one (at least 15 characters)."
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px",
                    fontFamily: F, fontSize: 14, lineHeight: 1.5,
                    background: "#FFFDF7", color: C.text,
                    border: `1px solid ${C.panelEdge}`, borderRadius: 12, outline: "none",
                    resize: "vertical" }}
                />
              </div>
            )}

            <button
              type="submit"
              style={{ width: "100%", padding: "13px", fontFamily: F, fontSize: 15, fontWeight: 700,
                background: C.light, color: "#fff", border: "none", borderRadius: 12,
                cursor: "pointer", letterSpacing: 0.5, marginTop: 4 }}
            >
              Finish joining →
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── COMPLETE: the history strip ──────────────────────────────────────
  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "2rem 1rem 4rem",
      fontFamily: F, color: C.text }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>

      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* ── HEADER ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%",
            background: C.panelEdge, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 28, color: "#fff" }}>
            {displayName[0]?.toUpperCase()}
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 4px" }}>
              Welcome, {displayName}.
            </h1>
            <div style={{ fontSize: 13, color: C.textDim }}>
              {classes.length > 1
                ? `You're in ${classes.length} classes.`
                : "You're in the class."}
            </div>
          </div>
        </div>

        {/* ── YOUR CLASSES (history strip) ── */}
        <h2 style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase",
          color: C.light, marginBottom: 12 }}>
          {classes.length > 1 ? "Your classes" : "Your class"}
        </h2>
        <ProfileArchive classes={classes} />

        {/* ── WHAT HAPPENS NEXT ── */}
        <section style={{
          background: C.panel, border: `1px solid ${C.panelEdge}`,
          borderRadius: 16, padding: "20px 22px", marginTop: 28,
        }}>
          <h2 style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase",
            color: C.light, marginBottom: 8, marginTop: 0 }}>
            What happens next
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: C.text, margin: 0 }}>
            Your teacher will read what you wrote and respond — their notes show up under the
            photos they reply to. Each new round, you&apos;ll add one of your own photos and
            comment on the other students&apos; photos. When round 2 opens, you&apos;ll get an email
            to come back and add yours.
          </p>
        </section>
      </div>
    </div>
  );
}
