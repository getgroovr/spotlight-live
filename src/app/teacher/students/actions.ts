// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/actions.ts   (REPLACES existing)
//
// Server actions for the teacher students page:
//
//   1. saveClassSettings       — class management header (slice 1, step 3)
//   2. approveEntry            — approve a pending student submission
//   3. rejectEntry             — reject a pending submission with a reason
//   4. approveFavoriteComment  — NEW #38: approve a pending favorite comment
//   5. rejectFavoriteComment   — NEW #38: reject a pending favorite comment
//
// AUTH PATTERN (all actions):
//   - SSR cookie client to resolve auth.uid()
//   - Verify role = 'teacher' on profiles
//   - Verify ownership (class belongs to this teacher)
//
// #35 T1: approveEntry now archives any existing live entry for the same
//         student + class + round before flipping the new one to live.
//         This prevents unique-constraint violations when a student
//         resubmits and the teacher approves the replacement.
//
// #35 T2: Both approveEntry and rejectEntry write the teacher's comment
//         to the `teacher_comments` table with `entry_id` set. This is
//         the same table the student profile page reads from, so notes
//         are editable from both the pending queue and the student detail
//         view. rejectEntry ALSO writes to entries.rejection_reason for
//         backward compatibility with older data paths.
//
// #38: Favorite comment moderation. game_sessions now has:
//        favorite_comment_status   (null | pending | approved | rejected)
//        favorite_comment_reviewed_by, favorite_comment_reviewed_at
//        favorite_comment_rejection_reason
//      The pending queue surfaces sessions where favorite_comment_status
//      = 'pending'. Approve/reject flip the status. Rejection reason is
//      stored on game_sessions directly (no teacher_comments write for
//      this path — the student reads it from the session row).
//
// TWO-TRACK STUDENT IDS: teacher_comments.student_id uses students.id
//   (not profiles.id / auth user id). The approval flow resolves this
//   via the lookup chain: entry.student_id → auth user email → students
//   table. See resolveStudentsId helper.
//
//   NOTE: game_sessions.student_id IS students.id already (written by
//   enrollStudent in play/actions.ts), so the favorite-comment actions
//   do NOT need the resolveStudentsId bridge.
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { ActionResult } from "@/app/play/actions";

// ── saveClassSettings ─────────────────────────────────────────────────────

const ALLOWED_DURATION_HOURS = [0.25, 0.5, 1, 2, 5, 24, 48, 168] as const;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 100;
const NAME_MIN = 1;
const NAME_MAX = 100;

export type SaveClassSettingsResult =
  | ActionResult
  | { ok: true; warning: string };

export async function saveClassSettings(
  _prevState: SaveClassSettingsResult | null,
  formData: FormData,
): Promise<SaveClassSettingsResult> {
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, error: "Server isn't configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your sign-in expired. Please sign in again." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "teacher") {
    return { ok: false, error: "Only teachers can change class settings." };
  }

  const classId = String(formData.get("class_id") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const totalRoundsRaw = String(formData.get("total_rounds") || "").trim();
  const durationRaw = String(formData.get("round_duration_hours") || "").trim();
  const startRaw = String(formData.get("game_starts_at") || "").trim();

  if (!classId) {
    return { ok: false, error: "Missing class id." };
  }

  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return {
      ok: false,
      error: `Class name must be ${NAME_MIN}–${NAME_MAX} characters.`,
    };
  }

  const totalRounds = parseInt(totalRoundsRaw, 10);
  if (
    !Number.isFinite(totalRounds) ||
    totalRounds < MIN_ROUNDS ||
    totalRounds > MAX_ROUNDS
  ) {
    return {
      ok: false,
      error: `Rounds must be a whole number between ${MIN_ROUNDS} and ${MAX_ROUNDS}.`,
    };
  }

  const durationHours = parseFloat(durationRaw);
  if (
    !Number.isFinite(durationHours) ||
    !(ALLOWED_DURATION_HOURS as readonly number[]).includes(durationHours)
  ) {
    return {
      ok: false,
      error:
        "Round duration must be one of: 15 min, 30 min, 1 hour, 2 hours, 5 hours, 1 day, 2 days, 1 week.",
    };
  }

  let gameStartsAtIso: string | null = null;
  let startInPast = false;
  if (startRaw.length > 0) {
    const parsed = new Date(startRaw);
    if (isNaN(parsed.getTime())) {
      return { ok: false, error: "Start time isn't a valid date." };
    }
    gameStartsAtIso = parsed.toISOString();
    startInPast = parsed.getTime() < Date.now();
  }

  const { data: updated, error: updErr } = await supabase
    .from("classes")
    .update({
      name,
      total_rounds: totalRounds,
      round_duration_hours: durationHours,
      game_starts_at: gameStartsAtIso,
    })
    .eq("id", classId)
    .eq("teacher_id", user.id)
    .select("id");

  if (updErr) {
    return { ok: false, error: `Could not save settings: ${updErr.message}` };
  }
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: "Class not found or you don't own it.",
    };
  }

  revalidatePath("/teacher/students");

  if (startInPast) {
    return {
      ok: true,
      warning:
        "Start time is in the past — the game is already underway. If that wasn't intentional, edit the start time and save again.",
    };
  }
  return { ok: true };
}

// ── Shared helper: verify teacher + get admin client ──────────────────────

async function getTeacherAdmin(): Promise<
  | { ok: false; error: string }
  | { ok: true; userId: string; admin: ReturnType<typeof createServiceClient> }
> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Server isn't configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign-in expired." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "teacher") {
    return { ok: false, error: "Only teachers can do this." };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: "Server config error." };
  }

  return {
    ok: true,
    userId: user.id,
    admin: createServiceClient(supabaseUrl, serviceKey),
  };
}

// ── Entry ownership verification ──────────────────────────────────────────

// Verify the entry is pending and belongs to a class this teacher owns.
// Also returns student_id, class_id, round_number for the archive step.
async function verifyEntryOwnership(
  admin: ReturnType<typeof createServiceClient>,
  entryId: string,
  teacherId: string,
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      entryClassId: string;
      studentId: string;       // profiles.id = auth user id
      roundNumber: number;
    }
> {
  const { data: entry } = await admin
    .from("entries")
    .select("id, class_id, status, student_id, round_number")
    .eq("id", entryId)
    .maybeSingle();

  if (!entry) return { ok: false, error: "Entry not found." };
  if (entry.status !== "pending") {
    return { ok: false, error: "This entry has already been reviewed." };
  }

  const { data: cls } = await admin
    .from("classes")
    .select("id")
    .eq("id", entry.class_id)
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (!cls) return { ok: false, error: "You don't own this class." };
  return {
    ok: true,
    entryClassId: entry.class_id,
    studentId: entry.student_id,
    roundNumber: entry.round_number,
  };
}

// ── Resolve students.id from profiles.id (auth user id) ───────────────────
//
// teacher_comments.student_id uses students.id, but entries.student_id is
// profiles.id (= auth user id). Different UUIDs — see the TWO-TRACK
// comment in student-archive.ts. This helper bridges the gap:
//   profiles.id → auth.users.email → students.email → students.id
//
// Returns null if the student row can't be found (e.g. seed data with
// fake UUIDs). The caller should silently skip the teacher_comments write
// in that case — the note won't surface, but the approve/reject still
// goes through.
async function resolveStudentsId(
  adminClient: ReturnType<typeof createServiceClient>,
  profilesId: string,
): Promise<string | null> {
  // Step 1: get the auth user's email.
  const { data: authData } = await adminClient.auth.admin.getUserById(profilesId);
  const email = authData?.user?.email;
  if (!email) return null;

  // Step 2: look up the students row by email.
  const { data: studentRow } = await adminClient
    .from("students")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return studentRow?.id ?? null;
}

// ── Write / update teacher comment in teacher_comments ────────────────────
//
// Upserts a teacher_comments row for (student_id, entry_id). If a row
// already exists for this student + entry, the body is updated. Otherwise
// a new row is inserted.
//
// ASSUMPTION: teacher_comments has at minimum these columns:
//   student_id, class_id, entry_id, body, round, created_at
// If the table has additional NOT NULL columns this INSERT may fail —
// the approve/reject action will still succeed; only the note is lost.
// A server-log error will surface the missing column so we can fix it.
async function upsertTeacherComment(
  adminClient: ReturnType<typeof createServiceClient>,
  studentId: string,     // students.id
  classId: string,
  entryId: string,
  roundNumber: number,
  body: string,
): Promise<void> {
  // Check for existing row.
  const { data: existing } = await adminClient
    .from("teacher_comments")
    .select("id")
    .eq("student_id", studentId)
    .eq("entry_id", entryId)
    .maybeSingle();

  if (existing) {
    // Update the existing comment.
    const { error } = await adminClient
      .from("teacher_comments")
      .update({ body })
      .eq("id", existing.id);
    if (error) {
      console.error("[actions] Failed to update teacher_comments:", error.message);
    }
  } else {
    // Insert a new comment.
    const { error } = await adminClient
      .from("teacher_comments")
      .insert({
        student_id: studentId,
        class_id: classId,
        entry_id: entryId,
        round: roundNumber,
        body,
      });
    if (error) {
      console.error("[actions] Failed to insert teacher_comments:", error.message);
    }
  }
}

// ── approveEntry ──────────────────────────────────────────────────────────
//
// #35 T1: Archive any existing live entry for the same student + class +
//         round BEFORE flipping this one to live. Prevents unique-constraint
//         violations on entries_one_live_per_student_class_round.
//
// #35 T2: If a comment is provided, writes it to teacher_comments with
//         entry_id set. The student sees it as "Your teacher said" on
//         their dashboard. Editable later from the student profile page.

export async function approveEntry(
  entryId: string,
  comment?: string,
): Promise<ActionResult> {
  const auth = await getTeacherAdmin();
  if (!auth.ok) return auth;

  const ownership = await verifyEntryOwnership(auth.admin, entryId, auth.userId);
  if (!ownership.ok) return ownership;

  // #35 T1: archive any prior live entry for this student + class + round.
  const { error: archiveErr } = await auth.admin
    .from("entries")
    .update({
      status: "archived",
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("class_id", ownership.entryClassId)
    .eq("student_id", ownership.studentId)
    .eq("round_number", ownership.roundNumber)
    .eq("status", "live")
    .neq("id", entryId);

  if (archiveErr) {
    return { ok: false, error: `Could not archive prior entry: ${archiveErr.message}` };
  }

  // Flip this entry to live.
  const { error: updErr } = await auth.admin
    .from("entries")
    .update({
      status: "live",
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", entryId);

  if (updErr) {
    return { ok: false, error: `Could not approve: ${updErr.message}` };
  }

  // #35 T2: write optional teacher comment to teacher_comments.
  if (comment && comment.trim().length > 0) {
    const studentsId = await resolveStudentsId(auth.admin, ownership.studentId);
    if (studentsId) {
      await upsertTeacherComment(
        auth.admin,
        studentsId,
        ownership.entryClassId,
        entryId,
        ownership.roundNumber,
        comment.trim(),
      );
    } else {
      console.warn(
        `[actions] Could not resolve students.id for profiles.id=${ownership.studentId} — skipping teacher comment write.`,
      );
    }
  }

  revalidatePath("/teacher/students");
  // #40: student dashboard and student-play also read entries.status — must
  // be revalidated so the student sees the new APPROVED/NOT APPROVED state
  // on next page load instead of stale cached data.
  revalidatePath("/student/dashboard");
  revalidatePath("/student/play");
  return { ok: true };
}

// ── rejectEntry ───────────────────────────────────────────────────────────
//
// Sets status to 'rejected'. Writes the reason to BOTH:
//   1. entries.rejection_reason — backward compat for existing data paths
//   2. teacher_comments (with entry_id) — the unified note the student
//      dashboard and student profile page both read from
//
// The student sees the note in a red "NOT APPROVED" context box on their
// dashboard (based on entry status, not which table the text came from).

export async function rejectEntry(
  entryId: string,
  reason: string,
): Promise<ActionResult> {
  if (!reason || reason.trim().length === 0) {
    return { ok: false, error: "Please provide a reason for the rejection." };
  }

  const auth = await getTeacherAdmin();
  if (!auth.ok) return auth;

  const ownership = await verifyEntryOwnership(auth.admin, entryId, auth.userId);
  if (!ownership.ok) return ownership;

  // Set status to rejected + write rejection_reason on entries (backward compat).
  const { error: updErr } = await auth.admin
    .from("entries")
    .update({
      status: "rejected",
      rejection_reason: reason.trim(),
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", entryId);

  if (updErr) {
    return { ok: false, error: `Could not reject: ${updErr.message}` };
  }

  // Also write to teacher_comments — the unified note.
  const studentsId = await resolveStudentsId(auth.admin, ownership.studentId);
  if (studentsId) {
    await upsertTeacherComment(
      auth.admin,
      studentsId,
      ownership.entryClassId,
      entryId,
      ownership.roundNumber,
      reason.trim(),
    );
  } else {
    console.warn(
      `[actions] Could not resolve students.id for profiles.id=${ownership.studentId} — rejection reason saved on entry but not in teacher_comments.`,
    );
  }

  revalidatePath("/teacher/students");
  revalidatePath("/student/dashboard");
  revalidatePath("/student/play");
  return { ok: true };
}

// ── approveFavoriteComment ────────────────────────────────────────────────
//
// #38: Approves a pending favorite comment on a game_session.
//
// Flips favorite_comment_status from 'pending' → 'approved'.
// No teacher_comments write — the approve is a simple status flip.
// If the teacher wants to leave a note for the student, they can do
// it from the student detail page.
//
// game_sessions.student_id is students.id (not profiles.id), written
// by enrollStudent. No resolveStudentsId bridge needed here.

export async function approveFavoriteComment(
  sessionId: string,
): Promise<ActionResult> {
  const auth = await getTeacherAdmin();
  if (!auth.ok) return auth;

  // Load the session and verify it's pending.
  const { data: session } = await auth.admin
    .from("game_sessions")
    .select("id, class_id, favorite_comment_status")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { ok: false, error: "Session not found." };
  if (session.favorite_comment_status !== "pending") {
    return { ok: false, error: "This favorite comment has already been reviewed." };
  }

  // Verify teacher owns the class.
  const { data: cls } = await auth.admin
    .from("classes")
    .select("id")
    .eq("id", session.class_id)
    .eq("teacher_id", auth.userId)
    .maybeSingle();
  if (!cls) return { ok: false, error: "You don't own this class." };

  // Flip to approved.
  const { error: updErr } = await auth.admin
    .from("game_sessions")
    .update({
      favorite_comment_status: "approved",
      favorite_comment_reviewed_by: auth.userId,
      favorite_comment_reviewed_at: new Date().toISOString(),
    })
    .eq("id", session.id);

  if (updErr) {
    return { ok: false, error: `Could not approve: ${updErr.message}` };
  }

  revalidatePath("/teacher/students");
  revalidatePath("/student/dashboard");
  revalidatePath("/student/play");
  return { ok: true };
}

// ── rejectFavoriteComment ─────────────────────────────────────────────────
//
// #38: Rejects a pending favorite comment on a game_session.
//
// Flips favorite_comment_status from 'pending' → 'rejected' and stores
// the reason in favorite_comment_rejection_reason. The student sees this
// on their dashboard and can edit + resubmit their favorite comment,
// which resets the status back to 'pending'.

export async function rejectFavoriteComment(
  sessionId: string,
  reason: string,
): Promise<ActionResult> {
  if (!reason || reason.trim().length === 0) {
    return { ok: false, error: "Please provide a reason for the rejection." };
  }

  const auth = await getTeacherAdmin();
  if (!auth.ok) return auth;

  // Load the session and verify it's pending.
  const { data: session } = await auth.admin
    .from("game_sessions")
    .select("id, class_id, favorite_comment_status")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { ok: false, error: "Session not found." };
  if (session.favorite_comment_status !== "pending") {
    return { ok: false, error: "This favorite comment has already been reviewed." };
  }

  // Verify teacher owns the class.
  const { data: cls } = await auth.admin
    .from("classes")
    .select("id")
    .eq("id", session.class_id)
    .eq("teacher_id", auth.userId)
    .maybeSingle();
  if (!cls) return { ok: false, error: "You don't own this class." };

  // Flip to rejected + store reason.
  const { error: updErr } = await auth.admin
    .from("game_sessions")
    .update({
      favorite_comment_status: "rejected",
      favorite_comment_rejection_reason: reason.trim(),
      favorite_comment_reviewed_by: auth.userId,
      favorite_comment_reviewed_at: new Date().toISOString(),
    })
    .eq("id", session.id);

  if (updErr) {
    return { ok: false, error: `Could not reject: ${updErr.message}` };
  }

  revalidatePath("/teacher/students");
  revalidatePath("/student/dashboard");
  revalidatePath("/student/play");
  return { ok: true };
}
