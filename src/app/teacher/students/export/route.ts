// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/export/route.ts   (REPLACES existing)
//
// Whole-class CSV export, reoriented around the actual WRITTEN LANGUAGE rather
// than metadata. One row per enrollment (per student per round). The columns
// the teacher cares about are the words: each comment the student wrote, the
// "why this was my favorite" note, the student's own photo description, and
// the teacher's own notes back. Counts/timestamps/flags were dropped per the
// #23 decision ("the actual language is key").
//
// Comment findability: game_sessions.comments is keyed by the STARTER entry id
// the student was commenting on. We look those ids up in `entries` and prefix
// each comment with that photo's own caption ([caption] comment…) so the
// teacher can tell which photo a comment is about and look it back up in the
// online student view. (Exact label-matching to /teacher/students/[id] would
// need that page; this caption-prefix is the self-contained version.)
//
// The "Their own photo (description)" column reads `entries` (the student's
// non-starter contribution). It stays BLANK until the entry-write FK bug is
// fixed — once entries rows land, it populates with no further change here.
//
// Auth/scoping unchanged: SSR client for auth.uid(), service client for the
// joins, every query scoped to classes this teacher owns. Available anytime —
// NOT gated to end-of-class (confirmed not needed).
// ─────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// RFC-4180 quoting: wrap in quotes if the cell holds a comma, quote, or newline;
// double up any embedded quotes. (Newlines inside a quoted cell are fine and
// render as line breaks within the cell in Excel/Sheets.)
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
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

  // Which classes does this teacher own?
  const { data: classes } = await admin
    .from("classes")
    .select("id, name")
    .eq("teacher_id", user.id);
  const classIds = (classes || []).map((c) => c.id);
  if (classIds.length === 0) {
    return new NextResponse("No class found for this account.", { status: 404 });
  }
  const classNameById = new Map<string, string>(
    (classes || []).map((c) => [c.id, c.name])
  );

  // Enrollments in those classes, joined to the student rows.
  const { data: enrollments } = await admin
    .from("enrollments")
    .select("student_id, class_id, round, enrolled_at, students(id, name, screen_name, email)")
    .in("class_id", classIds)
    .order("enrolled_at", { ascending: false });

  // Teacher notes for these classes, grouped by student (oldest first, tagged by round).
  const { data: notes } = await admin
    .from("teacher_comments")
    .select("student_id, round, body, created_at")
    .in("class_id", classIds)
    .order("created_at", { ascending: true });
  const notesByStudent = new Map<string, string[]>();
  for (const n of notes || []) {
    const arr = notesByStudent.get(n.student_id) || [];
    const prefix = n.round != null ? `R${n.round}: ` : "";
    arr.push(prefix + n.body);
    notesByStudent.set(n.student_id, arr);
  }

  // ── First pass: gather each enrollment's session (scoped to class+round) ──
  type Gathered = {
    student: { id: string; name: string | null; screen_name: string | null; email: string | null };
    classId: string;
    round: number | null;
    comments: Record<string, string> | null;
    favoriteComment: string | null;
  };
  const gathered: Gathered[] = [];
  const commentKeySet = new Set<string>();
  const studentIdSet = new Set<string>();

  for (const e of enrollments || []) {
    const s = e.students as unknown as Gathered["student"] | null;
    if (!s) continue;
    studentIdSet.add(s.id);

    const { data: session } = await admin
      .from("game_sessions")
      .select("comments, favorite_comment")
      .eq("student_id", s.id)
      .eq("class_id", e.class_id)
      .eq("round", e.round)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const comments = (session?.comments as Record<string, string> | null) || null;
    if (comments) for (const k of Object.keys(comments)) commentKeySet.add(k);

    gathered.push({
      student: s,
      classId: e.class_id,
      round: e.round,
      comments,
      favoriteComment: session?.favorite_comment || null,
    });
  }

  // ── Caption lookup: the photo each comment was about ──────────────────
  const captionById = new Map<string, string>();
  if (commentKeySet.size > 0) {
    const { data: capRows } = await admin
      .from("entries")
      .select("id, description_text")
      .in("id", Array.from(commentKeySet));
    for (const r of capRows || []) {
      captionById.set(r.id, r.description_text || "");
    }
  }

  // ── Each student's OWN photo description (non-starter entry) ───────────
  // Blank until the entry-write FK bug is fixed; forward-compatible.
  const ownDescByStudent = new Map<string, string>();
  if (studentIdSet.size > 0) {
    const { data: ownRows } = await admin
      .from("entries")
      .select("student_id, description_text, uploaded_at, is_starter")
      .in("student_id", Array.from(studentIdSet))
      .eq("is_starter", false)
      .order("uploaded_at", { ascending: false });
    for (const r of ownRows || []) {
      if (!ownDescByStudent.has(r.student_id)) {
        ownDescByStudent.set(r.student_id, r.description_text || "");
      }
    }
  }

  function renderComments(comments: Record<string, string> | null): string {
    if (!comments) return "";
    return Object.entries(comments)
      .map(([entryId, text]) => {
        const cap = captionById.get(entryId);
        const label = cap ? `[${cap}]` : "[photo]";
        return `${label} ${text}`;
      })
      .join("\n");
  }

  // ── Build rows ────────────────────────────────────────────────────────
  const header = [
    "Student", "Real name", "Email", "Class", "Round",
    "Their comments", "Favorite — why", "Their own photo (description)", "Teacher notes",
  ];

  function rowFor(g: Gathered): string[] {
    return [
      g.student.screen_name || g.student.name || g.student.email || "",
      g.student.name || "",
      g.student.email || "",
      classNameById.get(g.classId) || "",
      g.round != null ? String(g.round) : "",
      renderComments(g.comments),
      g.favoriteComment || "",
      ownDescByStudent.get(g.student.id) || "",
      (notesByStudent.get(g.student.id) || []).join("\n"),
    ];
  }

  // Group rows by student so the blank separators fall BETWEEN students, not
  // between a single student's own rounds (forward-compatible with multi-round).
  const order: string[] = [];
  const byStudent = new Map<string, Gathered[]>();
  for (const g of gathered) {
    if (!byStudent.has(g.student.id)) {
      byStudent.set(g.student.id, []);
      order.push(g.student.id);
    }
    byStudent.get(g.student.id)!.push(g);
  }

  const blank = header.map(() => ""); // a row of empty cells = a clean empty row in Excel
  const body: string[][] = [];
  order.forEach((sid, idx) => {
    for (const g of byStudent.get(sid)!) body.push(rowFor(g));
    if (idx < order.length - 1) {
      body.push(blank);
      body.push(blank);
    }
  });

  // \uFEFF = UTF-8 BOM so Excel reads accented characters correctly.
  const csv = "\uFEFF" + [header, ...body]
    .map((r) => r.map(csvCell).join(","))
    .join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="spotlight-class-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
