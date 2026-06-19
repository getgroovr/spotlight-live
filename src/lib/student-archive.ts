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
// APPROVAL / REJECTION (#34):
//   OwnEntry now carries rejectionReason (from entries.rejection_reason).
//   The status filter includes "rejected" so the student sees entries the
//   teacher has sent back, along with the reason. The dashboard renders a
//   rejection notice and lets the student remove + re-upload.
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
//
// B2 (#41): ROUND SESSIONS — classmate comments for completed student rounds
//   The archive now returns roundSessions: one per completed student round
//   in the current class. Each session carries the entries the student
//   commented on during that round, with signed/public URLs and their
//   comment text. The dashboard renders these below the student's own entry
//   in each completed round's expanded view.
//
//   Bucket handling: warm-up entries (is_starter=true) live in the PUBLIC
//   teacher-deck bucket → getPublicUrl. Student entries (is_starter=false)
//   live in the PRIVATE media bucket → createSignedUrl. The round-session
//   builder checks is_starter per entry and branches accordingly.
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
  // #39: favorite-comment moderation status, surfaced for the student dashboard.
  favoriteCommentStatus: "pending" | "approved" | "rejected" | null;
  favoriteCommentRejectionReason: string | null;
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
  status: "pending" | "live" | "rejected" | string;
  uploadedAt: string | null;
  roundNumber: number;       // #27: which slot this fills
  teacherNote: string | null; // #27: teacher's note on this entry, if any
  rejectionReason: string | null; // #34: teacher's reason when status='rejected'
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

// B2 (#41): one completed student round's worth of classmate comments.
export type RoundSessionData = {
  roundNumber: number;        // student round number (1, 2, 3…) — NOT the DB round value
  completedAt: string | null;
  commentedEntries: ArchiveEntry[];
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
      currentClassTiming: CurrentClassTiming | null;
      // B2 (#41): per-round classmate comments for the current class.
      roundSessions: RoundSessionData[] };

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
    return { student, classes: [], ownEntry: null, ownEntries: [], currentClassTiming: null, roundSessions: [] };
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
      .select("comments, favorites, favorite_comment, round, completed_at, favorite_comment_status, favorite_comment_rejection_reason")
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
      favoriteCommentStatus: (session?.favorite_comment_status as "pending" | "approved" | "rejected" | null) ?? null,
      favoriteCommentRejectionReason: (session?.favorite_comment_rejection_reason as string | null) ?? null,
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
  //
  // #34: status filter now includes "rejected" so the student sees entries
  // the teacher has sent back. rejection_reason is fetched for display.
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
    // #34: include "rejected" so student sees entries sent back by teacher.
    const { data: ownRows } = await admin
      .from("entries")
      .select("id, media_url, description_text, status, uploaded_at, round_number, rejection_reason")
      .eq("class_id", currentClassId)
      .eq("student_id", user.id)
      .eq("is_starter", false)
      .in("status", ["live", "pending", "rejected"])
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
          rejectionReason: (r.rejection_reason as string | null) ?? null,
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

  // ── B2 (#41): roundSessions — classmate comments per student round ────
  //
  // Fetch ALL non-warm-up game_sessions for the current class. For each
  // completed session, pull the entries the student commented on, resolve
  // media URLs (is_starter → teacher-deck public, else → media signed),
  // and pack into RoundSessionData. The dashboard renders these in the
  // expanded completed-round view.
  //
  // game_sessions.round mapping:
  //   DB round 1 = warm-up (handled above in the per-enrollment loop)
  //   DB round N = student round N−1
  // So studentRound = dbRound − 1.
  let roundSessions: RoundSessionData[] = [];

  if (currentClassId) {
    const { data: studentRoundSessions } = await admin
      .from("game_sessions")
      .select("round, completed_at, comments, favorites")
      .eq("student_id", student.id)
      .eq("class_id", currentClassId)
      .gt("round", 1) // exclude warm-up (round=1)
      .order("round", { ascending: true });

    // Pre-build note map for the current class (reuse allNotes).
    const classNoteByEntry: Record<string, string> = {};
    for (const t of allNotes || []) {
      if (t.class_id !== currentClassId) continue;
      if (t.entry_id) classNoteByEntry[t.entry_id as string] = t.body as string;
    }

    for (const sess of studentRoundSessions || []) {
      const dbRound = sess.round as number;
      const studentRound = dbRound - 1;

      const comments = (sess.comments ?? {}) as Record<string, string>;
      const favorites = (sess.favorites ?? {}) as Record<string, boolean>;
      const commentIds = Object.keys(comments);
      const favoriteId = Object.keys(favorites).find((k) => favorites[k]) ?? null;

      let commentedEntries: ArchiveEntry[] = [];

      if (commentIds.length > 0) {
        // Fetch the entries this student commented on. Include is_starter
        // so we can pick the right bucket for media URLs.
        const { data: entryRows } = await admin
          .from("entries")
          .select("id, media_url, description_text, is_starter")
          .in("id", commentIds);

        if (entryRows) {
          commentedEntries = await Promise.all(
            entryRows.map(async (r) => {
              let url: string | null = null;
              const mediaPath = r.media_url as string | null;
              const isStarter = r.is_starter as boolean;

              if (mediaPath) {
                if (isStarter) {
                  // Starter entries → teacher-deck PUBLIC bucket → getPublicUrl
                  try {
                    const { data } = admin.storage
                      .from(STARTER_BUCKET)
                      .getPublicUrl(mediaPath);
                    url = data?.publicUrl ?? null;
                    if (!url) {
                      console.error(
                        `[student-archive] getPublicUrl returned no URL for starter ${r.id}, path: ${mediaPath}`,
                      );
                    }
                  } catch (e) {
                    console.error(
                      `[student-archive] getPublicUrl threw for starter ${r.id}`,
                      e,
                    );
                  }
                } else {
                  // Student entries → media PRIVATE bucket → createSignedUrl
                  try {
                    const { data, error } = await admin.storage
                      .from(MEDIA_BUCKET)
                      .createSignedUrl(mediaPath, SIGNED_URL_TTL_SECONDS);
                    if (error || !data?.signedUrl) {
                      console.error(
                        `[student-archive] createSignedUrl failed for entry ${r.id}, path: ${mediaPath}`,
                        error,
                      );
                    } else {
                      url = data.signedUrl;
                    }
                  } catch (e) {
                    console.error(
                      `[student-archive] createSignedUrl threw for entry ${r.id}`,
                      e,
                    );
                  }
                }
              }

              return {
                id: r.id as string,
                description_text: (r.description_text as string | null) ?? null,
                publicUrl: url,
                comment: comments[r.id as string] || "",
                isFavorite: (r.id as string) === favoriteId,
                // Teacher notes here are scoped to this student — they
                // won't contain notes about OTHER students' entries. This
                // will be null for classmate entries, which is correct.
                teacherNote: classNoteByEntry[r.id as string] ?? null,
              };
            }),
          );

          // Sort: favorite first, then others in original order.
          commentedEntries.sort((a, b) =>
            a.isFavorite === b.isFavorite ? 0 : a.isFavorite ? -1 : 1,
          );
        }
      }

      roundSessions.push({
        roundNumber: studentRound,
        completedAt: (sess.completed_at as string | null) ?? null,
        commentedEntries,
      });
    }
  }

  return { student, classes, ownEntry, ownEntries, currentClassTiming, roundSessions };
}
