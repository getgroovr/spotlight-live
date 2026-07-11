// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/actions.ts   (REPLACES existing)
//
// Server actions for the teacher students page:
//
//   1. saveClassSettings       — class management header (slice 1, step 3)
//   2. approveEntry            — approve a pending student submission
//   3. rejectEntry             — reject a pending submission with a reason
//   4. approveFavoriteComment  — #38: approve a pending favorite comment
//   5. rejectFavoriteComment   — #38: reject a pending favorite comment
//   6. suggestTopic            — session 78: teacher suggests a game topic
//   7. createClassDirect       — M1: standard mode direct class creation
//   8. deleteGameTopic         — M1: standard mode direct topic deletion
//
// Session 78: saveClassSettings now reads round_topics from formData.
// Session 79: suggestTopic inserts with status='approved'.
// Session 84: Chunk D1 —
//   - saveClassSettings now reads game_phase_hours + review_phase_hours,
//     computes round_duration_hours as the sum.
//   - ALLOWED_DURATION_HOURS expanded for new preset values.
//   - approveEntry + approveFavoriteComment include auto-advance trigger:
//     after approving, if no pending items remain for that class's current
//     round, update games.current_round_phase to 'game' (advance).
// Session 86: Chunk M1 —
//   - createClassDirect: standard mode, teacher creates class directly
//     (no request→admin flow). Inserts into classes + creates a game row.
//   - deleteGameTopic: standard mode, teacher deletes a topic directly.
//   - suggestTopic: label updated but behavior unchanged (already inserts
//     as approved). In standard mode this is "Add a topic".
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { ActionResult } from "@/app/play/actions";

// ── saveClassSettings ─────────────────────────────────────────────────────

// D1: expanded to cover all preset values in the game/review dropdowns
const ALLOWED_DURATION_HOURS = [0, 0.25, 0.5, 1, 1.5, 2, 5, 22, 24, 46, 48, 144, 168] as const;
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
  const startRaw = String(formData.get("game_starts_at") || "").trim();
  const roundTopicsRaw = String(formData.get("round_topics") || "").trim();

  // D1: read game/review phase hours
  const gamePhaseRaw = String(formData.get("game_phase_hours") || "").trim();
  const reviewPhaseRaw = String(formData.get("review_phase_hours") || "").trim();

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

  // D1: parse game and review phase hours
  const gamePhaseHours = parseFloat(gamePhaseRaw);
  const reviewPhaseHours = parseFloat(reviewPhaseRaw);

  if (
    !Number.isFinite(gamePhaseHours) ||
    !(ALLOWED_DURATION_HOURS as readonly number[]).includes(gamePhaseHours) ||
    gamePhaseHours <= 0
  ) {
    return {
      ok: false,
      error: "Game time must be one of the preset values.",
    };
  }

  if (
    !Number.isFinite(reviewPhaseHours) ||
    !(ALLOWED_DURATION_HOURS as readonly number[]).includes(reviewPhaseHours)
  ) {
    return {
      ok: false,
      error: "Review time must be one of the preset values.",
    };
  }

  // Compute total round duration for backward compatibility
  const durationHours = gamePhaseHours + reviewPhaseHours;

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

  // ── Parse round_topics (session 78) ───────────────────────────────────
  let roundTopics: Record<string, string | null> | null = null;
  if (roundTopicsRaw) {
    try {
      const parsed = JSON.parse(roundTopicsRaw);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        roundTopics = {};
        for (const [key, val] of Object.entries(parsed)) {
          const roundNum = parseInt(key, 10);
          if (Number.isFinite(roundNum) && roundNum >= 1 && roundNum <= totalRounds) {
            roundTopics[key] = typeof val === "string" && val.trim() ? val.trim() : null;
          }
        }
      }
    } catch {
      // Malformed JSON — ignore, save null
    }
  }

  const { data: updated, error: updErr } = await supabase
    .from("classes")
    .update({
      name,
      total_rounds: totalRounds,
      round_duration_hours: durationHours,
      game_phase_hours: gamePhaseHours,
      review_phase_hours: reviewPhaseHours,
      game_starts_at: gameStartsAtIso,
      round_topics: roundTopics,
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

// ── suggestTopic (session 78, updated session 79) ─────────────────────────
// In standard mode this is called "Add a topic" (UI label only — behavior
// is the same: inserts with status='approved').

export async function suggestTopic(
  topicText: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Server isn't configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign-in expired." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, display_name, username")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "teacher") {
    return { ok: false, error: "Only teachers can suggest topics." };
  }

  const text = topicText.trim();
  if (!text || text.length < 2 || text.length > 80) {
    return { ok: false, error: "Topic must be 2–80 characters." };
  }

  // Use service client to bypass RLS for the insert
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: "Server config error." };
  }
  const admin = createServiceClient(supabaseUrl, serviceKey);

  const { error: insErr } = await admin
    .from("game_topics")
    .insert({
      topic_text: text,
      status: "approved",
      suggested_by: user.id,
    });

  if (insErr) {
    if (insErr.message.includes("duplicate") || insErr.message.includes("unique")) {
      return { ok: false, error: "That topic already exists." };
    }
    return { ok: false, error: `Could not save: ${insErr.message}` };
  }

  // ── Notify admin(s) (only in multi mode — harmless in standard) ─────
  const teacherName = profile.display_name || profile.username || "A teacher";
  const { data: admins } = await admin
    .from("profiles")
    .select("id")
    .eq("is_admin", true);

  if (admins && admins.length > 0) {
    const notifications = admins.map((a) => ({
      sender_id: user.id,
      recipient_id: a.id,
      note_type: "topic_created",
      body: `${teacherName} created a custom topic: "${text}"`,
    }));
    await admin.from("notifications").insert(notifications);
  }

  return { ok: true };
}

// ── M1: deleteGameTopic (standard mode direct topic deletion) ─────────────

export async function deleteGameTopic(
  topicId: string,
): Promise<ActionResult> {
  const auth = await getTeacherAdmin();
  if (!auth.ok) return auth;

  if (!topicId) return { ok: false, error: "Missing topic id." };

  // Verify topic exists
  const { data: topic } = await auth.admin
    .from("game_topics")
    .select("id, suggested_by")
    .eq("id", topicId)
    .maybeSingle();

  if (!topic) return { ok: false, error: "Topic not found." };

  // Delete the topic
  const { error: delErr } = await auth.admin
    .from("game_topics")
    .delete()
    .eq("id", topicId);

  if (delErr) {
    return { ok: false, error: `Could not delete: ${delErr.message}` };
  }

  revalidatePath("/teacher/students");
  return { ok: true };
}

// ── M1: createClassDirect (standard mode) ─────────────────────────────────
// In standard mode the teacher creates a class directly — no request→admin
// approval flow. Inserts into `classes` and creates a `games` row.

const ALLOWED_CAPACITIES = [9, 16, 25] as const;

export async function createClassDirect(
  className: string,
  capacity: number,
): Promise<ActionResult> {
  const auth = await getTeacherAdmin();
  if (!auth.ok) return auth;

  const name = className.trim();
  if (!name || name.length < 1 || name.length > 100) {
    return { ok: false, error: "Class name must be 1–100 characters." };
  }

  if (!(ALLOWED_CAPACITIES as readonly number[]).includes(capacity)) {
    return { ok: false, error: "Invalid class size." };
  }

  // Insert the class
  const { data: newClass, error: clsErr } = await auth.admin
    .from("classes")
    .insert({
      teacher_id: auth.userId,
      name,
      capacity,
      is_archived: false,
    })
    .select("id")
    .single();

  if (clsErr) {
    return { ok: false, error: `Could not create class: ${clsErr.message}` };
  }

  // Create a game row for this class (status: pending until teacher sets schedule)
  const { error: gameErr } = await auth.admin
    .from("games")
    .insert({
      class_id: newClass.id,
      name: `${name} Game`,
      status: "pending",
      current_round_phase: "game",
    });

  if (gameErr) {
    console.error(`[createClassDirect] Could not create game row: ${gameErr.message}`);
    // Non-fatal — class is created, game can be created later
  }

  revalidatePath("/teacher/students");
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

async function verifyEntryOwnership(
  admin: ReturnType<typeof createServiceClient>,
  entryId: string,
  teacherId: string,
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      entryClassId: string;
      studentId: string;
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

async function resolveStudentsId(
  adminClient: ReturnType<typeof createServiceClient>,
  profilesId: string,
): Promise<string | null> {
  const { data: authData } = await adminClient.auth.admin.getUserById(profilesId);
  const email = authData?.user?.email;
  if (!email) return null;

  const { data: studentRow } = await adminClient
    .from("students")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return studentRow?.id ?? null;
}

// ── Write / update teacher comment in teacher_comments ────────────────────

async function upsertTeacherComment(
  adminClient: ReturnType<typeof createServiceClient>,
  studentId: string,
  classId: string,
  entryId: string,
  roundNumber: number,
  body: string,
): Promise<void> {
  const { data: existing } = await adminClient
    .from("teacher_comments")
    .select("id")
    .eq("student_id", studentId)
    .eq("entry_id", entryId)
    .maybeSingle();

  if (existing) {
    const { error } = await adminClient
      .from("teacher_comments")
      .update({ body })
      .eq("id", existing.id);
    if (error) {
      console.error("[actions] Failed to update teacher_comments:", error.message);
    }
  } else {
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

// ─────────────────────────────────────────────────────────────────────────
// D1: Auto-advance helper
//
// After approving an entry or favorite comment, check if there are any
// remaining pending items for this class in the given round. If none
// remain, update games.current_round_phase to 'game' — signaling that
// the review is complete and the next round can begin.
//
// For the FINAL round (round === total_rounds), this signals that the
// awards ceremony is ready instead.
// ─────────────────────────────────────────────────────────────────────────

async function checkAutoAdvance(
  adminClient: ReturnType<typeof createServiceClient>,
  classId: string,
  roundNumber: number,
): Promise<void> {
  // Count remaining pending entries for this class + round
  const { count: pendingEntries } = await adminClient
    .from("entries")
    .select("id", { count: "exact", head: true })
    .eq("class_id", classId)
    .eq("round_number", roundNumber)
    .eq("status", "pending")
    .eq("is_starter", false);

  // Count remaining pending favorite comments for this class + round
  const { count: pendingComments } = await adminClient
    .from("game_sessions")
    .select("id", { count: "exact", head: true })
    .eq("class_id", classId)
    .eq("round", roundNumber)
    .eq("favorite_comment_status", "pending");

  const totalPending = (pendingEntries ?? 0) + (pendingComments ?? 0);

  if (totalPending === 0) {
    // All items approved for this round — advance.
    // Find the game for this class.
    const { data: game } = await adminClient
      .from("games")
      .select("id, class_id, status")
      .eq("class_id", classId)
      .in("status", ["active", "pending"])
      .maybeSingle();

    if (game) {
      // Set phase back to 'game' — signals next round is open
      await adminClient
        .from("games")
        .update({ current_round_phase: "game" })
        .eq("id", game.id);

      console.log(
        `[auto-advance] Round ${roundNumber} review complete for class ${classId}. ` +
        `Game ${game.id} phase set to 'game'.`,
      );
    }
  }
}

// ── approveEntry ──────────────────────────────────────────────────────────

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

  // D1: check auto-advance after approving
  await checkAutoAdvance(auth.admin, ownership.entryClassId, ownership.roundNumber);

  revalidatePath("/teacher/students");
  revalidatePath("/student/dashboard");
  revalidatePath("/student/play");
  return { ok: true };
}

// ── rejectEntry ───────────────────────────────────────────────────────────

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

export async function approveFavoriteComment(
  sessionId: string,
): Promise<ActionResult> {
  const auth = await getTeacherAdmin();
  if (!auth.ok) return auth;

  const { data: session } = await auth.admin
    .from("game_sessions")
    .select("id, class_id, round, favorite_comment_status")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { ok: false, error: "Session not found." };
  if (session.favorite_comment_status !== "pending") {
    return { ok: false, error: "This favorite comment has already been reviewed." };
  }

  const { data: cls } = await auth.admin
    .from("classes")
    .select("id")
    .eq("id", session.class_id)
    .eq("teacher_id", auth.userId)
    .maybeSingle();
  if (!cls) return { ok: false, error: "You don't own this class." };

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

  // D1: check auto-advance after approving
  await checkAutoAdvance(auth.admin, session.class_id, session.round);

  revalidatePath("/teacher/students");
  revalidatePath("/student/dashboard");
  revalidatePath("/student/play");
  return { ok: true };
}

// ── rejectFavoriteComment ─────────────────────────────────────────────────

export async function rejectFavoriteComment(
  sessionId: string,
  reason: string,
): Promise<ActionResult> {
  if (!reason || reason.trim().length === 0) {
    return { ok: false, error: "Please provide a reason for the rejection." };
  }

  const auth = await getTeacherAdmin();
  if (!auth.ok) return auth;

  const { data: session } = await auth.admin
    .from("game_sessions")
    .select("id, class_id, favorite_comment_status")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { ok: false, error: "Session not found." };
  if (session.favorite_comment_status !== "pending") {
    return { ok: false, error: "This favorite comment has already been reviewed." };
  }

  const { data: cls } = await auth.admin
    .from("classes")
    .select("id")
    .eq("id", session.class_id)
    .eq("teacher_id", auth.userId)
    .maybeSingle();
  if (!cls) return { ok: false, error: "You don't own this class." };

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

// ── archiveClass (session 79) ────────────────────────────────────────────

export async function archiveClass(
  classId: string,
): Promise<ActionResult> {
  const auth = await getTeacherAdmin();
  if (!auth.ok) return auth;

  const { data: cls } = await auth.admin
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("teacher_id", auth.userId)
    .maybeSingle();
  if (!cls) return { ok: false, error: "Class not found or you don't own it." };

  const { error: updErr } = await auth.admin
    .from("classes")
    .update({ is_archived: true, archived_at: new Date().toISOString() })
    .eq("id", classId);

  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/teacher/students");
  revalidatePath("/admin");
  return { ok: true };
}

// ── unarchiveClass (session 79) ──────────────────────────────────────────

export async function unarchiveClass(
  classId: string,
): Promise<ActionResult> {
  const auth = await getTeacherAdmin();
  if (!auth.ok) return auth;

  const { data: cls } = await auth.admin
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("teacher_id", auth.userId)
    .maybeSingle();
  if (!cls) return { ok: false, error: "Class not found or you don't own it." };

  const { error: updErr } = await auth.admin
    .from("classes")
    .update({ is_archived: false, archived_at: null })
    .eq("id", classId);

  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/teacher/students");
  revalidatePath("/admin");
  return { ok: true };
}
