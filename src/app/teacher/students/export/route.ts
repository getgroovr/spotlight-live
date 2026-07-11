// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/export/route.ts   (REPLACES existing)
//
// Comprehensive class spreadsheet — ALL language produced in the class.
//
// Session 79 overhaul. Brings the teacher spreadsheet up to parity with
// the student spreadsheet (session 73 enrichment), plus adds topics.
//
// Structure:
//
//   === TEACHER'S WARM-UP PHOTOS — ClassName ===
//   Photo Description
//   (one row per starter photo belonging to this class's teacher)
//
//   === STUDENT: ScreenName (RealName, email) — ClassName ===
//
//   --- PHOTO SUBMISSIONS ---
//   Round | Photo Description | Status | Teacher Note
//   (one row per student entry, student rounds only)
//
//   --- GAME COMMENTS ---
//   Round | Photo Description | Student's Comment | Favorite? | Favorite Comment
//   (one row per photo commented on, all rounds including warm-up)
//   (favorite comment status + rejection reason appended when relevant)
//
//   (blank divider between students)
//
// Topics:
//   Round headers include topic when set: "Round 1 — Nature"
//   Reads from classes.round_topics jsonb (keyed by student round number).
//
// Seed voters (@test.local) excluded.
//
// Round numbering:
//   DB game_sessions.round 1 = warm-up → "Warm-up Round"
//   DB game_sessions.round N (N>1) = student round N−1 → "Round N−1"
//
// Two-track ID handling:
//   game_sessions.student_id = students.id
//   entries.student_id = profiles.id (= auth.users.id)
//   Bridge: student.email → auth user → profiles.id
//
// CSV-per-class scoping:
//   ?class=<id> scopes to one class. Otherwise all teacher's classes.
//
// Auth: SSR client for auth.uid(), service client for the joins.
// ─────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// RFC-4180 quoting: wrap in quotes if the cell holds a comma, quote, or newline;
// double up any embedded quotes.
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return new NextResponse("Server not configured.", { status: 500 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Not signed in.", { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return new NextResponse("Server not configured.", { status: 500 });
  }
  const admin = createServiceClient(supabaseUrl, serviceKey);

  // ── Class scoping ─────────────────────────────────────────────────────
  const requestedClassId = request.nextUrl.searchParams.get("class");

  let classIds: string[];
  let classNameById: Map<string, string>;
  let roundTopicsByClass: Map<string, Record<string, string | null>>;
  let filenameSuffix: string;

  if (requestedClassId) {
    const { data: cls } = await admin
      .from("classes")
      .select("id, name, round_topics")
      .eq("id", requestedClassId)
      .eq("teacher_id", user.id)
      .maybeSingle();
    if (!cls) {
      return new NextResponse("Class not found or not owned by you.", { status: 404 });
    }
    classIds = [cls.id];
    classNameById = new Map([[cls.id, cls.name]]);
    roundTopicsByClass = new Map([[cls.id, cls.round_topics || {}]]);
    const safeName = cls.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
    filenameSuffix = safeName;
  } else {
    const { data: classes } = await admin
      .from("classes")
      .select("id, name, round_topics")
      .eq("teacher_id", user.id);
    classIds = (classes || []).map((c) => c.id);
    if (classIds.length === 0) {
      return new NextResponse("No class found for this account.", { status: 404 });
    }
    classNameById = new Map(
      (classes || []).map((c) => [c.id, c.name])
    );
    roundTopicsByClass = new Map(
      (classes || []).map((c) => [c.id, c.round_topics || {}])
    );
    filenameSuffix = "all-classes";
  }

  // ── Helper: build display string for a round, with topic if set ───────
  function displayRound(dbRound: number, classId: string): string {
    if (dbRound === 1) return "Warm-up Round";
    const studentRound = dbRound - 1;
    const topics = roundTopicsByClass.get(classId) || {};
    const topic = topics[String(studentRound)];
    return topic ? `Round ${studentRound} — ${topic}` : `Round ${studentRound}`;
  }

  // ── Enrollments — student list per class ──────────────────────────────
  const { data: enrollments } = await admin
    .from("enrollments")
    .select("student_id, class_id, students(id, name, screen_name, email)")
    .in("class_id", classIds)
    .order("enrolled_at", { ascending: true });

  type StudentInfo = {
    id: string;
    name: string | null;
    screen_name: string | null;
    email: string | null;
  };
  type StudentClass = { student: StudentInfo; classId: string };

  const seen = new Set<string>();
  const studentClasses: StudentClass[] = [];

  for (const e of enrollments || []) {
    const s = e.students as unknown as StudentInfo | null;
    if (!s) continue;
    if (s.email && s.email.endsWith("@test.local")) continue;
    const key = `${s.id}:${e.class_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    studentClasses.push({ student: s, classId: e.class_id });
  }

  // ── Resolve profiles.id for each student (two-track ID bridge) ────────
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const authByEmail = new Map<string, string>();
  for (const u of authList?.users || []) {
    if (u.email) authByEmail.set(u.email.toLowerCase(), u.id);
  }

  // ── Fetch ALL game_sessions — now with favorites + favorite comments ──
  const studentIds = [...new Set(studentClasses.map((sc) => sc.student.id))];

  const { data: allSessions } = await admin
    .from("game_sessions")
    .select(
      "student_id, class_id, round, comments, favorites, " +
      "favorite_comment, favorite_comment_status, " +
      "favorite_comment_rejection_reason, completed_at"
    )
    .in("student_id", studentIds)
    .in("class_id", classIds)
    .order("round", { ascending: true });

  type SessionRow = {
    student_id: string;
    class_id: string;
    round: number;
    comments: Record<string, string> | null;
    favorites: string | string[] | null;
    favorite_comment: string | null;
    favorite_comment_status: string | null;
    favorite_comment_rejection_reason: string | null;
    completed_at: string | null;
  };
  const sessionsByKey = new Map<string, SessionRow[]>();
  for (const s of (allSessions || []) as SessionRow[]) {
    const key = `${s.student_id}:${s.class_id}`;
    const arr = sessionsByKey.get(key) || [];
    arr.push(s);
    sessionsByKey.set(key, arr);
  }

  // ── Collect all entry IDs referenced in comments for caption lookup ────
  const allEntryIds = new Set<string>();
  for (const s of (allSessions || []) as SessionRow[]) {
    if (s.comments) {
      for (const id of Object.keys(s.comments)) allEntryIds.add(id);
    }
  }

  const captionById = new Map<string, string>();
  if (allEntryIds.size > 0) {
    const { data: capRows } = await admin
      .from("entries")
      .select("id, description_text")
      .in("id", Array.from(allEntryIds));
    for (const r of capRows || []) {
      captionById.set(r.id, r.description_text || "");
    }
  }

  // ── Fetch own entries with status + rejection_reason ──────────────────
  type OwnEntry = {
    description: string;
    status: string;
    rejectionReason: string;
  };
  const ownEntryByKey = new Map<string, OwnEntry>();
  const profilesIds = studentClasses
    .map((sc) => {
      if (!sc.student.email) return null;
      return authByEmail.get(sc.student.email.toLowerCase()) ?? null;
    })
    .filter((id): id is string => id !== null);

  if (profilesIds.length > 0) {
    const { data: ownRows } = await admin
      .from("entries")
      .select("student_id, class_id, round_number, description_text, status, rejection_reason")
      .in("student_id", [...new Set(profilesIds)])
      .in("class_id", classIds)
      .eq("is_starter", false)
      .order("uploaded_at", { ascending: false });
    for (const r of ownRows || []) {
      const key = `${r.student_id}:${r.class_id}:${r.round_number}`;
      if (!ownEntryByKey.has(key)) {
        ownEntryByKey.set(key, {
          description: r.description_text || "",
          status: r.status || "",
          rejectionReason: r.rejection_reason || "",
        });
      }
    }
  }

  // ── Fetch teacher's starter entries (warm-up photos) per class ────────
  const startersByClass = new Map<string, string[]>();
  if (classIds.length > 0) {
    const { data: starters } = await admin
      .from("entries")
      .select("class_id, description_text")
      .in("class_id", classIds)
      .eq("is_starter", true)
      .order("uploaded_at", { ascending: true });
    for (const s of starters || []) {
      const arr = startersByClass.get(s.class_id) || [];
      arr.push(s.description_text || "");
      startersByClass.set(s.class_id, arr);
    }
  }

  // ── Helper: check if an entry ID is in this session's favorites ────────
  function isFavorite(sess: SessionRow, entryId: string): boolean {
    if (!sess.favorites) return false;
    if (Array.isArray(sess.favorites)) return sess.favorites.includes(entryId);
    return sess.favorites === entryId;
  }

  // ── Build CSV rows ────────────────────────────────────────────────────
  // 5 columns used across sections.
  const COL_COUNT = 5;
  const blank: string[] = Array(COL_COUNT).fill("");
  const rows: string[][] = [];

  // Group studentClasses by classId so we can output class-by-class
  const classBuckets = new Map<string, StudentClass[]>();
  for (const sc of studentClasses) {
    const arr = classBuckets.get(sc.classId) || [];
    arr.push(sc);
    classBuckets.set(sc.classId, arr);
  }

  let firstClass = true;
  for (const classId of classIds) {
    const className = classNameById.get(classId) || "";
    const studentsInClass = classBuckets.get(classId) || [];

    if (!firstClass) {
      rows.push(blank);
      rows.push(blank);
    }
    firstClass = false;

    // ── Teacher's warm-up photos ──────────────────────────────────────
    const starters = startersByClass.get(classId) || [];
    if (starters.length > 0) {
      rows.push([`=== TEACHER'S WARM-UP PHOTOS — ${className} ===`, "", "", "", ""]);
      rows.push(["Photo Description", "", "", "", ""]);
      for (const desc of starters) {
        rows.push([desc, "", "", "", ""]);
      }
      rows.push(blank);
    }

    // ── Per student ──────────────────────────────────────────────────
    for (let si = 0; si < studentsInClass.length; si++) {
      const { student } = studentsInClass[si];
      const displayName = student.screen_name || student.name || student.email || "Unknown";

      const profilesId = student.email
        ? authByEmail.get(student.email.toLowerCase()) ?? null
        : null;

      // Student header
      rows.push([
        `=== STUDENT: ${displayName} (${student.name || ""}, ${student.email || ""}) — ${className} ===`,
        "", "", "", "",
      ]);

      const sessKey = `${student.id}:${classId}`;
      const sessions = sessionsByKey.get(sessKey) || [];

      if (sessions.length === 0) {
        rows.push(["(no rounds played)", "", "", "", ""]);
      } else {
        // ── Section 1: Photo submissions (student rounds only) ──────
        const studentSessions = sessions.filter((s) => s.round > 1);
        if (studentSessions.length > 0) {
          rows.push(["--- PHOTO SUBMISSIONS ---", "", "", "", ""]);
          rows.push(["Round", "Photo Description", "Status", "Teacher Note", ""]);
          for (const sess of studentSessions) {
            const roundLabel = displayRound(sess.round, classId);
            const studentRoundNum = sess.round - 1;
            if (profilesId) {
              const ownKey = `${profilesId}:${classId}:${studentRoundNum}`;
              const own = ownEntryByKey.get(ownKey);
              if (own) {
                rows.push([roundLabel, own.description, own.status, own.rejectionReason, ""]);
              } else {
                rows.push([roundLabel, "(no photo submitted)", "", "", ""]);
              }
            } else {
              rows.push([roundLabel, "(profile not linked)", "", "", ""]);
            }
          }
        }

        // ── Section 2: Game comments (all rounds) ───────────────────
        const sessionsWithComments = sessions.filter(
          (s) => s.comments && Object.keys(s.comments).length > 0
        );
        if (sessionsWithComments.length > 0) {
          rows.push(["--- GAME COMMENTS ---", "", "", "", ""]);
          rows.push(["Round", "Photo Description", "Student's Comment", "Favorite?", "Favorite Comment"]);
          for (const sess of sessionsWithComments) {
            const roundLabel = displayRound(sess.round, classId);
            const comments = sess.comments || {};
            for (const [entryId, commentText] of Object.entries(comments)) {
              const photoDesc = captionById.get(entryId) || "";
              const fav = isFavorite(sess, entryId);
              rows.push([
                roundLabel,
                photoDesc,
                commentText,
                fav ? "yes" : "",
                fav ? (sess.favorite_comment || "") : "",
              ]);
            }
          }

          // Show favorite comment status if any were submitted
          const sessionsWithFavComment = sessions.filter((s) => s.favorite_comment);
          for (const sess of sessionsWithFavComment) {
            const roundLabel = displayRound(sess.round, classId);
            const status = sess.favorite_comment_status || "";
            const reason = sess.favorite_comment_rejection_reason || "";
            if (status && status !== "approved") {
              rows.push([
                roundLabel,
                `Favorite comment status: ${status}`,
                reason ? `Reason: ${reason}` : "",
                "", "",
              ]);
            }
          }
        }
      }

      // Divider between students
      if (si < studentsInClass.length - 1) {
        rows.push(blank);
      }
    }
  }

  // \uFEFF = UTF-8 BOM so Excel reads accented characters correctly.
  const csv = "\uFEFF" + rows
    .map((r) => r.map(csvCell).join(","))
    .join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="spotlight-${filenameSuffix}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
