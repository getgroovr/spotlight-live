// ─────────────────────────────────────────────────────────────────────────
// src/app/student/dashboard/page.tsx — the student profile.
//
// Landing page after the magic link. Two states:
//
//   1. INCOMPLETE — they've just clicked the link but haven't finished
//      joining. Shows the finish-joining form: real name, screen name, an
//      OPTIONAL self-photo, the "why was this your favorite?" note, and the
//      REQUIRED first game entry (a photo of their own + a description) that
//      becomes their first `entries` row so the class has content right away.
//      Form lives in ./FinishJoiningForm.tsx (client) which wraps
//      saveProfile via useFormState so any error is surfaced in-form.
//
//   2. COMPLETE — shows their profile as a HISTORY STRIP (one collapsible
//      tile per class, newest first) plus a "Go to the game →" button. Read +
//      per-class scoping live in src/lib/student-archive.ts; the strip UI in
//      ./ProfileArchive.tsx. The "Add another photo" form lives in
//      ./AddEntryForm.tsx (client) which wraps addEntry via useFormState
//      for the same error-surfacing reason.
//
//   Two distinct photos live on the finish-joining form, do not conflate:
//     • self-photo      → students.photo_url (optional, the profile face)
//     • first entry pic → entries.media_url  (required, classmate-facing)
//
// Auth: the magic link set a session cookie (via /auth/confirm). We read it
// with the SSR client; no session → /play.
//
// Error surfacing (#26): the two forms used to be inline here with
// <form action={saveProfile}> / <form action={addEntry}>. They silently
// no-op'd on any failure. Now they're extracted into client components
// that capture the ActionResult and render an error banner above submit.
// ─────────────────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { getStudentArchive } from "@/lib/student-archive";
import ProfileArchive from "./ProfileArchive";
import FinishJoiningForm from "./FinishJoiningForm";
import AddEntryForm from "./AddEntryForm";

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

  const { student, classes, ownEntry } = data;
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

          <FinishJoiningForm
            studentName={student.name}
            studentScreenName={student.screen_name}
            newestFavorite={newestFavorite ? {
              publicUrl: newestFavorite.publicUrl,
              description_text: newestFavorite.description_text,
            } : null}
          />
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
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
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

        {/* ── GO TO THE GAME ── */}
        <a
          href="/student/play"
          style={{ display: "block", textAlign: "center", textDecoration: "none",
            width: "100%", boxSizing: "border-box", padding: "13px",
            fontFamily: F, fontSize: 15, fontWeight: 700, background: C.light,
            color: "#fff", border: "none", borderRadius: 12, letterSpacing: 0.5,
            marginBottom: 28 }}
        >
          Go to the game →
        </a>

        {/* ── YOUR PHOTO ──
            Added in slice 1 engine-adaptation pass. Shows the student's own
            most-recent entry in their current class — photo + the description
            they wrote — so the dashboard has something personal to anchor on.
            No comment box: their own contribution isn't something they comment
            on (their classmates do that, in the game).

            When status === "pending", a small "awaiting approval" badge and
            a one-line explanation tell them what to expect. This is the main
            motivator to come back: they uploaded, the teacher reviews, then
            the photo goes live for classmates to see in the game.

            Hidden entirely when there's no own entry yet (e.g. no current
            class), so the dashboard still reads cleanly. */}
        {ownEntry && (
          <section style={{
            background: C.panel, border: `1px solid ${C.panelEdge}`,
            borderRadius: 16, padding: "20px 22px", marginBottom: 28,
          }}>
            <h2 style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase",
              color: C.light, marginBottom: 14, marginTop: 0,
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span>Your photo</span>
              {ownEntry.status === "pending" && (
                <span style={{
                  fontSize: 10, letterSpacing: 1.5, fontWeight: 600,
                  background: C.panelEdge, color: "#fff",
                  padding: "3px 8px", borderRadius: 999,
                }}>
                  AWAITING APPROVAL
                </span>
              )}
            </h2>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              {ownEntry.signedUrl ? (
                <img src={ownEntry.signedUrl} alt=""
                  style={{ width: 160, height: 160, objectFit: "cover", borderRadius: 12,
                    border: `2px solid ${C.light}`, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 160, height: 160, borderRadius: 12,
                  border: `2px dashed ${C.panelEdge}`, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, color: C.textFaint, textAlign: "center", padding: 8 }}>
                  photo unavailable
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                {ownEntry.description_text && (
                  <p style={{ fontSize: 14, color: C.text, fontStyle: "italic",
                    lineHeight: 1.6, margin: "0 0 10px",
                    borderLeft: `2px solid ${C.light}`, paddingLeft: 12 }}>
                    &quot;{ownEntry.description_text}&quot;
                  </p>
                )}
                {ownEntry.status === "pending" ? (
                  <p style={{ fontSize: 12, color: C.textDim, lineHeight: 1.6, margin: 0 }}>
                    Your teacher will review this soon. Once approved, your
                    classmates will see it in the game.
                  </p>
                ) : (
                  <p style={{ fontSize: 12, color: C.textDim, lineHeight: 1.6, margin: 0 }}>
                    Approved and live — your classmates see this in the game.
                  </p>
                )}
              </div>
            </div>

            {/* ── ADD ANOTHER PHOTO ──
                Added in slice 1 engine-adaptation pass (#25). The student
                can upload additional photos anytime, not just at finish-
                joining. New uploads land in the same `entries` table at
                status='pending' for the same current class; teacher approves
                via the moderation surface. The most-recent upload becomes
                the photo shown above on next page load (revalidatePath in
                addEntry handles the refresh).

                For now we only show ONE own photo on the dashboard (the
                most recent). Surfacing the full stack of own entries is a
                separate layout pass — see handoff #25 "earlier photos"
                note.

                Form extracted into ./AddEntryForm.tsx (#26) so failures
                surface as an in-form banner instead of silently no-op'ing. */}
            <div style={{ marginTop: 22, paddingTop: 18,
              borderTop: `1px solid ${C.panelEdge}` }}>
              <h3 style={{ fontSize: 13, letterSpacing: 1.5,
                textTransform: "uppercase", color: C.light,
                marginTop: 0, marginBottom: 12 }}>
                Add another photo
              </h3>
              <AddEntryForm />
            </div>
          </section>
        )}

        {/* ── YOUR CLASSES (history strip) ── */}
        <h2 style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase",
          color: C.light, marginBottom: 12 }}>
          {classes.length > 1 ? "Your classes" : "Your class"}
        </h2>
        <ProfileArchive classes={classes} />

        {/* ── WHAT HAPPENS NEXT ──
            Softened again: the prior copy promised an email when a new round
            opens, but the round-timing/notification feature doesn't exist
            yet, so the promise wasn't true. New copy stays accurate to the
            current behavior — when there's new stuff from classmates, you'll
            see it next time you visit. When round-timing lands and we DO send
            emails / show a countdown, this paragraph gets revisited. */}
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
            photos they reply to. You can add another photo whenever you want. When new
            classmate photos are ready, you&apos;ll see them next time you visit.
          </p>
        </section>
      </div>
    </div>
  );
}
