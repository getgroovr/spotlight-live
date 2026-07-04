// ─────────────────────────────────────────────────────────────────────────
// src/app/admin/actions.ts — Server Actions for the admin dashboard
//
// Session 67 rebuild. Every action checks is_admin boolean (not role).
// RLS enforces at DB layer too via is_admin() function.
//
// Session 71: Added archiveTeacher and unarchiveTeacher.
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

// ── Toggle is_active on a warm-up deck photo ────────────────────────────
export async function togglePhotoActive(
  entryId: string,
  active: boolean,
): Promise<ActionResult> {
  const { error, supabase } = await requireAdmin();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  const { error: updErr } = await supabase
    .from("entries")
    .update({ is_active: active })
    .eq("id", entryId);
  if (updErr) return { ok: false, error: updErr.message };

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
// Session 71: Teacher archiving
//
// archiveTeacher:
//   1. Sets profiles.is_archived = true
//   2. Removes the teacher from teacher_rotation (if present)
//   3. Revalidates /admin
//
// unarchiveTeacher:
//   1. Sets profiles.is_archived = false
//   2. Does NOT re-add to rotation — admin does that manually
//   3. Revalidates /admin
// ─────────────────────────────────────────────────────────────────────────

export async function archiveTeacher(
  teacherId: string,
): Promise<ActionResult> {
  const { error, supabase } = await requireAdmin();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  // 1. Mark as archived
  const { error: archiveError } = await supabase
    .from("profiles")
    .update({ is_archived: true })
    .eq("id", teacherId);

  if (archiveError) {
    return { ok: false, error: archiveError.message };
  }

  // 2. Remove from rotation queue (if present) — archived teachers
  //    shouldn't be recruiting or waiting.
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
