// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/student/dashboard/export/route.ts   (NEW FOLDER: export/)
//
// Slice 1 Part 2 — student-initiated, per-class CSV export. The same
// spreadsheet a teacher can already pull from /teacher/students/export
// (Parked I), but scoped to ONE class and to the LOGGED-IN STUDENT only.
// A student opens an archived class and downloads their own record for it,
// then hands that file to a new teacher themselves. No email, no transfer —
// the student controls where the file goes (most privacy-preserving; matches
// the standing "student-initiated = better privacy" call).
//
// AUTH / SCOPE (the flip from Parked I)
//   Parked I scoped by classes.teacher_id = auth.uid() (teacher owns class).
//   Here we scope by: this email's student row, AND an enrollment of that
//   student in the requested class_id. A logged-in student who was never in
//   the class gets a 404 — never another student's data, never a class they
//   weren't in.
//
//   Reads via the service client after the enrollment check, same pattern as
//   the dashboard page.
//
// CSV machinery (csvCell, BOM, RFC-4180, headers) is lifted verbatim from
// Parked I so the two exports stay byte-compatible in Excel/Sheets.
//
// USAGE: GET /student/dashboard/export?class_id=<uuid>
// ─────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// RFC-4180 quoting (verbatim from Parked I): wrap in quotes if the cell holds
// a comma, quote, or newline; double up any embedded quotes.
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const classId = req.nextUrl.searchParams.get("class_id");
  if (!classId) {
    return new NextResponse("Missing class_id.", { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) return new NextResponse("Server not configured.", { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return new NextResponse("Not signed in.", { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return new NextResponse("Server not configured.", { status: 500 });
  }
  const admin = createServiceClient(supabaseUrl, serviceKey);

  // The student row for this email.
  const { data: student } = await admin
    .from("students")
    .select("id, name, screen_name, email")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  if (!student) return new NextResponse("No student record.", { status: 404 });

  // Enrollment check: is THIS student in THIS class? Also gives us the round
  // and the class name. No enrollment → 404 (never another class's data).
  const { data: enrollment } = await admin
    .from("enrollments")
    .select("round, enrolled_at, classes(name)")
    .eq("student_id", student.id)
    .eq("class_id", classId)
    .order("enrolled_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!enrollment) {
    return new NextResponse("You are not enrolled in that class.", { status: 404 });
  }
  const round = (enrollment.round as number) ?? 1;
  const className =
    (enrollment.classes as unknown as { name: string } | null)?.name || "";

  // This class+round's session.
  const { data: session } = await admin
    .from("game_sessions")
    .select("comments, favorite_comment, completed_at")
    .eq("student_id", student.id)
    .eq("class_id", classId)
    .eq("round", round)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Teacher notes for this student IN THIS CLASS, oldest first, tagged by
  // round and concatenated (same join shape as Parked I, class-scoped).
  const { data: notes } = await admin
    .from("teacher_comments")
    .select("round, body, created_at")
    .eq("student_id", student.id)
    .eq("class_id", classId)
    .order("created_at", { ascending: true });
  const teacherNotes = (notes || [])
    .map((n) => (n.round != null ? `R${n.round}: ` : "") + n.body)
    .join("  |  ");

  const commentCount = session?.comments ? Object.keys(session.comments).length : 0;
  const profileComplete = !!(student.name && student.screen_name && session?.favorite_comment);

  const header = [
    "Student", "Real name", "Email", "Class", "Round",
    "Enrolled (UTC)", "Completed (UTC)", "Comments made",
    "Favorite comment", "Profile finished", "Teacher notes",
  ];
  const row = [
    student.screen_name || student.name || student.email || "",
    student.name || "",
    student.email || "",
    className,
    String(round),
    enrollment.enrolled_at ? new Date(enrollment.enrolled_at as string).toISOString() : "",
    session?.completed_at ? new Date(session.completed_at).toISOString() : "",
    String(commentCount),
    session?.favorite_comment || "",
    profileComplete ? "yes" : "no",
    teacherNotes,
  ];

  // \uFEFF = UTF-8 BOM (Excel reads accents correctly). \r\n per RFC-4180.
  const csv = "\uFEFF" + [header, row].map((r) => r.map(csvCell).join(",")).join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);
  const safeClass = (className || "class").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="spotlight-${safeClass}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
