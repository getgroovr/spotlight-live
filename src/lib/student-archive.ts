// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/lib/student-archive.ts   (REPLACES existing file)
//
// Per-class archive builder for the student profile (Slice 1 Part 2).
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
//
// ownEntries + currentClassTiming (added in slice 1 round-assignment, #27):
//   The dashboard's "Your photo" card grows into a slot grid: one square
//   per round (1..total_rounds), each holding the student's submission for
//   that round (or empty if not yet filled). To support this, the archive
//   now returns:
//     • ownEntries: every own entry in the current class, one per round
//       (most-recent upload wins per round if duplicates exist from
//       pre-#27 data), sorted by round_number ascending.
//     • currentClassTiming: total_rounds, game_starts_at, round_duration_hours,
//       plus the COMPUTED currentRound and isGameOver booleans. The slot
//       grid uses these to render N squares with the right lock state per
//       slot (round N is locked iff N ≤ currentRound).
//   ownEntry (single, legacy) is kept for back-compat with the current
//   dashboard's "Your photo" card; it's the highest-round filled slot
//   (your forward-most submission). Pass 2 replaces the card with the
//   slot grid, at which point ownEntry can be removed.
//
// LOCK SEMANTICS (mirrors actions.ts):
//   Round N is LOCKED the moment round N starts:
//     now ≥ game_starts_at + (N-1) * round_duration_hours.
//   Pre-game (timing unset, or now < game_starts_at), no round is locked.
//   The slot grid client reads currentClassTiming.currentRound and locks
//   any slot whose number is ≤ that value. Helpers are now imported from
//   src/lib/round-timing.ts (handoff #30 carry-over: extraction complete).
//
// TWO-TRACK STUDENT IDS — read this before changing the entry query:
//   This codebase has two distinct UUIDs per student, and they are NOT the
//   same value:
//     • students.id     — generated when the student row is inserted
//                         (enrollStudent in actions.ts). Used by
//                         enrollments, game_sessions, submissions,
//                         teacher_comments — the "students track."
//     • profiles.id     — equals auth.users.id (the magic-link auth user).
//                         Used by entries.student_id — the "profiles track."
//   saveProfile writes entries with student_id = user.id (= profiles.id).
//   So when we read entries back, we must join on profiles.id, NOT
//   students.id. The earlier version of this file joined on students.id
//   and silently returned ownEntry=null even when an entry existed.
// ─────────────────────────────────────────────────────────────────────────
import "server-only";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  type ClassTiming,
  computeCurrentRound,
  isGameOver,
} from "@/lib/round-timing";

const STARTER_BUCKET = "teacher-deck";
const MEDIA_BUCKET = "media";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — same as class-deck.ts

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

// The student's OWN entry in a single slot of the current class.
// One per round (deduped — most recent upload wins if duplicates exist).
export type OwnEntry = {
  id: string;
  description_text: string | null;
  signedUrl: string | null;
  status: "pending" | "live" | string;
  uploadedAt: string | null;
  roundNumber: number;       // #27: which slot this fills
  teacherNote: string | null; // #27: teacher's note on this entry, if any
};

// Timing snapshot for the student's CURRENT class. Null when the student
// has no current class. The slot grid renders totalRounds squares
// (falling back to 1 when null) and locks any whose number ≤ currentRound.
export type CurrentClassTiming = {
  totalRounds: number | null;       // null → game not configured yet (show 1 slot)
  gameStartsAt: string | null;
  roundDurationHours: number | null;
  currentRound: number;             // 0 = pre-game; totalRounds+1 = over
  isGameOver: boolean;
};

export type ArchiveResult =
  | { error: "no-session" | "not-enrolled" | "Server not configured." }
  | { student: { id: string; name: string | null; screen_name: string | null; email: string | null };
      classes: ClassArchive[];
      // Legacy: single "your photo" card. Now means "highest-round filled
      // slot in the current class." Removed once pass 2 replaces the card.
      ownEntry: OwnEntry | null;
      // #27: all own entries in current class, one per round, sorted asc.
      ownEntries: OwnEntry[];
      // #27: timing snapshot for the current class (null when none).
      currentClassTiming: CurrentClassTiming | null };

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
    return { student, classes: [], ownEntry: null, ownEntries: [], currentClassTiming: null };
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

  // ── #27: ownEntries + currentClassTiming for the current class ────────
  // Returns all own entries one-per-round (deduped: most recent upload
  // wins if a round has duplicates from pre-#27 data), plus a timing
  // snapshot for the slot grid to render against. Both null/empty if
  // there's no current class.
  //
  // CRITICAL — see TWO-TRACK STUDENT IDS comment at top of this file:
  // entries.student_id holds profiles.id (= auth user.id), NOT students.id.
  let ownEntries: OwnEntry[] = [];
  let currentClassTiming: CurrentClassTiming | null = null;

  if (currentClassId) {
    // Class timing.
    const { data: classRow } = await admin
      .from("classes")
      .select("total_rounds, game_starts_at, round_duration_hours")
      .eq("id", currentClassId)
      .maybeSingle();
    const timing: ClassTiming = {
      total_rounds: classRow?.total_rounds ?? null,
      game_starts_at: classRow?.game_starts_at ?? null,
      round_duration_hours: classRow?.round_duration_hours ?? null,
    };
    currentClassTiming = {
      totalRounds: timing.total_rounds,
      gameStartsAt: timing.game_starts_at,
      roundDurationHours: timing.round_duration_hours,
      currentRound: computeCurrentRound(timing),
      isGameOver: isGameOver(timing),
    };

    // Own entries: order by round asc, then uploaded_at desc, then dedupe
    // keeping the first per round (= most recent upload for that round).
    const { data: ownRows } = await admin
      .from("entries")
      .select("id, media_url, description_text, status, uploaded_at, round_number")
      .eq("class_id", currentClassId)
      .eq("student_id", user.id)
      .eq("is_starter", false)
      .in("status", ["live", "pending"])
      .order("round_number", { ascending: true })
      .order("uploaded_at", { ascending: false });

    const seenRounds = new Set<number>();
    const uniqueRows = (ownRows || []).filter((r) => {
      const rn = r.round_number as number;
      if (seenRounds.has(rn)) return false;
      seenRounds.add(rn);
      return true;
    });

    // Sign URLs for the deduped set, and attach teacher notes (if any).
    // Teacher notes for the current class were already aggregated into
    // allNotes above. We pull the ones with a matching entry_id.
    const ownNoteByEntry: Record<string, string> = {};
    for (const t of allNotes || []) {
      if (t.class_id !== currentClassId) continue;
      if (t.entry_id) ownNoteByEntry[t.entry_id as string] = t.body as string;
    }

    ownEntries = await Promise.all(
      uniqueRows.map(async (r) => {
        let signedUrl: string | null = null;
        if (r.media_url) {
          try {
            const { data, error } = await admin.storage
              .from(MEDIA_BUCKET)
              .createSignedUrl(r.media_url as string, SIGNED_URL_TTL_SECONDS);
            if (error) {
              console.error(
                `[student-archive] createSignedUrl failed for own entry ${r.id}`,
                error,
              );
            } else {
              signedUrl = data?.signedUrl ?? null;
            }
          } catch (e) {
            console.error(
              `[student-archive] createSignedUrl threw for own entry ${r.id}`,
              e,
            );
          }
        }
        return {
          id: r.id as string,
          description_text: (r.description_text as string | null) ?? null,
          signedUrl,
          status: (r.status as string) ?? "pending",
          uploadedAt: (r.uploaded_at as string | null) ?? null,
          roundNumber: r.round_number as number,
          teacherNote: ownNoteByEntry[r.id as string] ?? null,
        };
      }),
    );
  }

  // Legacy back-compat for the current dashboard's "Your photo" card.
  // Definition shift in #27: this is now the HIGHEST-round filled slot
  // (the student's forward-most submission), not the most-recently
  // uploaded across rounds. The card is going away in pass 2 along with
  // this field.
  const ownEntry: OwnEntry | null =
    ownEntries.length > 0 ? ownEntries[ownEntries.length - 1] : null;

  return { student, classes, ownEntry, ownEntries, currentClassTiming };
}
