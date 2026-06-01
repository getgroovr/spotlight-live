// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/export/route.ts   (NEW FOLDER: export/)
//
// Parked I — cohort CSV export. A GET route that streams a .csv download of
// the teacher's class: one row per enrollment, covering each student's
// round journey (comments made, their favorite "why", completion, profile
// status) plus any teacher notes.
//
// Auth mirrors src/app/teacher/students/page.tsx exactly: read the user with
// the SSR client (auth.uid() from cookies), then use the service client for
// the joins — but EVERY query is scoped to classes this teacher owns, so a
// logged-in non-owner gets a 404, never another teacher's roster.
//
// CSV-first: zero new dependencies, opens cleanly in Excel/Sheets. A leading
// UTF-8 BOM keeps Excel from mangling accented names. A richer .xlsx (bold
// headers, column widths, per-round sheets) is a clean follow-up if wanted.
// ─────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
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

  // Preload all teacher notes for these classes once, grouped by student.
  // (Notes can be multiple per student — per round and/or per photo — so we
  // concatenate them into a single cell, oldest first, tagged by round.)
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

  // One row per enrollment. (A student enrolled in multiple rounds yields one
  // row per round — correct for an export. Only round 1 exists today.)
  const rows: string[][] = [];
  for (const e of enrollments || []) {
    const s = e.students as unknown as {
      id: string; name: string | null; screen_name: string | null; email: string | null;
    } | null;
    if (!s) continue;

    // This enrollment's session: scoped to the same class AND round so each
    // row reflects its own round rather than the globally-latest session.
    const { data: session } = await admin
      .from("game_sessions")
      .select("comments, favorite_comment, completed_at")
      .eq("student_id", s.id)
      .eq("class_id", e.class_id)
      .eq("round", e.round)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const commentCount = session?.comments ? Object.keys(session.comments).length : 0;
    const profileComplete = !!(s.name && s.screen_name && session?.favorite_comment);
    const teacherNotes = (notesByStudent.get(s.id) || []).join("  |  ");

    rows.push([
      s.screen_name || s.name || s.email || "",
      s.name || "",
      s.email || "",
      classNameById.get(e.class_id) || "",
      e.round != null ? String(e.round) : "",
      e.enrolled_at ? new Date(e.enrolled_at).toISOString() : "",
      session?.completed_at ? new Date(session.completed_at).toISOString() : "",
      String(commentCount),
      session?.favorite_comment || "",
      profileComplete ? "yes" : "no",
      teacherNotes,
    ]);
  }

  const header = [
    "Student", "Real name", "Email", "Class", "Round",
    "Enrolled (UTC)", "Completed (UTC)", "Comments made",
    "Favorite comment", "Profile finished", "Teacher notes",
  ];

  // \uFEFF = UTF-8 BOM so Excel reads accented characters correctly.
  // \r\n line endings per RFC-4180.
  const csv = "\uFEFF" + [header, ...rows]
    .map((r) => r.map(csvCell).join(","))
    .join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="spotlight-cohort-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
