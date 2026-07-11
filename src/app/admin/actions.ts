// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/admin/actions.ts   (REPLACES existing file)
//
// Session 67 rebuild. Every action checks is_admin boolean (not role).
// RLS enforces at DB layer too via is_admin() function.
//
// Session 71: Added archiveTeacher and unarchiveTeacher.
// Session 74: Added approveClassRequest and denyClassRequest (C4).
// Session 75: togglePhotoActive now accepts optional note and inserts
//   a notification row so the teacher sees approval/rejection feedback.
// Session 79: Chunk 3 — addTopic, updateTopicText, deleteTopic for
//   admin game-topic management.
// Session 80: saveGameSchedule — admin sets game schedule (rounds,
//   duration, start time, topics) and pushes to all active classes.
//   Only meaningful when warmup_teacher_count > 1.
// Session 82: Chunk C — approveClassRequest now uses requested class_name
//   and requested_capacity. Admin can override capacity before approving.
// Session 84: Chunk D1 — saveGameSchedule now handles game_phase_hours
//   and review_phase_hours. round_duration_hours is computed as the sum.
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

// ── Auth helper ─────────────────────────────────────────────────────────
async function requireAdmin() {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not configured.", supabase: null, userId: null };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in.", supabase: null, userId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, is_admin")
    .eq("id", user.id)
    .single();
  if (!profile || !profile.is_admin) {
    return { error: "Admin access required.", supabase: null, userId: null };
  }

  return { error: null, supabase, userId: user.id };
}

// ── Update a teacher's max_classes limit ────────────────────────────────
export async function updateMaxClasses(
  teacherId: string,
  maxClasses: number,
): Promise<ActionResult> {
  const { error, supabase } = await requireAdmin();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  if (!Number.isInteger(maxClasses) || maxClasses < 1 || maxClasses > 50) {
    return { ok: false, error: "Max classes must be between 1 and 50." };
  }

  const { error: updErr } = await supabase
    .from("profiles")
    .update({ max_classes: maxClasses })
    .eq("id", teacherId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/admin");
  return { ok: true };
}

// ── Add a teacher to the rotation queue ─────────────────────────────────
export async function addToRotation(teacherId: string): Promise<ActionResult> {
  const { error, supabase } = await requireAdmin();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  const { data: rows } = await supabase
    .from("teacher_rotation")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder = rows && rows.length > 0 ? rows[0].sort_order + 1 : 0;

  const { error: insErr } = await supabase
    .from("teacher_rotation")
    .insert({ teacher_id: teacherId, sort_order: nextOrder, status: "waiting" });
  if (insErr) {
    if (insErr.message.includes("duplicate") || insErr.message.includes("unique")) {
      return { ok: false, error: "Teacher is already in the rotation." };
    }
    return { ok: false, error: insErr.message };
  }

  revalidatePath("/admin");
  return { ok: true };
}

// ── Remove a teacher from rotation ──────────────────────────────────────
export async function removeFromRotation(teacherId: string): Promise<ActionResult> {
  const { error, supabase } = await requireAdmin();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  const { error: delErr } = await supabase
    .from("teacher_rotation")
    .delete()
    .eq("teacher_id", teacherId);
  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath("/admin");
  return { ok: true };
}

// ── Set rotation status (recruiting / waiting / paused) ─────────────────
export async function setRotationStatus(
  teacherId: string,
  status: "recruiting" | "waiting" | "paused",
): Promise<ActionResult> {
  const { error, supabase } = await requireAdmin();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  // Only one teacher recruits at a time (MVP)
  if (status === "recruiting") {
    const { error: clearErr } = await supabase
      .from("teacher_rotation")
      .update({ status: "waiting" })
      .eq("status", "recruiting");
    if (clearErr) return { ok: false, error: clearErr.message };
  }

  const { error: updErr } = await supabase
    .from("teacher_rotation")
    .update({ status })
    .eq("teacher_id", teacherId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/admin");
  return { ok: true };
}

// ── Move a teacher up or down in the rotation order ─────────────────────
export async function moveInRotation(
  teacherId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const { error, supabase } = await requireAdmin();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  const { data: rows, error: fetchErr } = await supabase
    .from("teacher_rotation")
    .select("id, teacher_id, sort_order")
    .order("sort_order", { ascending: true });
  if (fetchErr || !rows) return { ok: false, error: fetchErr?.message || "Fetch failed." };

  const idx = rows.findIndex((r) => r.teacher_id === teacherId);
  if (idx === -1) return { ok: false, error: "Teacher not in rotation." };

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rows.length) {
    return { ok: false, error: `Already at the ${direction === "up" ? "top" : "bottom"}.` };
  }

  const a = rows[idx];
  const b = rows[swapIdx];

  const { error: e1 } = await supabase
    .from("teacher_rotation")
    .update({ sort_order: b.sort_order })
    .eq("id", a.id);
  if (e1) return { ok: false, error: e1.message };

  const { error: e2 } = await supabase
    .from("teacher_rotation")
    .update({ sort_order: a.sort_order })
    .eq("id", b.id);
  if (e2) return { ok: false, error: e2.message };

  revalidatePath("/admin");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Toggle is_active on a warm-up deck photo + send notification
//
// Session 75: Now accepts an optional note (for rejection feedback).
// Inserts a row into the notifications table so the teacher sees it
// on their dashboard.
//
//   active=true  → "entry_approved" notification (auto-message)
//   active=false + note → "entry_rejected" notification (with note)
//   active=false, no note → silent deactivation (no notification)
// ─────────────────────────────────────────────────────────────────────────
export async function togglePhotoActive(
  entryId: string,
  active: boolean,
  note?: string,
): Promise<ActionResult> {
  const { error, supabase, userId } = await requireAdmin();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  // Fetch the entry to get the teacher's user ID + class context
  const { data: entry } = await supabase
    .from("entries")
    .select("id, student_id, class_id, description_text")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { ok: false, error: "Entry not found." };

  const { error: updErr } = await supabase
    .from("entries")
    .update({ is_active: active })
    .eq("id", entryId);
  if (updErr) return { ok: false, error: updErr.message };

  // ── Send notification to the teacher ─────────────────────────────
  // entry.student_id is the teacher's auth user ID for starters.
  const teacherId = entry.student_id;
  const descSnippet = entry.description_text
    ? entry.description_text.slice(0, 60) + (entry.description_text.length > 60 ? "…" : "")
    : "your warm-up photo";

  if (active) {
    // Approved — auto-message
    await supabase.from("notifications").insert({
      sender_id: userId,
      recipient_id: teacherId,
      class_id: entry.class_id,
      note_type: "entry_approved",
      body: `Your warm-up photo "${descSnippet}" has been approved.`,
    });
  } else if (note && note.trim().length > 0) {
    // Rejected with a note
    await supabase.from("notifications").insert({
      sender_id: userId,
      recipient_id: teacherId,
      class_id: entry.class_id,
      note_type: "entry_rejected",
      body: note.trim().slice(0, 500),
    });
  }
  // If deactivating without a note, no notification (silent revoke)

  revalidatePath("/admin");
  return { ok: true };
}

// ── Update warmup mode (1 / 3 / 9 teachers) ────────────────────────────
export async function updateWarmupMode(
  count: number,
): Promise<ActionResult> {
  const { error, supabase } = await requireAdmin();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  if (![1, 3, 9].includes(count)) {
    return { ok: false, error: "Warmup teacher count must be 1, 3, or 9." };
  }

  const { error: updErr } = await supabase
    .from("admin_settings")
    .update({ warmup_teacher_count: count, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/admin");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Session 80 + Session 84 Chunk D1: Admin game schedule
//
// In multi-teacher mode (warmup_teacher_count > 1), the admin sets the
// game schedule centrally. On save the values are stored in admin_settings
// AND pushed to every active (non-archived) class.
//
// D1: Now handles game_phase_hours and review_phase_hours instead of a
// single round_duration_hours. round_duration_hours is computed as the
// sum of the two phases for backward compatibility with existing round
// timing logic.
// ─────────────────────────────────────────────────────────────────────────

export async function saveGameSchedule(
  fd: FormData,
): Promise<ActionResult> {
  const { error, supabase } = await requireAdmin();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  const totalRounds = parseInt(fd.get("total_rounds") as string, 10);
  if (!Number.isFinite(totalRounds) || totalRounds < 1 || totalRounds > 100) {
    return { ok: false, error: "Rounds must be between 1 and 100." };
  }

  // D1: parse game phase and review phase separately
  const gamePhaseStr = fd.get("game_phase_hours") as string;
  const reviewPhaseStr = fd.get("review_phase_hours") as string;
  const gamePhaseHours = parseFloat(gamePhaseStr);
  const reviewPhaseHours = parseFloat(reviewPhaseStr);

  if (!Number.isFinite(gamePhaseHours) || gamePhaseHours <= 0) {
    return { ok: false, error: "Invalid game time." };
  }
  if (!Number.isFinite(reviewPhaseHours) || reviewPhaseHours < 0) {
    return { ok: false, error: "Invalid review time." };
  }

  // Compute total round duration for backward compatibility
  const roundDurationHours = gamePhaseHours + reviewPhaseHours;

  const startsAtRaw = fd.get("game_starts_at") as string;
  let gameStartsAt: string | null = null;
  if (startsAtRaw) {
    const d = new Date(startsAtRaw);
    if (!isNaN(d.getTime())) {
      gameStartsAt = d.toISOString();
    }
  }

  const roundTopicsRaw = fd.get("round_topics") as string;
  let gameRoundTopics: Record<string, string | null> | null = null;
  if (roundTopicsRaw) {
    try {
      gameRoundTopics = JSON.parse(roundTopicsRaw);
    } catch {
      // ignore bad JSON
    }
  }

  // 1. Save to admin_settings
  const { error: settErr } = await supabase
    .from("admin_settings")
    .update({
      game_total_rounds: totalRounds,
      game_round_duration_hours: roundDurationHours,
      game_phase_hours: gamePhaseHours,
      review_phase_hours: reviewPhaseHours,
      game_starts_at: gameStartsAt,
      game_round_topics: gameRoundTopics,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (settErr) return { ok: false, error: settErr.message };

  // 2. Push to all active (non-archived) classes
  const { error: pushErr } = await supabase
    .from("classes")
    .update({
      total_rounds: totalRounds,
      round_duration_hours: roundDurationHours,
      game_phase_hours: gamePhaseHours,
      review_phase_hours: reviewPhaseHours,
      game_starts_at: gameStartsAt,
      round_topics: gameRoundTopics,
    })
    .eq("is_archived", false);
  if (pushErr) return { ok: false, error: `Saved settings but failed to push to classes: ${pushErr.message}` };

  revalidatePath("/admin");
  revalidatePath("/teacher/students");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Session 71: Teacher archiving
// ─────────────────────────────────────────────────────────────────────────

export async function archiveTeacher(
  teacherId: string,
): Promise<ActionResult> {
  const { error, supabase } = await requireAdmin();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  const { error: archiveError } = await supabase
    .from("profiles")
    .update({ is_archived: true })
    .eq("id", teacherId);

  if (archiveError) {
    return { ok: false, error: archiveError.message };
  }

  await supabase
    .from("teacher_rotation")
    .delete()
    .eq("teacher_id", teacherId);

  revalidatePath("/admin");
  return { ok: true };
}

export async function unarchiveTeacher(
  teacherId: string,
): Promise<ActionResult> {
  const { error, supabase } = await requireAdmin();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  const { error: updErr } = await supabase
    .from("profiles")
    .update({ is_archived: false })
    .eq("id", teacherId);

  if (updErr) {
    return { ok: false, error: updErr.message };
  }

  revalidatePath("/admin");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Session 74 + Session 82 Chunk C: Class request workflow
//
// approveClassRequest now:
//   - Reads class_name from the request (falls back to "Class N")
//   - Reads requested_capacity from the request (falls back to 9)
//   - Accepts optional capacityOverride so admin can change the size
//   - Uses the requested class_name as the created class name
// ─────────────────────────────────────────────────────────────────────────

export async function approveClassRequest(
  requestId: string,
  capacityOverride?: number,
): Promise<ActionResult> {
  const { error, supabase, userId } = await requireAdmin();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  const { data: req } = await supabase
    .from("class_requests")
    .select("id, teacher_id, status, class_name, requested_capacity")
    .eq("id", requestId)
    .single();

  if (!req) return { ok: false, error: "Request not found." };
  if (req.status !== "pending") {
    return { ok: false, error: "Request is no longer pending." };
  }

  // Determine capacity: admin override > teacher request > default 9
  const capacity = capacityOverride ?? req.requested_capacity ?? 9;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
    return { ok: false, error: "Invalid capacity value." };
  }

  // Determine class name: use teacher's requested name, fall back to "Class N"
  let className = req.class_name?.trim();
  if (!className) {
    const { data: existingClasses } = await supabase
      .from("classes")
      .select("id")
      .eq("teacher_id", req.teacher_id);
    const classNumber = (existingClasses?.length || 0) + 1;
    className = `Class ${classNumber}`;
  }

  const { data: newClass, error: classErr } = await supabase
    .from("classes")
    .insert({
      teacher_id: req.teacher_id,
      name: className,
      capacity,
    })
    .select("id")
    .single();

  if (classErr || !newClass) {
    return { ok: false, error: classErr?.message || "Failed to create class." };
  }

  const { error: updErr } = await supabase
    .from("class_requests")
    .update({
      status: "approved",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      created_class_id: newClass.id,
    })
    .eq("id", requestId);

  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/admin");
  return { ok: true };
}

export async function denyClassRequest(
  requestId: string,
): Promise<ActionResult> {
  const { error, supabase, userId } = await requireAdmin();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  const { error: updErr } = await supabase
    .from("class_requests")
    .update({
      status: "denied",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "pending");

  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/admin");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Session 79: Game topic management (Chunk 3)
//
//   addTopic       — admin creates a new global (seeded) topic
//   updateTopicText — admin edits topic text
//   deleteTopic    — admin removes a topic (seeded or teacher-created)
// ─────────────────────────────────────────────────────────────────────────

export async function addTopic(
  topicText: string,
): Promise<ActionResult> {
  const { error, supabase } = await requireAdmin();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  const trimmed = topicText.trim();
  if (trimmed.length === 0) return { ok: false, error: "Topic text cannot be empty." };
  if (trimmed.length > 100) return { ok: false, error: "Topic text must be 100 characters or less." };

  const { error: insErr } = await supabase
    .from("game_topics")
    .insert({ topic_text: trimmed, status: "approved", suggested_by: null });

  if (insErr) {
    if (insErr.message.includes("duplicate") || insErr.message.includes("unique")) {
      return { ok: false, error: "That topic already exists." };
    }
    return { ok: false, error: insErr.message };
  }

  revalidatePath("/admin");
  return { ok: true };
}

export async function updateTopicText(
  topicId: string,
  newText: string,
): Promise<ActionResult> {
  const { error, supabase } = await requireAdmin();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  const trimmed = newText.trim();
  if (trimmed.length === 0) return { ok: false, error: "Topic text cannot be empty." };
  if (trimmed.length > 100) return { ok: false, error: "Topic text must be 100 characters or less." };

  const { error: updErr } = await supabase
    .from("game_topics")
    .update({ topic_text: trimmed })
    .eq("id", topicId);

  if (updErr) {
    if (updErr.message.includes("duplicate") || updErr.message.includes("unique")) {
      return { ok: false, error: "That topic already exists." };
    }
    return { ok: false, error: updErr.message };
  }

  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteTopic(
  topicId: string,
): Promise<ActionResult> {
  const { error, supabase } = await requireAdmin();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  const { error: delErr } = await supabase
    .from("game_topics")
    .delete()
    .eq("id", topicId);

  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath("/admin");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Session 79: Class archiving (admin)
//
// Admin can archive or unarchive any class regardless of ownership.
// ─────────────────────────────────────────────────────────────────────────

export async function archiveClass(
  classId: string,
): Promise<ActionResult> {
  const { error, supabase } = await requireAdmin();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  const { error: updErr } = await supabase
    .from("classes")
    .update({ is_archived: true, archived_at: new Date().toISOString() })
    .eq("id", classId);

  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/admin");
  revalidatePath("/teacher/students");
  return { ok: true };
}

export async function unarchiveClass(
  classId: string,
): Promise<ActionResult> {
  const { error, supabase } = await requireAdmin();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  const { error: updErr } = await supabase
    .from("classes")
    .update({ is_archived: false, archived_at: null })
    .eq("id", classId);

  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/admin");
  revalidatePath("/teacher/students");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Session 82 Chunk E: Topic status management
//
// Admin can approve or deny teacher-submitted topics.
// ─────────────────────────────────────────────────────────────────────────

export async function setTopicStatus(
  topicId: string,
  status: "approved" | "pending",
): Promise<ActionResult> {
  const { error, supabase } = await requireAdmin();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  const { error: updErr } = await supabase
    .from("game_topics")
    .update({ status })
    .eq("id", topicId);

  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/admin");
  return { ok: true };
}
