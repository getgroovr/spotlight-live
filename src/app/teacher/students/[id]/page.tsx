// ─────────────────────────────────────────────────────────────────────────
// src/app/teacher/students/[id]/page.tsx — one student's full journey.
//
// Slice 1B-iii + Parked A + Step 7.
//
// Step 7 changes:
//   1. Fetch ALL game_sessions for this student (not just the most recent).
//      Group entries by round. Current round is expanded; past rounds
//      collapse into expandable tiles with "See the round" / "Close the
//      round" toggle text.
//   2. CSV download button in the header. Always visible (not gated on
//      isGameOver). Generates a CSV of all rounds' data client-side via
//      a small client component.
//
// #36 B1 FIX:
//   game_sessions.round is always 1 for all sessions (the play flow
//   records the enrollment round, which is always the warm-up round).
//   This caused every row to display "ROUND 1." Fix: number sessions
//   sequentially by chronological order (1, 2, 3 …). Also filter
//   sessions to the current class and sort by completed_at to ensure
//   correct chronological ordering.
//
// #37 FIXES:
//   1. Rounds now display in ascending order (1, 2, 3) not reversed.
//   2. Student's own submissions (entries) now shown in a dedicated
//      section with status badges. Previously, approved/rejected entries
//      vanished after leaving the pending queue because this page only
//      queried game_sessions (what the student saw during play), not the
//      student's own entries.
//   3. Two-track ID bridge: entries.student_id = profiles.id (auth user
//      id), but this page receives students.id. We resolve via
//      student.email → auth user lookup → profiles.id.
//
// #38 FIXES:
//   1. "Their favorite" section now shows approval status badge
//      (APPROVED / AWAITING APPROVAL / NOT APPROVED).
//   2. Rejection reason displayed in the favorite section when rejected.
//   3. Favorited pic removed from the regular comments list (deduplicated).
//   4. "+ Add a note" available on the favorited entry in the favorite
//      section (previously only in the regular list).
//
// Auth: gated on the teacher owning the class this student is enrolled in.
// ─────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { computeCurrentRound, type ClassTiming } from "@/lib/round-timing";
import { writeTeacherComment } from "./actions";

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
  green: "#2D8659",
  red: "#C0392B",
};
const F = "'Outfit',sans-serif";

type Entry = {
  id: string;
  description_text: string | null;
  publicUrl: string | null;
  comment: string;
  isFavorite: boolean;
  teacherNote: string | null;
};

type RoundData = {
  round: number;
  entries: Entry[];
  favoriteComment: string | null;
  favoriteCommentStatus: string | null;
  favoriteCommentRejectionReason: string | null;
  completedAt: string | null;
  sessionId: string; // unique key for dedup
};

// Student's own submission (entry)
type Submission = {
  id: string;
  roundNumber: number;
  status: string;
  description_text: string;
  rejectionReason: string | null;
  publicUrl: string | null;
  uploadedAt: string;
  teacherNote: string | null;
};

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

  // Fetch class timing for current-round computation
  const { data: classRow } = await admin
    .from("classes")
    .select("total_rounds, game_starts_at, round_duration_hours")
    .eq("id", enrollment.class_id)
    .single();
  const timing: ClassTiming = classRow || {
    total_rounds: null,
    game_starts_at: null,
    round_duration_hours: null,
  };
  const currentRound = computeCurrentRound(timing);

  const { data: student } = await admin
    .from("students")
    .select("id, name, screen_name, email, photo_url")
    .eq("id", studentId)
    .maybeSingle();
  if (!student) return { error: "not-found" as const };

  // ── Resolve profiles.id from student email ────────────────────────────
  // entries.student_id uses profiles.id (auth user id), but this page
  // receives students.id. Bridge: student.email → auth user → profiles.id
  let profilesId: string | null = null;
  if (student.email) {
    const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const authUser = (authList?.users || []).find(
      (u: { email?: string }) => u.email?.toLowerCase() === student.email?.toLowerCase()
    );
    profilesId = authUser?.id ?? null;
  }

  // ── Fetch ALL sessions for this student (Step 7) ──────────────────
  // #36 B1: filter by class_id to avoid cross-class bleed, and sort by
  // completed_at ASC so sessions appear in chronological play order.
  const { data: sessions } = await admin
    .from("game_sessions")
    .select("id, comments, favorites, favorite_comment, favorite_comment_status, favorite_comment_rejection_reason, round, completed_at")
    .eq("student_id", studentId)
    .eq("class_id", enrollment.class_id)
    .order("completed_at", { ascending: true });

  // Collect every entry ID referenced across all sessions so we can
  // batch-fetch them in one query.
  const allEntryIds = new Set<string>();
  for (const s of sessions || []) {
    if (s.comments) for (const id of Object.keys(s.comments)) allEntryIds.add(id);
  }

  // Fetch all referenced entries in one go.
  // #40 FIX: branch on is_starter for bucket selection. Starter (warm-up
  // deck) entries live in teacher-deck (public, getPublicUrl). Student
  // entries live in media (private, createSignedUrl). The old code used
  // STARTER_BUCKET for everything, which broke thumbnails for any student
  // photo a peer commented on.
  const entryMap: Record<string, { id: string; description_text: string | null; publicUrl: string | null }> = {};
  if (allEntryIds.size > 0) {
    const { data: entryRows } = await admin
      .from("entries")
      .select("id, media_url, description_text, is_starter")
      .in("id", Array.from(allEntryIds));
    for (const r of entryRows || []) {
      let publicUrl: string | null = null;
      if (r.media_url) {
        try {
          if (r.is_starter) {
            const { data } = admin.storage.from(STARTER_BUCKET).getPublicUrl(r.media_url);
            publicUrl = data?.publicUrl ?? null;
          } else {
            const { data } = await admin.storage.from(MEDIA_BUCKET).createSignedUrl(r.media_url, 3600);
            publicUrl = data?.signedUrl ?? null;
          }
        } catch {}
      }
      entryMap[r.id] = { id: r.id, description_text: r.description_text, publicUrl };
    }
  }

  // Fetch teacher comments (all rounds)
  const { data: teacherComments } = await admin
    .from("teacher_comments")
    .select("id, entry_id, body, round, created_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: true });

  const noteByEntry: Record<string, string> = {};
  const generalNotes: Array<{ body: string; round: number | null }> = [];
  for (const t of teacherComments || []) {
    if (t.entry_id) noteByEntry[t.entry_id] = t.body;
    else generalNotes.push({ body: t.body, round: t.round });
  }

  // Build per-round data.
  // #36 B1: game_sessions.round is unreliable (always 1 for warm-up
  // round sessions). Number sessions sequentially by chronological
  // order (sorted by completed_at above). Use session.id as key to
  // avoid duplicate-key errors when multiple sessions share round=1.
  const rounds: RoundData[] = [];
  const sessionList = sessions || [];
  for (let i = 0; i < sessionList.length; i++) {
    const s = sessionList[i];
    const commentIds = s.comments ? Object.keys(s.comments) : [];
    const favoriteIds = s.favorites
      ? Object.keys(s.favorites).filter((k) => s.favorites[k])
      : [];
    const favoriteId = favoriteIds[0] || null;

    const entries: Entry[] = commentIds
      .map((eid) => {
        const e = entryMap[eid];
        if (!e) return null;
        return {
          id: e.id,
          description_text: e.description_text,
          publicUrl: e.publicUrl,
          comment: s.comments?.[eid] || "",
          isFavorite: eid === favoriteId,
          teacherNote: noteByEntry[eid] ?? null,
        };
      })
      .filter((x): x is Entry => x !== null);

    rounds.push({
      round: i + 1,  // #36 B1: sequential numbering (1, 2, 3 …)
      entries,
      favoriteComment: s.favorite_comment || null,
      favoriteCommentStatus: s.favorite_comment_status || null,
      favoriteCommentRejectionReason: s.favorite_comment_rejection_reason || null,
      completedAt: s.completed_at || null,
      sessionId: s.id,
    });
  }

  // ── Fetch student's own submissions (entries) ─────────────────────────
  // #37: query entries table directly so approved/rejected/pending entries
  // show on the teacher's student detail page.
  const submissions: Submission[] = [];
  if (profilesId) {
    const { data: ownEntries } = await admin
      .from("entries")
      .select("id, media_url, description_text, status, round_number, rejection_reason, uploaded_at")
      .eq("student_id", profilesId)
      .eq("class_id", enrollment.class_id)
      .eq("is_starter", false)
      .order("round_number", { ascending: true })
      .order("uploaded_at", { ascending: false });

    for (const e of ownEntries || []) {
      let publicUrl: string | null = null;
      if (e.media_url) {
        try {
          const { data } = await admin.storage.from(MEDIA_BUCKET).createSignedUrl(e.media_url, 3600);
          publicUrl = data?.signedUrl ?? null;
        } catch {}
      }
      submissions.push({
        id: e.id,
        roundNumber: e.round_number,
        status: e.status,
        description_text: e.description_text || "",
        rejectionReason: e.rejection_reason,
        publicUrl,
        uploadedAt: e.uploaded_at,
        teacherNote: noteByEntry[e.id] ?? null,
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

  return {
    student,
    studentPhotoUrl,
    rounds,
    submissions,
    currentRound,
    classId: enrollment.class_id as string,
    generalNotes,
    totalRounds: timing.total_rounds,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────

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

  const { student, studentPhotoUrl, rounds, submissions, currentRound, classId, generalNotes, totalRounds } = data;
  const displayName = student.screen_name || student.name || student.email;

  // Shared styles for the per-photo note form bits.
  const taStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", fontFamily: F, fontSize: 13,
    color: C.text, padding: 8, borderRadius: 8, border: `1px solid ${C.panelEdge}`,
    background: "#fff", resize: "vertical",
  };
  const saveBtnStyle: React.CSSProperties = {
    marginTop: 6, background: C.light, color: "#fff", border: "none",
    borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600,
    cursor: "pointer", fontFamily: F,
  };

  // Status badge renderer
  const statusBadge = (status: string) => {
    const styles: Record<string, { bg: string; fg: string; label: string }> = {
      live:     { bg: C.green + "20", fg: C.green,  label: "APPROVED" },
      pending:  { bg: C.light + "20", fg: C.light,  label: "AWAITING APPROVAL" },
      rejected: { bg: C.red + "20",   fg: C.red,    label: "NOT APPROVED" },
      archived: { bg: C.textFaint + "20", fg: C.textFaint, label: "ARCHIVED" },
    };
    const s = styles[status] || styles.pending;
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
        background: s.bg, color: s.fg, padding: "2px 8px", borderRadius: 4,
      }}>
        {s.label}
      </span>
    );
  };

  // The per-photo note UI (read + author), reused for each entry.
  const noteBlock = (e: Entry, roundNum: number) =>
    e.teacherNote ? (
      <div style={{ marginTop: 10, background: C.light + "14",
        border: `1px solid ${C.light}55`, borderLeft: `3px solid ${C.light}`,
        borderRadius: 8, padding: "8px 10px" }}>
        <div style={{ fontSize: 11, color: C.light, fontWeight: 600, marginBottom: 3 }}>
          Your note
        </div>
        <p style={{ fontSize: 13, color: C.text, margin: 0, lineHeight: 1.5 }}>{e.teacherNote}</p>
        <details style={{ marginTop: 6 }}>
          <summary style={{ fontSize: 12, color: C.textDim, cursor: "pointer" }}>Edit</summary>
          <form action={writeTeacherComment} style={{ marginTop: 8 }}>
            <input type="hidden" name="studentId" value={student.id} />
            <input type="hidden" name="classId" value={classId} />
            <input type="hidden" name="entryId" value={e.id} />
            <input type="hidden" name="round" value={String(roundNum)} />
            <textarea name="body" defaultValue={e.teacherNote} rows={2} style={taStyle} />
            <button type="submit" style={saveBtnStyle}>Save</button>
          </form>
        </details>
      </div>
    ) : (
      <details style={{ marginTop: 8 }}>
        <summary style={{ fontSize: 12, color: C.light, cursor: "pointer", fontWeight: 600 }}>
          + Add a note
        </summary>
        <form action={writeTeacherComment} style={{ marginTop: 8 }}>
          <input type="hidden" name="studentId" value={student.id} />
          <input type="hidden" name="classId" value={classId} />
          <input type="hidden" name="entryId" value={e.id} />
          <input type="hidden" name="round" value={String(roundNum)} />
          <textarea name="body" rows={2}
            placeholder={`Write a note to ${displayName} about this photo…`}
            style={taStyle} />
          <button type="submit" style={saveBtnStyle}>Save note</button>
        </form>
      </details>
    );

  // Render a single round's content block (entries + favorite highlight).
  // #38: favorite section now shows approval status badge, rejection reason,
  //      and noteBlock. Favorited entry is excluded from the "all entries"
  //      list below to avoid duplication.
  const renderRoundContent = (rd: RoundData) => {
    const favorite = rd.entries.find((e) => e.isFavorite) || null;
    // #38: exclude the favorited entry from the regular list
    const nonFavoriteEntries = rd.entries.filter((e) => !e.isFavorite);

    // #38: map favorite_comment_status to a display badge
    const favBadge = (status: string | null) => {
      if (!status) return null;
      const map: Record<string, { bg: string; fg: string; label: string }> = {
        approved: { bg: C.green + "20", fg: C.green, label: "APPROVED" },
        pending:  { bg: C.light + "20", fg: C.light, label: "AWAITING APPROVAL" },
        rejected: { bg: C.red + "20",   fg: C.red,   label: "NOT APPROVED" },
      };
      const s = map[status];
      if (!s) return null;
      return (
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
          background: s.bg, color: s.fg, padding: "2px 8px", borderRadius: 4,
          marginLeft: 8, verticalAlign: "middle",
        }}>
          {s.label}
        </span>
      );
    };

    return (
      <>
        {/* Favorite highlight for this round */}
        {favorite && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10,
              background: C.panel, border: `1px solid ${C.panelEdge}`,
              borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase",
                color: C.light, fontWeight: 600 }}>
                Their favorite
                {favBadge(rd.favoriteCommentStatus)}
              </div>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              {favorite.publicUrl && (
                <img src={favorite.publicUrl} alt=""
                  style={{ width: 160, height: 160, objectFit: "cover", borderRadius: 10,
                    border: `2px solid ${C.light}`, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1 }}>
                {favorite.description_text && (
                  <p style={{ fontSize: 13, color: C.text, fontStyle: "italic",
                    margin: "0 0 10px", lineHeight: 1.5,
                    borderLeft: `2px solid ${C.light}`, paddingLeft: 10 }}>
                    &ldquo;{favorite.description_text}&rdquo;
                  </p>
                )}
                {favorite.comment && (
                  <>
                    <div style={{ fontSize: 11, color: C.textDim, marginBottom: 3 }}>
                      What they said during the game:
                    </div>
                    <p style={{ fontSize: 13, color: C.text, margin: "0 0 10px", lineHeight: 1.5 }}>
                      {favorite.comment}
                    </p>
                  </>
                )}
                {/* #40: "Why it was their favorite" only on the warm-up round (round 1).
                   Students write a why-note only during enrollment, not student rounds. */}
                {rd.favoriteComment && rd.round === 1 && (
                  <>
                    <div style={{ fontSize: 11, color: C.textDim, marginBottom: 3 }}>
                      Why it was their favorite:
                    </div>
                    <p style={{ fontSize: 13, color: C.text, margin: 0, lineHeight: 1.5 }}>
                      {rd.favoriteComment}
                    </p>
                  </>
                )}
                {/* #38: Show rejection reason when favorite comment was rejected */}
                {rd.favoriteCommentStatus === "rejected" && rd.favoriteCommentRejectionReason && (
                  <div style={{ marginTop: 10, background: C.red + "10",
                    border: `1px solid ${C.red}33`, borderLeft: `3px solid ${C.red}`,
                    borderRadius: 6, padding: "6px 10px" }}>
                    <div style={{ fontSize: 10, color: C.red, fontWeight: 700, marginBottom: 2 }}>
                      REJECTION REASON
                    </div>
                    <p style={{ fontSize: 12, color: C.text, margin: 0, lineHeight: 1.4 }}>
                      {rd.favoriteCommentRejectionReason}
                    </p>
                  </div>
                )}
                {/* #38: Add noteBlock to the favorite entry so teacher can add a note */}
                {noteBlock(favorite, rd.round)}
              </div>
            </div>
            </div>
          </div>
        )}

        {/* All entries for this round (excluding the favorite, shown above) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {nonFavoriteEntries.map((e) => (
            <div key={`${rd.sessionId}-${e.id}`} style={{ display: "flex", gap: 12, alignItems: "flex-start",
              background: C.panel,
              border: `1px solid ${C.panelEdge}`,
              borderRadius: 10, padding: 10 }}>
              {e.publicUrl && (
                <img src={e.publicUrl} alt=""
                  style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8,
                    flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                {e.description_text && (
                  <p style={{ fontSize: 12, color: C.textDim, fontStyle: "italic",
                    margin: "0 0 5px", lineHeight: 1.4 }}>
                    &ldquo;{e.description_text}&rdquo;
                  </p>
                )}
                <p style={{ fontSize: 13, color: C.text, margin: 0, lineHeight: 1.5 }}>
                  {e.comment}
                </p>
                {noteBlock(e, rd.round)}
              </div>
            </div>
          ))}
        </div>

        {rd.completedAt && (
          <div style={{ fontSize: 11, color: C.textFaint, marginTop: 8, textAlign: "right" }}>
            Completed {new Date(rd.completedAt).toLocaleDateString()}
          </div>
        )}
      </>
    );
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "2rem 1rem 4rem",
      fontFamily: F, color: C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
        .round-toggle .when-open { display: none; }
        .round-toggle[open] .when-closed { display: none; }
        .round-toggle[open] .when-open { display: inline; }
        .round-toggle summary { list-style: none; }
        .round-toggle summary::-webkit-details-marker { display: none; }
      `}</style>

      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link href={`/teacher/students?class=${classId}`}
          style={{ fontSize: 13, color: C.textDim, textDecoration: "underline" }}>
          ← Back to class
        </Link>

        {/* HEADER — with CSV download button (Step 7) */}
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
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 2px" }}>{displayName}</h1>
            <div style={{ fontSize: 13, color: C.textDim }}>
              {student.name && student.name !== displayName ? `${student.name} · ` : ""}
              {student.email}
            </div>
            <div style={{ fontSize: 12, color: C.textFaint, marginTop: 2 }}>
              {rounds.length <= 1
                ? (rounds.length === 1 ? "Warm-up played" : "No rounds played")
                : `${rounds.length - 1} ${rounds.length - 1 === 1 ? "round" : "rounds"} played`}
              {totalRounds ? ` of ${totalRounds}` : ""}
            </div>
          </div>
        </div>

        {/* ── SUBMISSIONS — student's own entries ────────────────────── */}
        {submissions.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase",
              color: C.light, marginBottom: 12 }}>
              Submissions
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {submissions.map((sub) => (
                <div key={sub.id} style={{
                  display: "flex", gap: 12, alignItems: "flex-start",
                  background: sub.status === "rejected" ? C.red + "08" : C.panel,
                  border: `1px solid ${sub.status === "rejected" ? C.red + "44" : C.panelEdge}`,
                  borderRadius: 10, padding: 12,
                }}>
                  {sub.publicUrl ? (
                    <img src={sub.publicUrl} alt=""
                      style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8,
                        flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 72, height: 72, borderRadius: 8, flexShrink: 0,
                      background: C.panelEdge + "44", display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: 10, color: C.textFaint }}>
                      no pic
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                        Round {sub.roundNumber}
                      </span>
                      {statusBadge(sub.status)}
                    </div>
                    {sub.description_text && (
                      <p style={{ fontSize: 12, color: C.textDim, fontStyle: "italic",
                        margin: "0 0 4px", lineHeight: 1.4 }}>
                        &ldquo;{sub.description_text}&rdquo;
                      </p>
                    )}
                    {sub.status === "rejected" && (sub.teacherNote || sub.rejectionReason) && (
                      <div style={{ marginTop: 6, background: C.red + "10",
                        border: `1px solid ${C.red}33`, borderLeft: `3px solid ${C.red}`,
                        borderRadius: 6, padding: "6px 10px" }}>
                        <div style={{ fontSize: 10, color: C.red, fontWeight: 700, marginBottom: 2 }}>
                          REJECTION REASON
                        </div>
                        <p style={{ fontSize: 12, color: C.text, margin: 0, lineHeight: 1.4 }}>
                          {sub.teacherNote || sub.rejectionReason}
                        </p>
                      </div>
                    )}
                    {sub.status !== "rejected" && sub.teacherNote && (
                      <div style={{ marginTop: 6, background: C.light + "14",
                        border: `1px solid ${C.light}55`, borderLeft: `3px solid ${C.light}`,
                        borderRadius: 6, padding: "6px 10px" }}>
                        <div style={{ fontSize: 10, color: C.light, fontWeight: 700, marginBottom: 2 }}>
                          YOUR NOTE
                        </div>
                        <p style={{ fontSize: 12, color: C.text, margin: 0, lineHeight: 1.4 }}>
                          {sub.teacherNote}
                        </p>
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: C.textFaint, marginTop: 4 }}>
                      Submitted {new Date(sub.uploadedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── ROUNDS PLAYED ──────────────────────────────────────────── */}
        {rounds.length === 0 ? (
          <div style={{ background: C.panel, border: `1px solid ${C.panelEdge}`,
            borderRadius: 12, padding: "20px 16px", textAlign: "center" }}>
            <p style={{ fontSize: 14, color: C.textDim, margin: 0 }}>
              {displayName} hasn&apos;t played any rounds yet.
            </p>
          </div>
        ) : (
          <>
            {submissions.length > 0 && (
              <h2 style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase",
                color: C.light, marginBottom: 12 }}>
                Rounds played
              </h2>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* #40: Warm-up vs Student Round naming.
                  rd.round is sequential (1 = warm-up session, 2 = student round 1, etc.)
                  currentRound from computeCurrentRound = the active STUDENT round (1, 2, 3).
                  Mapping: student round N lives at rd.round = N + 1.
                  Sort: live student round first → completed student rounds asc → warm-up last. */}
              {[...rounds].sort((a, b) => {
                const aIsWarmup = a.round === 1;
                const bIsWarmup = b.round === 1;
                const aIsCurrent = !aIsWarmup && (a.round - 1) === currentRound;
                const bIsCurrent = !bIsWarmup && (b.round - 1) === currentRound;
                // Live round first
                if (aIsCurrent !== bIsCurrent) return aIsCurrent ? -1 : 1;
                // Warm-up last
                if (aIsWarmup !== bIsWarmup) return aIsWarmup ? 1 : -1;
                // Otherwise ascending
                return a.round - b.round;
              }).map((rd) => {
                const isWarmup = rd.round === 1;
                const studentRoundNum = rd.round - 1;
                const isCurrent = !isWarmup && studentRoundNum === currentRound;
                // Fallback: if no round matches currentRound, expand the most recent
                const anyLiveMatch = rounds.some(r => r.round > 1 && (r.round - 1) === currentRound);
                const isExpanded = isCurrent || (!anyLiveMatch && rd === rounds[rounds.length - 1]);
                const displayLabel = isWarmup ? "Warm-up Round" : `Round ${studentRoundNum}`;

                if (isExpanded) {
                  return (
                    <section key={rd.sessionId}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        {isCurrent && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
                            background: C.green + "20", color: C.green,
                            padding: "3px 10px", borderRadius: 4,
                          }}>
                            LIVE ROUND
                          </span>
                        )}
                        <h2 style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase",
                          color: C.light, margin: 0 }}>
                          {displayLabel}
                        </h2>
                      </div>
                      {renderRoundContent(rd)}
                    </section>
                  );
                }

                return (
                  <details key={rd.sessionId} className="round-toggle"
                    style={{ background: C.panel,
                      border: `1px solid ${C.panelEdge}`, borderRadius: 12 }}>
                    <summary style={{
                      padding: "12px 16px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 10,
                    }}>
                      <span style={{ fontSize: 11, color: C.light, fontWeight: 700,
                        letterSpacing: 1, textTransform: "uppercase" }}>
                        {displayLabel}
                      </span>
                      <span style={{ fontSize: 12, color: C.textDim, fontWeight: 400 }}>
                        {rd.entries.length} {rd.entries.length === 1 ? "photo" : "photos"}
                        {rd.completedAt
                          ? ` · ${new Date(rd.completedAt).toLocaleDateString()}`
                          : ""}
                      </span>
                      <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600,
                        color: C.light, background: C.light + "18",
                        border: `1px solid ${C.light}44`, borderRadius: 6,
                        padding: "3px 10px" }}>
                        <span className="when-closed">See the round</span>
                        <span className="when-open">Close the round</span>
                      </span>
                    </summary>
                    <div style={{ padding: "0 16px 16px" }}>
                      {renderRoundContent(rd)}
                    </div>
                  </details>
                );
              })}
            </div>
          </>
        )}

        {/* GENERAL NOTES — only shows if any non-photo notes exist */}
        {generalNotes.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase",
              color: C.light, marginBottom: 10 }}>
              General notes
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {generalNotes.map((t, i) => (
                <div key={i} style={{ background: C.panel, border: `1px solid ${C.panelEdge}`,
                  borderRadius: 12, padding: "12px 14px" }}>
                  {t.round != null && (
                    <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>Round {t.round}</div>
                  )}
                  <p style={{ fontSize: 14, color: C.text, lineHeight: 1.6, margin: 0 }}>{t.body}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
