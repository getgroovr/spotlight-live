// ─────────────────────────────────────────────────────────────────────────
// src/app/student/dashboard/page.tsx — landing page after student clicks
// their magic link in the enrollment email.
//
// What it shows:
//   • Welcome with the student's name
//   • Their favorite photo (large, hero treatment)
//   • Their 9 comments organized in a 3×3 grid alongside the photos
//   • A "what happens next" panel — round 2 is not built yet so we just
//     explain that the teacher will respond and the student will get
//     another email when round 2 opens.
//
// Auth: the magic link sets a Supabase auth cookie. We read that here via
// the SSR Supabase client. If no session, redirect them to /play.
//
// Data lookup: we have auth.email() from the session — match it to a row
// in `students`, then fetch their enrollment + most recent game_session
// for their photo + comments + favorite.
// ─────────────────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const STARTER_BUCKET = "teacher-deck";
const MEDIA_BUCKET = "media";

export const dynamic = "force-dynamic";

async function getDashboardData() {
  const supabase = await createClient();
  if (!supabase) return { error: "Server not configured." };

  // Who am I? The magic link gave us an auth session.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "no-session" as const };

  // We use the service-role client for reads here because the `students`
  // table's RLS policy gates on `auth.email() = email`. That works in a
  // logged-in Server Component, but to keep behaviour identical across
  // hosts (some SSR contexts have flaky cookie propagation for auth.email()),
  // a service-role read scoped to the user's confirmed email is safer.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { error: "Server not configured." };
  const admin = createServiceClient(supabaseUrl, serviceKey);

  // Find the student record for this email
  const { data: student } = await admin
    .from("students")
    .select("id, name, email, photo_url")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  if (!student) return { error: "not-enrolled" as const };

  // Get their most recent game session (round 1 for now)
  const { data: session } = await admin
    .from("game_sessions")
    .select("comments, favorites, completed_at")
    .eq("student_id", student.id)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Pull all the entries they commented on, so we can show each photo + comment
  const commentIds = session?.comments ? Object.keys(session.comments) : [];
  const favoriteIds = session?.favorites
    ? Object.keys(session.favorites).filter((k) => session.favorites[k])
    : [];
  const favoriteId = favoriteIds[0] || null;

  let entries: Array<{
    id: string; media_url: string | null; description_text: string | null;
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
          media_url: r.media_url,
          description_text: r.description_text,
          publicUrl,
          comment: session?.comments?.[r.id] || "",
          isFavorite: r.id === favoriteId,
        };
      });
    }
  }

  // Student's own profile photo
  let studentPhotoUrl: string | null = null;
  if (student.photo_url) {
    try {
      const { data } = await admin.storage.from(MEDIA_BUCKET).createSignedUrl(student.photo_url, 3600);
      studentPhotoUrl = data?.signedUrl ?? null;
    } catch {}
  }

  return {
    student,
    studentPhotoUrl,
    entries,
    favoriteId,
    completedAt: session?.completed_at || null,
  };
}

export default async function StudentDashboard() {
  const data = await getDashboardData();

  if ("error" in data && data.error === "no-session") {
    redirect("/play");
  }

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

  if ("error" in data) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", padding: "4rem 1rem",
        fontFamily: F, color: C.text, textAlign: "center" }}>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>Something's off</h1>
        <p style={{ color: C.textDim }}>
          {data.error === "not-enrolled"
            ? "We couldn't find your enrollment. Try playing again at /play."
            : data.error}
        </p>
      </div>
    );
  }

  const { student, studentPhotoUrl, entries, favoriteId, completedAt } = data;
  const favorite = entries.find((e) => e.isFavorite);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "2rem 1rem 4rem",
      fontFamily: F, color: C.text }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>

      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* ── HEADER ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
          {studentPhotoUrl ? (
            <img src={studentPhotoUrl} alt=""
              style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover",
                border: `2px solid ${C.light}` }} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: "50%",
              background: C.panelEdge, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 28, color: "#fff" }}>
              {student.name[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 4px" }}>
              Welcome, {student.name}.
            </h1>
            <div style={{ fontSize: 13, color: C.textDim }}>You're in the class.</div>
          </div>
        </div>

        {/* ── FAVORITE ── */}
        {favorite && (
          <section style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase",
              color: C.light, marginBottom: 10 }}>
              Your favorite
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
                <div style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>What you wrote:</div>
                <p style={{ fontSize: 14, color: C.text, margin: 0, lineHeight: 1.6 }}>
                  {favorite.comment}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── ALL COMMENTS ── */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase",
            color: C.light, marginBottom: 10 }}>
            All your comments
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10 }}>
            {entries.map((e) => (
              <div key={e.id} style={{
                background: e.isFavorite ? C.light + "22" : C.panel,
                border: `2px solid ${e.isFavorite ? C.light : C.panelEdge}`,
                borderRadius: 12, padding: 8,
                position: "relative",
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
            Your teacher will read what you wrote and respond. When round 2 is
            ready, you'll get an email with a link to come back, upload your
            own photo, and join the conversation.
          </p>
        </section>

        {completedAt && (
          <div style={{ textAlign: "center", marginTop: 24, fontSize: 11, color: C.textFaint }}>
            Round 1 completed {new Date(completedAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}
