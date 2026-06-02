// ─────────────────────────────────────────────────────────────────────────
// src/lib/student-archive.ts — per-class archive builder for the student
// profile (Slice 1 Part 2).
//
// WHY THIS EXISTS
//   The original dashboard read ONE session — the student's most-recent
//   game_session across all classes (no class filter) — and rendered that
//   single class. A student who enrolled in a second class would only ever
//   see whichever they played last. That's the single→multi read gap Part 2
//   closes.
//
//   This module generalizes the old getProfileData read into "one archive
//   PER class the student has ever enrolled in." It returns them newest-first
//   so the profile can render a history strip (newest expanded, older ones
//   collapsed) and expand any class into its full Round-1 record.
//
// SCOPING (the core change)
//   Everything from the session-read downward is now scoped by class_id AND
//   round — exactly how the Parked I export scopes its per-row session fetch.
//   The teacher-notes query gains .eq("class_id") too, so notes never bleed
//   across classes. This mirrors is_enrolled_in on the RLS side: a student's
//   reads span every class they've ever been in, each kept separate.
//
// READS
//   Uses the service-role admin client and scopes by the logged-in student's
//   id, identical to the original page. (The dashboard has always read via
//   admin; RLS-via-is_enrolled_in is the belt-and-suspenders for any future
//   non-admin read path.)
//
// SHAPE
//   Returns the SAME Entry/archive shape the page already renders, so the
//   complete-state JSX can be reused per class with no translation.
// ─────────────────────────────────────────────────────────────────────────
import "server-only";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const STARTER_BUCKET = "teacher-deck";

export type ArchiveEntry = {
  id: string;
  description_text: string | null;
  publicUrl: string | null;
  comment: string;
  isFavorite: boolean;
  teacherNote: string | null;
};

export type ClassArchive = {
  classId: string;
  className: string;
  isCurrent: boolean;        // matches profiles.class_id — the one live class
  round: number;
  completedAt: string | null;
  enrolledAt: string | null;
  favoriteComment: string | null;
  entries: ArchiveEntry[];
  generalNotes: Array<{ body: string; round: number | null }>;
  // The favorite's public URL, surfaced for the collapsed strip tile (the
  // "favorite picture that started it"). Null if no favorite / no image.
  favoriteThumb: string | null;
};

export type ArchiveResult =
  | { error: "no-session" | "not-enrolled" | "Server not configured." }
  | { student: { id: string; name: string | null; screen_name: string | null; email: string | null };
      classes: ClassArchive[] };

export async function getStudentArchive(): Promise<ArchiveResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Server not configured." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "no-session" };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { error: "Server not configured." };
  const admin = createServiceClient(supabaseUrl, serviceKey);

  // The student row for this email.
  const { data: student } = await admin
    .from("students")
    .select("id, name, screen_name, email")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  if (!student) return { error: "not-enrolled" };

  // The student's CURRENT class = profiles.class_id (what my_class_id() returns
  // and route.ts syncs on login). Everything else they've enrolled in is past
  // (history). profiles.id == auth user id.
  const { data: profile } = await admin
    .from("profiles")
    .select("class_id")
    .eq("id", user.id)
    .maybeSingle();
  const currentClassId = profile?.class_id ?? null;

  // Every class this student has ever enrolled in, newest first. enrolled_at
  // is the correct column (NOT created_at) — confirmed against the live
  // schema. We join the class name for the strip tiles.
  const { data: enrollments } = await admin
    .from("enrollments")
    .select("class_id, round, enrolled_at, classes(name)")
    .eq("student_id", student.id)
    .order("enrolled_at", { ascending: false });

  if (!enrollments || enrollments.length === 0) {
    return { student, classes: [] };
  }

  // Preload ALL of this student's teacher notes once, then bucket per class.
  // (Cheaper than a query per class; notes are few.)
  const { data: allNotes } = await admin
    .from("teacher_comments")
    .select("class_id, body, round, entry_id, created_at")
    .eq("student_id", student.id)
    .order("created_at", { ascending: true });

  const classes: ClassArchive[] = [];

  for (const en of enrollments) {
    const classId = en.class_id as string;
    const round = (en.round as number) ?? 1;
    const className =
      (en.classes as unknown as { name: string } | null)?.name || "Class";

    // This class+round's session. Scoped so each archive reflects its own
    // class, not the globally-latest session (the old bug).
    const { data: session } = await admin
      .from("game_sessions")
      .select("comments, favorites, favorite_comment, round, completed_at")
      .eq("student_id", student.id)
      .eq("class_id", classId)
      .eq("round", round)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const commentIds = session?.comments ? Object.keys(session.comments) : [];
    const favoriteIds = session?.favorites
      ? Object.keys(session.favorites).filter((k) => (session.favorites as Record<string, boolean>)[k])
      : [];
    const favoriteId = favoriteIds[0] || null;

    // Notes for THIS class only, split per-photo vs general.
    const noteByEntry: Record<string, string> = {};
    const generalNotes: Array<{ body: string; round: number | null }> = [];
    for (const t of allNotes || []) {
      if (t.class_id !== classId) continue;
      if (t.entry_id) noteByEntry[t.entry_id as string] = t.body as string;
      else generalNotes.push({ body: t.body as string, round: (t.round as number) ?? null });
    }

    let entries: ArchiveEntry[] = [];
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
            comment: (session?.comments as Record<string, string>)?.[r.id] || "",
            isFavorite: r.id === favoriteId,
            teacherNote: noteByEntry[r.id] ?? null,
          };
        });
      }
    }

    const favorite = entries.find((e) => e.isFavorite) || null;

    classes.push({
      classId,
      className,
      isCurrent: currentClassId != null && classId === currentClassId,
      round: session?.round ?? round,
      completedAt: session?.completed_at ?? null,
      enrolledAt: (en.enrolled_at as string) ?? null,
      favoriteComment: session?.favorite_comment ?? null,
      entries,
      generalNotes,
      favoriteThumb: favorite?.publicUrl ?? null,
    });
  }

  // Order: the current class first, then past classes newest-first. (The loop
  // above already walked enrollments newest-first; this just lifts current to
  // the top so the strip reads "your class" then "past classes".)
  classes.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return 0; // preserve newest-first within each group
  });

  return { student, classes };
}
