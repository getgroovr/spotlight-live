// ─────────────────────────────────────────────────────────────────────────
// src/app/student/dashboard/page.tsx — the student profile.
//
// Landing page after the magic link. Two states:
//
//   1. INCOMPLETE — they've just clicked the link but haven't finished
//      joining. Shows a form (real name, screen name, and "why was this your
//      favorite?") with the favorite photo in view. Submits to saveProfile.
//
//   2. COMPLETE — shows their profile as a per-round stack that grows
//      downward. Round 1 holds: a "from your teacher" slot (empty until the
//      teacher writes back), the favorite (photo + its description + the
//      comment they made during the game + the why-note), and all nine
//      comments. Later rounds tack on below.
//
// Auth: the magic link set a session cookie (via /auth/confirm). We read it
// with the SSR client; no session → /play.
// ─────────────────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { saveProfile } from "@/app/play/actions";

const STARTER_BUCKET = "teacher-deck";

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

async function getProfileData() {
  const supabase = await createClient();
  if (!supabase) return { error: "Server not configured." as const };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "no-session" as const };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { error: "Server not configured." as const };
  const admin = createServiceClient(supabaseUrl, serviceKey);

  // Find the student record for this email
  const { data: student } = await admin
    .from("students")
    .select("id, name, screen_name, email")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  if (!student) return { error: "not-enrolled" as const };

  // Most recent game session (round 1 for now)
  const { data: session } = await admin
    .from("game_sessions")
    .select("comments, favorites, favorite_comment, round, completed_at")
    .eq("student_id", student.id)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const commentIds = session?.comments ? Object.keys(session.comments) : [];
  const favoriteIds = session?.favorites
    ? Object.keys(session.favorites).filter((k) => session.favorites[k])
    : [];
  const favoriteId = favoriteIds[0] || null;

  let entries: Array<{
    id: string; description_text: string | null;
    publicUrl: string | null; comment: string; isFavorite: boolean;
  }> = [];

  if (commentIds.length > 0) {
    const { data: rows } = await admin
      .from("entries")
      .select("id, media_url, description_text")
      .in("id", commentIds);
    if (rows) {
      entries = rows.map((r) => {
        let publicUrl: string | null = null;
        if (r.media_url) {
          try {
            const { data } = admin.storage.from(STARTER_BUCKET).getPublicUrl(r.media_url);
            publicUrl = data?.publicUrl ?? null;
          } catch {}
        }
        return {
          id: r.id,
          description_text: r.description_text,
          publicUrl,
          comment: session?.comments?.[r.id] || "",
          isFavorite: r.id === favoriteId,
        };
      });
    }
  }

  // Teacher notes for this student (empty for now — the teacher dashboard
  // will write into this table in the next slice).
  const { data: teacherComments } = await admin
    .from("teacher_comments")
    .select("body, round, created_at")
    .eq("student_id", student.id)
    .order("created_at", { ascending: true });

  return {
    student,
    entries,
    favoriteComment: session?.favorite_comment || null,
    round: session?.round || 1,
    completedAt: session?.completed_at || null,
    teacherComments: teacherComments || [],
  };
}

export default async function StudentProfile() {
  const data = await getProfileData();

  if ("error" in data && data.error === "no-session") {
    redirect("/play");
  }

  if ("error" in data) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", padding: "4rem 1rem",
        fontFamily: F, color: C.text, textAlign: "center" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>Something's off</h1>
        <p style={{ color: C.textDim }}>
          {data.error === "not-enrolled"
            ? "We couldn't find your enrollment. Try playing again at /play."
            : data.error}
        </p>
      </div>
    );
  }

  const { student, entries, favoriteComment, round, completedAt, teacherComments } = data;
  const favorite = entries.find((e) => e.isFavorite) || null;
  const isComplete = !!(student.name && student.screen_name && favoriteComment);
  const classSize = entries.length;
  const displayName = student.screen_name || student.name || "there";

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
            You're almost in. This is your profile — the home base for the class.
            Each round you'll look at a set of photos, write about them, and add one
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

            {favorite && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 8 }}>
                  Why was this your favorite? What did you like about it?
                </label>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start",
                  background: C.panel, border: `1px solid ${C.panelEdge}`,
                  borderRadius: 14, padding: 12, marginBottom: 10 }}>
                  {favorite.publicUrl && (
                    <img src={favorite.publicUrl} alt=""
                      style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 10,
                        border: `2px solid ${C.light}`, flexShrink: 0 }} />
                  )}
                  {favorite.description_text && (
                    <p style={{ fontSize: 13, color: C.text, fontStyle: "italic",
                      lineHeight: 1.5, margin: 0, borderLeft: `2px solid ${C.light}`, paddingLeft: 10 }}>
                      "{favorite.description_text}"
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

  // ── COMPLETE: the profile stack ──────────────────────────────────────
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
            <div style={{ fontSize: 13, color: C.textDim }}>You're in the class.</div>
          </div>
        </div>

        {/* ── FROM YOUR TEACHER (slot — empty until the teacher writes back) ── */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase",
            color: C.light, marginBottom: 10 }}>
            From your teacher
          </h2>
          {teacherComments.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {teacherComments.map((t, i) => (
                <div key={i} style={{ background: C.panel, border: `1px solid ${C.panelEdge}`,
                  borderRadius: 14, padding: "14px 16px" }}>
                  {t.round != null && (
                    <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>
                      Round {t.round}
                    </div>
                  )}
                  <p style={{ fontSize: 14, color: C.text, lineHeight: 1.6, margin: 0 }}>{t.body}</p>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: C.panel, border: `1px dashed ${C.panelEdge}`,
              borderRadius: 14, padding: "16px 18px", fontSize: 13, color: C.textDim, lineHeight: 1.6 }}>
              Your teacher will read what you wrote and add a note here. Check back soon.
            </div>
          )}
        </section>

        {/* ── ROUND 1 ── */}
        <section style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase",
            color: C.light, marginBottom: 4 }}>
            Round {round}
          </h2>
          {completedAt && (
            <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 16 }}>
              Completed {new Date(completedAt).toLocaleDateString()}
            </div>
          )}
        </section>

        {/* ── FAVORITE ── */}
        {favorite && (
          <section style={{ marginBottom: 36 }}>
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8 }}>Your favorite</div>
            <div style={{ display: "flex", gap: 18, alignItems: "flex-start",
              background: C.panel, border: `1px solid ${C.panelEdge}`,
              borderRadius: 16, padding: 16 }}>
              {favorite.publicUrl && (
                <img src={favorite.publicUrl} alt=""
                  style={{ width: 200, height: 200, objectFit: "cover", borderRadius: 12,
                    border: `2px solid ${C.light}`, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1 }}>
                {favorite.description_text && (
                  <p style={{ fontSize: 14, color: C.text, fontStyle: "italic",
                    margin: "0 0 12px", lineHeight: 1.5,
                    borderLeft: `2px solid ${C.light}`, paddingLeft: 10 }}>
                    "{favorite.description_text}"
                  </p>
                )}
                {favorite.comment && (
                  <>
                    <div style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>
                      What you said during the game:
                    </div>
                    <p style={{ fontSize: 14, color: C.text, margin: "0 0 12px", lineHeight: 1.6 }}>
                      {favorite.comment}
                    </p>
                  </>
                )}
                <div style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>
                  Why it was your favorite:
                </div>
                <p style={{ fontSize: 14, color: C.text, margin: 0, lineHeight: 1.6 }}>
                  {favoriteComment}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── ALL COMMENTS ── */}
        <section style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 12, color: C.textDim, marginBottom: 10 }}>All your comments</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {entries.map((e) => (
              <div key={e.id} style={{
                background: e.isFavorite ? C.light + "22" : C.panel,
                border: `2px solid ${e.isFavorite ? C.light : C.panelEdge}`,
                borderRadius: 12, padding: 8, position: "relative",
              }}>
                {e.isFavorite && (
                  <div style={{
                    position: "absolute", top: -8, right: -8,
                    width: 26, height: 26, borderRadius: "50%",
                    background: C.light, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                  }}>★</div>
                )}
                {e.publicUrl && (
                  <img src={e.publicUrl} alt=""
                    style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover",
                      borderRadius: 8, display: "block", marginBottom: 6 }} />
                )}
                <div style={{ fontSize: 11, color: C.text, lineHeight: 1.4,
                  minHeight: 28, wordBreak: "break-word" }}>
                  {e.comment}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── WHAT HAPPENS NEXT ── */}
        <section style={{
          background: C.panel, border: `1px solid ${C.panelEdge}`,
          borderRadius: 16, padding: "20px 22px",
        }}>
          <h2 style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase",
            color: C.light, marginBottom: 8, marginTop: 0 }}>
            What happens next
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: C.text, margin: 0 }}>
            You're now part of a small class{classSize ? ` of up to ${classSize} students` : ""}. Your
            teacher will read what you wrote and respond — their note shows up above. Each
            new round, you'll add one of your own photos and comment on the other students'
            photos. When round 2 opens, you'll get an email to come back and add yours.
          </p>
        </section>
      </div>
    </div>
  );
}
