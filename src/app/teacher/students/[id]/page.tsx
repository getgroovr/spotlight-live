// ─────────────────────────────────────────────────────────────────────────
// src/app/teacher/students/[id]/page.tsx — one student's full journey.
//
// Slice 1B-iii. The teacher's read of a single student: their favorite (photo
// + the photo's own description + what the student wrote in-game + their
// "why" note), then every photo they commented on with the comment beside it,
// then the teacher's notes to this student so far.
//
// Built so adding rounds is "more sections," not a redesign: everything here
// is scoped to the student's most recent session for now; round 2 will loop
// over sessions.
//
// The teacher-note WRITE form is intentionally not wired yet — it's the first
// job of the next slice (it needs a writeTeacherComment Server Action). The
// read side is live so the moment that action exists, notes appear here and
// on the student's profile.
//
// Auth: gated on the teacher owning the class this student is enrolled in.
// ─────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const STARTER_BUCKET = "teacher-deck";
const MEDIA_BUCKET = "media";

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

async function getStudentJourney(studentId: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Server not configured." as const };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "no-session" as const };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { error: "Server not configured." as const };
  const admin = createServiceClient(supabaseUrl, serviceKey);

  // Classes this teacher owns
  const { data: classes } = await admin
    .from("classes")
    .select("id")
    .eq("teacher_id", user.id);
  const classIds = (classes || []).map((c) => c.id);
  if (classIds.length === 0) return { error: "not-teacher" as const };

  // Is this student enrolled in one of the teacher's classes? (the gate)
  const { data: enrollment } = await admin
    .from("enrollments")
    .select("class_id, round")
    .eq("student_id", studentId)
    .in("class_id", classIds)
    .maybeSingle();
  if (!enrollment) return { error: "not-found" as const };

  const { data: student } = await admin
    .from("students")
    .select("id, name, screen_name, email, photo_url")
    .eq("id", studentId)
    .maybeSingle();
  if (!student) return { error: "not-found" as const };

  const { data: session } = await admin
    .from("game_sessions")
    .select("comments, favorites, favorite_comment, round, completed_at")
    .eq("student_id", studentId)
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

  let studentPhotoUrl: string | null = null;
  if (student.photo_url) {
    try {
      const { data } = await admin.storage.from(MEDIA_BUCKET).createSignedUrl(student.photo_url, 3600);
      studentPhotoUrl = data?.signedUrl ?? null;
    } catch {}
  }

  const { data: teacherComments } = await admin
    .from("teacher_comments")
    .select("body, round, created_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: true });

  return {
    student,
    studentPhotoUrl,
    entries,
    favoriteComment: session?.favorite_comment || null,
    round: session?.round || enrollment.round || 1,
    completedAt: session?.completed_at || null,
    teacherComments: teacherComments || [],
  };
}

export default async function StudentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getStudentJourney(id);

  if ("error" in data && data.error === "no-session") {
    redirect("/teacher/deck");
  }

  if ("error" in data) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", padding: "4rem 1rem",
        fontFamily: F, color: C.text, textAlign: "center" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>
          {data.error === "not-found" ? "Student not found" : "Something's off"}
        </h1>
        <p style={{ color: C.textDim }}>
          {data.error === "not-found"
            ? "This student isn't in one of your classes."
            : data.error === "not-teacher"
            ? "This account doesn't own a class."
            : data.error}
        </p>
        <Link href="/teacher/students" style={{ color: C.light, fontSize: 14 }}>
          ← Back to class
        </Link>
      </div>
    );
  }

  const { student, studentPhotoUrl, entries, favoriteComment, round, completedAt, teacherComments } = data;
  const favorite = entries.find((e) => e.isFavorite) || null;
  const displayName = student.screen_name || student.name || student.email;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "2rem 1rem 4rem",
      fontFamily: F, color: C.text }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>

      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link href="/teacher/students"
          style={{ fontSize: 13, color: C.textDim, textDecoration: "underline" }}>
          ← Back to class
        </Link>

        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "14px 0 28px" }}>
          {studentPhotoUrl ? (
            <img src={studentPhotoUrl} alt=""
              style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover",
                border: `2px solid ${C.light}` }} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: "50%",
              background: C.panelEdge, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 28, color: "#fff" }}>
              {displayName[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 2px" }}>{displayName}</h1>
            <div style={{ fontSize: 13, color: C.textDim }}>
              {student.name && student.name !== displayName ? `${student.name} · ` : ""}
              {student.email}
            </div>
            {completedAt && (
              <div style={{ fontSize: 12, color: C.textFaint, marginTop: 2 }}>
                Round {round} · completed {new Date(completedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>

        {/* FAVORITE — the highest-value writing sample */}
        {favorite && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase",
              color: C.light, marginBottom: 10 }}>
              Their favorite
            </h2>
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
                      What they said during the game:
                    </div>
                    <p style={{ fontSize: 14, color: C.text, margin: "0 0 12px", lineHeight: 1.6 }}>
                      {favorite.comment}
                    </p>
                  </>
                )}
                {favoriteComment && (
                  <>
                    <div style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>
                      Why it was their favorite:
                    </div>
                    <p style={{ fontSize: 14, color: C.text, margin: 0, lineHeight: 1.6 }}>
                      {favoriteComment}
                    </p>
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ALL COMMENTS — photo + what they wrote, side by side */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase",
            color: C.light, marginBottom: 10 }}>
            Everything they wrote
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {entries.map((e) => (
              <div key={e.id} style={{ display: "flex", gap: 14, alignItems: "flex-start",
                background: e.isFavorite ? C.light + "18" : C.panel,
                border: `1px solid ${e.isFavorite ? C.light : C.panelEdge}`,
                borderRadius: 12, padding: 12 }}>
                {e.publicUrl && (
                  <img src={e.publicUrl} alt=""
                    style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 8,
                      flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {e.description_text && (
                    <p style={{ fontSize: 12, color: C.textDim, fontStyle: "italic",
                      margin: "0 0 6px", lineHeight: 1.4 }}>
                      "{e.description_text}"
                    </p>
                  )}
                  <p style={{ fontSize: 14, color: C.text, margin: 0, lineHeight: 1.5 }}>
                    {e.comment}
                  </p>
                </div>
                {e.isFavorite && (
                  <div style={{ color: C.light, fontSize: 18, flexShrink: 0 }}>★</div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* TEACHER NOTES — read side live; write form lands next slice */}
        <section>
          <h2 style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase",
            color: C.light, marginBottom: 10 }}>
            Your notes to {displayName}
          </h2>
          {teacherComments.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
              {teacherComments.map((t, i) => (
                <div key={i} style={{ background: C.panel, border: `1px solid ${C.panelEdge}`,
                  borderRadius: 12, padding: "12px 14px" }}>
                  {t.round != null && (
                    <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>Round {t.round}</div>
                  )}
                  <p style={{ fontSize: 14, color: C.text, lineHeight: 1.6, margin: 0 }}>{t.body}</p>
                </div>
              ))}
            </div>
          )}
          <div style={{ background: C.panel, border: `1px dashed ${C.panelEdge}`,
            borderRadius: 12, padding: "16px 18px", fontSize: 13, color: C.textDim, lineHeight: 1.6 }}>
            Writing notes back to your students is the next piece we'll build. When it's
            wired, what you write here will appear on {displayName}'s profile under
            "From your teacher" — this is where you'll recruit them into the next round.
          </div>
        </section>
      </div>
    </div>
  );
}
