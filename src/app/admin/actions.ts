// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/admin/actions.ts   (REPLACES existing file)
//
// Session 96: Cleanup — removed updateMaxClasses, updateWarmupMode,
//   and saveGameSchedule.
// Session 98: Removed rotation actions (addToRotation, removeFromRotation,
//   setRotationStatus, moveInRotation) and updateAppMode. The rotation
//   queue concept is gone — multi-teacher coordination happens via
//   /teacher/multi where teachers self-organize into games.
//
// Remaining actions:
//   - togglePhotoActive — approve/reject warm-up photos
//   - archiveTeacher / unarchiveTeacher
//   - approveClassRequest / denyClassRequest
//   - addTopic / updateTopicText / deleteTopic / setTopicStatus
//   - archiveClass / unarchiveClass
//   - postScheduleMessage — teacher coordination thread
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

// ─────────────────────────────────────────────────────────────────────────
// Toggle is_active on a warm-up deck photo + send notification
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
  const teacherId = entry.student_id;
  const descSnippet = entry.description_text
    ? entry.description_text.slice(0, 60) + (entry.description_text.length > 60 ? "…" : "")
    : "your warm-up photo";

  if (active) {
    await supabase.from("notifications").insert({
      sender_id: userId,
      recipient_id: teacherId,
      class_id: entry.class_id,
      note_type: "entry_approved",
      body: `Your warm-up photo "${descSnippet}" has been approved.`,
    });
  } else if (note && note.trim().length > 0) {
    await supabase.from("notifications").insert({
      sender_id: userId,
      recipient_id: teacherId,
      class_id: entry.class_id,
      note_type: "entry_rejected",
      body: note.trim().slice(0, 500),
    });
  }

  revalidatePath("/admin");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Teacher archiving
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
// Class request workflow
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

  const capacity = capacityOverride ?? req.requested_capacity ?? 9;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
    return { ok: false, error: "Invalid capacity value." };
  }

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
// Game topic management
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
// Class archiving (admin)
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

  // Chunk K: also archive messages associated with this class
  await supabase
    .from("messages")
    .update({ is_archived: true })
    .eq("class_id", classId);

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

  // Chunk K: also restore archived messages for this class
  await supabase
    .from("messages")
    .update({ is_archived: false })
    .eq("class_id", classId);

  revalidatePath("/admin");
  revalidatePath("/teacher/students");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Topic status management
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

// ─────────────────────────────────────────────────────────────────────────
// Teacher coordination thread messaging
// ─────────────────────────────────────────────────────────────────────────

export async function postScheduleMessage(
  body: string,
): Promise<ActionResult> {
  const { error, supabase, userId } = await requireAdmin();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  const trimmed = body.trim();
  if (trimmed.length === 0) return { ok: false, error: "Message cannot be empty." };
  if (trimmed.length > 500) return { ok: false, error: "Message too long (500 char max)." };

  // Send to all teachers (not just rotation queue — all active teachers)
  const { data: teachers } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "teacher")
    .neq("id", userId);

  if (!teachers || teachers.length === 0) {
    return { ok: false, error: "No teachers to message." };
  }

  const inserts = teachers.map((t) => ({
    sender_id: userId,
    recipient_id: t.id,
    body: trimmed,
    thread_context: "schedule",
    is_read: false,
  }));

  const { error: insErr } = await supabase.from("messages").insert(inserts);
  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath("/admin");
  return { ok: true };
}
