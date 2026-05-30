// ─────────────────────────────────────────────────────────────────────────
// src/app/teacher/students/page.tsx — the teacher's cohort grid.
//
// Slice 1B-iii. Shows every enrolled student in the teacher's class as a card:
// screen name (falling back to real name), how many photos they commented on,
// whether they've finished their profile, and when they completed round 1.
// Each card links to /teacher/students/[id] for the full journey.
//
// Auth: gated on the teacher being logged in AND owning the class. We read
// the session with the SSR client to get auth.uid(), then use the service
// client for the joins — but every query is scoped to classes this teacher
// owns, so a logged-in non-owner sees nothing.
// ─────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

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

async function getCohort() {
  const supabase = await createClient();
  if (!supabase) return { error: "Server not configured." as const };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "no-session" as const };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { error: "Server not configured." as const };
  const admin = createServiceClient(supabaseUrl, serviceKey);

  // Which classes does this teacher own?
  const { data: classes } = await admin
    .from("classes")
    .select("id")
    .eq("teacher_id", user.id);
  const classIds = (classes || []).map((c) => c.id);
  if (classIds.length === 0) return { error: "not-teacher" as const };

  // Enrollments in those classes, joined to the student rows.
  const { data: enrollments } = await admin
    .from("enrollments")
    .select("student_id, class_id, round, enrolled_at, students(id, name, screen_name, email, photo_url)")
    .in("class_id", classIds)
    .order("enrolled_at", { ascending: false });

  const students = await Promise.all(
    (enrollments || []).map(async (e: any) => {
      const s = e.students;
      // Most recent session → comment count + completion + profile-complete flag
      const { data: session } = await admin
        .from("game_sessions")
        .select("comments, favorite_comment, completed_at")
        .eq("student_id", s.id)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const commentCount = session?.comments ? Object.keys(session.comments).length : 0;
      const profileComplete = !!(s.name && s.screen_name && session?.favorite_comment);

      // Their profile photo (round 2+); null for now since we don't collect it yet.
      let photoUrl: string | null = null;
      if (s.photo_url) {
        try {
          const { data } = await admin.storage.from(MEDIA_BUCKET).createSignedUrl(s.photo_url, 3600);
          photoUrl = data?.signedUrl ?? null;
        } catch {}
      }

      return {
        id: s.id,
        displayName: s.screen_name || s.name || s.email,
        realName: s.name || null,
        commentCount,
        profileComplete,
        completedAt: session?.completed_at || null,
        round: e.round,
        photoUrl,
      };
    })
  );

  return { students };
}

export default async function TeacherStudents() {
  const data = await getCohort();

  if ("error" in data && data.error === "no-session") {
    redirect("/teacher/deck");
  }

  if ("error" in data) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", padding: "4rem 1rem",
        fontFamily: F, color: C.text, textAlign: "center" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>
          {data.error === "not-teacher" ? "No class found" : "Something's off"}
        </h1>
        <p style={{ color: C.textDim }}>
          {data.error === "not-teacher"
            ? "This account doesn't own a class yet."
            : data.error}
        </p>
      </div>
    );
  }

  const { students } = data;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "2rem 1rem 4rem",
      fontFamily: F, color: C.text }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>

      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between",
          marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Your class</h1>
          <Link href="/teacher/deck"
            style={{ fontSize: 13, color: C.textDim, textDecoration: "underline" }}>
            ← Back to deck
          </Link>
        </div>
        <p style={{ fontSize: 14, color: C.textDim, margin: "0 0 28px" }}>
          {students.length} {students.length === 1 ? "student has" : "students have"} joined.
        </p>

        {students.length === 0 ? (
          <div style={{ background: C.panel, border: `1px dashed ${C.panelEdge}`,
            borderRadius: 16, padding: "32px 24px", textAlign: "center",
            color: C.textDim, fontSize: 14, lineHeight: 1.6 }}>
            No students yet. When someone plays the game and joins, they'll appear here.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {students.map((s) => (
              <Link key={s.id} href={`/teacher/students/${s.id}`}
                style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{
                  background: C.panel, border: `1px solid ${C.panelEdge}`,
                  borderRadius: 16, padding: 16, height: "100%",
                  display: "flex", flexDirection: "column", gap: 12,
                  transition: "transform 0.15s ease",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {s.photoUrl ? (
                      <img src={s.photoUrl} alt=""
                        style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover",
                          border: `2px solid ${C.light}` }} />
                    ) : (
                      <div style={{ width: 52, height: 52, borderRadius: "50%",
                        background: C.panelEdge, display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: 22, color: "#fff", flexShrink: 0 }}>
                        {s.displayName[0]?.toUpperCase()}
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, whiteSpace: "nowrap",
                        overflow: "hidden", textOverflow: "ellipsis" }}>
                        {s.displayName}
                      </div>
                      {s.realName && s.realName !== s.displayName && (
                        <div style={{ fontSize: 12, color: C.textFaint, whiteSpace: "nowrap",
                          overflow: "hidden", textOverflow: "ellipsis" }}>
                          {s.realName}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                    <span style={{ background: C.light + "22", color: C.text,
                      borderRadius: 20, padding: "3px 10px" }}>
                      {s.commentCount} comments
                    </span>
                    {!s.profileComplete && (
                      <span style={{ background: "#E2554A22", color: "#A23",
                        borderRadius: 20, padding: "3px 10px" }}>
                        profile not finished
                      </span>
                    )}
                  </div>

                  {s.completedAt && (
                    <div style={{ fontSize: 11, color: C.textFaint, marginTop: "auto" }}>
                      Round {s.round} · {new Date(s.completedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
