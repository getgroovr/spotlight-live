// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/export/route.ts   (REPLACES existing)
//
// Comprehensive teacher spreadsheet export for language assessment.
//
// Layout:
//   === TEACHER'S WARM-UP PHOTOS ===
//   Photo Description
//   (one row per starter photo)
//
//   === STUDENT: DisplayName (RealName, email) — ClassName ===
//
//   -- Warm-up Round --
//   Photo Description | Student Comment | ★ Favorite | Favorite Comment
//   (one row per commented-on photo)
//
//   -- Round 1 --
//   [Own photo]  Description | Status | Teacher Note | (blank)
//   Photo Description | Student Comment | ★ Favorite | Favorite Comment
//
//   -- Round 2 --
//   (same pattern)
//
//   (blank divider rows between students)
//
// Four columns throughout:
//   A: Photo Description (or label)
//   B: Student Comment (or status)
//   C: Is Favorite / Teacher Note
//   D: Favorite Comment
//
// Seed voters (emails ending @test.local) excluded.
//
// Round numbering:
//   DB game_sessions.round 1 → "Warm-up Round"
//   DB game_sessions.round N (N>1) → "Round N−1"
//
// Two-track ID handling:
//   game_sessions.student_id = students.id
//   entries.student_id = profiles.id (= auth.users.id)
//   Bridge: students.email → auth user → profiles.id
//
// Auth: SSR client for auth.uid(), service client for joins.
// ─────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const COL_COUNT = 4;

// RFC-4180 quoting
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function blankRow(): string[] {
  return Array(COL_COUNT).fill("");
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return new NextResponse("Server not configured.", { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  let filenameSuffix: string;

  if (requestedClassId) {
    const { data: cls } = await admin
      .from("classes")
      .select("id, name")
      .eq("id", requestedClassId)
      .eq("teacher_id", user.id)
      .maybeSingle();
    if (!cls) {
      return new NextResponse("Class not found or not owned by you.", {
        status: 404,
      });
    }
    classIds = [cls.id];
    classNameById = new Map([[cls.id, cls.name]]);
    const safeName = cls.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
    filenameSuffix = safeName;
  } else {
    const { data: classes } = await admin
      .from("classes")
      .select("id, name")
      .eq("teacher_id", user.id);
    classIds = (classes || []).map((c) => c.id);
    if (classIds.length === 0) {
      return new NextResponse("No class found for this account.", {
        status: 404,
      });
    }
    classNameById = new Map(
      (classes || []).map((c) => [c.id, c.name])
    );
    filenameSuffix = "all-classes";
  }

  // ── Teacher's warm-up deck photos ─────────────────────────────────────
  // Starter entries owned by this teacher (uploaded to their classes).
  // entries.student_id = profiles.id = auth.users.id for starters too.
  const { data: starterRows } = await admin
    .from("entries")
    .select("id, description_text")
    .eq("student_id", user.id)
    .eq("is_starter", true)
    .order("uploaded_at", { ascending: true });

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
  const { data: authList } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });
  const authByEmail = new Map<string, string>();
  for (const u of authList?.users || []) {
    if (u.email) authByEmail.set(u.email.toLowerCase(), u.id);
  }

  // ── Fetch ALL game_sessions with favorites + favorite_comment ─────────
  const studentIds = [...new Set(studentClasses.map((sc) => sc.student.id))];

  const { data: allSessions } = await admin
    .from("game_sessions")
    .select(
      "student_id, class_id, round, comments, favorites, favorite_comment, favorite_comment_status, completed_at"
    )
    .in("student_id", studentIds)
    .in("class_id", classIds)
    .order("round", { ascending: true });

  type SessionRow = {
    student_id: string;
    class_id: string;
    round: number;
    comments: Record<string, string> | null;
    favorites: Record<string, boolean> | null;
    favorite_comment: string | null;
    favorite_comment_status: string | null;
    completed_at: string | null;
  };
  const sessionsByKey = new Map<string, SessionRow[]>();
  for (const s of (allSessions || []) as SessionRow[]) {
    const key = `${s.student_id}:${s.class_id}`;
    const arr = sessionsByKey.get(key) || [];
    arr.push(s);
    sessionsByKey.set(key, arr);
  }

  // ── Collect all entry IDs referenced in comments/favorites ─────────────
  const allEntryIds = new Set<string>();
  for (const s of (allSessions || []) as SessionRow[]) {
    if (s.comments) {
      for (const id of Object.keys(s.comments)) allEntryIds.add(id);
    }
    if (s.favorites) {
      for (const id of Object.keys(s.favorites)) allEntryIds.add(id);
    }
  }

  // Fetch captions for all referenced entries
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

  // ── Fetch own entries (student submissions) per round ──────────────────
  // Includes status and teacher_note for the submission review info.
  // Keyed by profilesId:classId:roundNumber
  type OwnEntry = {
    description: string;
    status: string;
    teacherNote: string;
  };
  const ownEntryByKey = new Map<string, OwnEntry>();
  const profilesIds = studentClasses
    .map((sc) => {
      if (!sc.student.email) return null;
      return authByEmail.get(sc.student.email.toLowerCase()) ?? null;
    })
    .filter((id): id is string => id !== null);

  if (profilesIds.length > 0) {
    // Query status and teacher_note — if teacher_note column doesn't exist,
    // the query still works (returns null for that field).
    const { data: ownRows } = await admin
      .from("entries")
      .select(
        "student_id, class_id, round_number, description_text, status, teacher_note"
      )
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
          teacherNote: (r as any).teacher_note || "",
        });
      }
    }
  }

  // ── Build CSV rows ────────────────────────────────────────────────────
  const header = [
    "Photo Description",
    "Student Comment",
    "Is Favorite",
    "Favorite Comment",
  ];
  const rows: string[][] = [header];

  // ── Section: Teacher's warm-up photos ──────────────────────────────────
  rows.push(["=== TEACHER'S WARM-UP PHOTOS ===", "", "", ""]);
  if (!starterRows || starterRows.length === 0) {
    rows.push(["(no warm-up photos)", "", "", ""]);
  } else {
    for (const s of starterRows) {
      rows.push([s.description_text || "(no description)", "", "", ""]);
    }
  }
  rows.push(blankRow());
  rows.push(blankRow());

  // ── Per-student sections ──────────────────────────────────────────────
  for (let si = 0; si < studentClasses.length; si++) {
    const { student, classId } = studentClasses[si];
    const displayName =
      student.screen_name || student.name || student.email || "Unknown";
    const className = classNameById.get(classId) || "";

    // Resolve profiles.id for own-entry lookup
    const profilesId = student.email
      ? authByEmail.get(student.email.toLowerCase()) ?? null
      : null;

    // Student header
    const nameParts = [displayName];
    if (student.name && student.name !== displayName) {
      nameParts.push(student.name);
    }
    if (student.email) {
      nameParts.push(student.email);
    }
    rows.push([
      `=== STUDENT: ${nameParts.join(", ")} — ${className} ===`,
      "",
      "",
      "",
    ]);

    // Get sessions
    const key = `${student.id}:${classId}`;
    const sessions = sessionsByKey.get(key) || [];

    if (sessions.length === 0) {
      rows.push(["(no rounds played)", "", "", ""]);
    }

    for (const sess of sessions) {
      const isWarmup = sess.round === 1;
      const displayRound = isWarmup
        ? "Warm-up Round"
        : `Round ${sess.round - 1}`;

      // Round sub-header
      rows.push([`-- ${displayRound} --`, "", "", ""]);

      // Own photo submission (student rounds only, not warm-up)
      if (!isWarmup && profilesId) {
        const studentRoundNum = sess.round - 1;
        const ownKey = `${profilesId}:${classId}:${studentRoundNum}`;
        const own = ownEntryByKey.get(ownKey);
        if (own) {
          const statusLabel = own.status
            ? own.status.charAt(0).toUpperCase() + own.status.slice(1)
            : "";
          rows.push([
            `[Own photo] ${own.description}`,
            statusLabel ? `Status: ${statusLabel}` : "",
            own.teacherNote ? `Teacher note: ${own.teacherNote}` : "",
            "",
          ]);
        }
      }

      // Build a set of favorited entry IDs for this session
      const favoritedIds = new Set<string>();
      if (sess.favorites) {
        for (const [entryId, isFav] of Object.entries(sess.favorites)) {
          if (isFav) favoritedIds.add(entryId);
        }
      }

      // Comment rows — one per photo the student commented on
      const comments = sess.comments || {};
      const commentEntries = Object.entries(comments);

      if (commentEntries.length === 0) {
        rows.push(["(no comments this round)", "", "", ""]);
      } else {
        for (const [entryId, commentText] of commentEntries) {
          const photoDesc = captionById.get(entryId) || "";
          const isFav = favoritedIds.has(entryId);

          // Show favorite comment only on the favorited photo row
          const favComment =
            isFav && sess.favorite_comment ? sess.favorite_comment : "";

          rows.push([
            photoDesc,
            commentText,
            isFav ? "★" : "",
            favComment,
          ]);
        }
      }
    }

    // Divider between students
    if (si < studentClasses.length - 1) {
      rows.push(blankRow());
      rows.push(blankRow());
    }
  }

  // ── Encode CSV ────────────────────────────────────────────────────────
  // \uFEFF = UTF-8 BOM so Excel reads accented characters correctly.
  const csv =
    "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="spotlight-teacher-${filenameSuffix}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
