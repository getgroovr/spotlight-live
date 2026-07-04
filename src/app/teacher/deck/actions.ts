// ─────────────────────────────────────────────────────────────────────────
// src/app/teacher/deck/actions.ts — Server Actions for the deck UI
//
// Session 70 rebuild: multi-mode photo selection.
// Teachers select photos independently for Solo/Trio/Full modes.
// Limits enforced server-side: Solo=9, Trio=3, Full=1 per teacher.
//
// Actions:
//   - uploadStarter            : add a new photo + description to the pool
//   - deleteStarter            : remove a starter (DB row + storage file)
//   - updateStarterDescription : edit the description text
//   - toggleModeSelection      : toggle a photo's selection for a specific mode
//   - saveDisplayName          : write profiles.display_name
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

const STARTER_BUCKET = "teacher-deck";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const DESC_MIN = 10;
const DESC_MAX = 1000;
const NAME_MIN = 1;
const NAME_MAX = 100;

// Per-mode selection limits
const MODE_LIMITS: Record<string, number> = {
  solo: 9,
  trio: 3,
  full: 1,
};

// Map mode names to DB column names
const MODE_COLUMNS: Record<string, string> = {
  solo: "selected_solo",
  trio: "selected_trio",
  full: "selected_full",
};

export type UploadResult =
  | { ok: true }
  | { ok: false; error: string };

// ── Shared auth helper ──────────────────────────────────────────────────
async function requireTeacher() {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not configured.", supabase: null, userId: null };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in.", supabase: null, userId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "teacher") {
    return { error: "Teacher access required.", supabase: null, userId: null };
  }

  return { error: null, supabase, userId: user.id };
}

// ── Find the teacher's class (for uploads) ──────────────────────────────
async function findTeacherClass(supabase: ReturnType<Awaited<ReturnType<typeof createClient>> extends infer S ? () => S : never> extends () => infer R ? R : never, userId: string) {
  const { data: cls } = await (supabase as NonNullable<Awaited<ReturnType<typeof createClient>>>)
    .from("classes")
    .select("id")
    .eq("teacher_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return cls?.id ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// saveDisplayName
// ─────────────────────────────────────────────────────────────────────────
export async function saveDisplayName(name: string): Promise<UploadResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  const trimmed = String(name || "").trim();
  if (trimmed.length < NAME_MIN) return { ok: false, error: "Name cannot be empty." };
  if (trimmed.length > NAME_MAX) return { ok: false, error: `Name is too long (${NAME_MAX} chars max).` };

  const { error: updErr } = await supabase
    .from("profiles")
    .update({ display_name: trimmed })
    .eq("id", userId);
  if (updErr) return { ok: false, error: `Could not save name: ${updErr.message}` };

  revalidatePath("/teacher/deck");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// uploadStarter — new photos start with no mode selections
// ─────────────────────────────────────────────────────────────────────────
export async function uploadStarter(formData: FormData): Promise<UploadResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  const classId = await findTeacherClass(supabase as any, userId);
  if (!classId) {
    return { ok: false, error: "You don't have a class yet. Ask the admin to set one up." };
  }

  const file = formData.get("photo");
  const descriptionText = String(formData.get("description") || "").trim();

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a photo to upload." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "Photo must be 8 MB or smaller." };
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: "Photo must be JPEG, PNG, or WebP." };
  }
  if (descriptionText.length < DESC_MIN) {
    return { ok: false, error: `Write a description of at least ${DESC_MIN} characters.` };
  }
  if (descriptionText.length > DESC_MAX) {
    return { ok: false, error: `Description is too long (${DESC_MAX} chars max).` };
  }

  const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const)[
    file.type as "image/jpeg" | "image/png" | "image/webp"
  ];
  const path = `${classId}/${userId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(STARTER_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  const { error: insErr } = await supabase.from("entries").insert({
    student_id: userId,
    class_id: classId,
    media_url: path,
    media_type: "photo",
    description_text: descriptionText,
    status: "live",
    is_starter: true,
    is_active: false,
    round_number: 0,
    selected_solo: false,
    selected_trio: false,
    selected_full: false,
  });
  if (insErr) {
    await supabase.storage.from(STARTER_BUCKET).remove([path]);
    return { ok: false, error: `Could not save entry: ${insErr.message}` };
  }

  revalidatePath("/teacher/deck");
  revalidatePath("/play");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// deleteStarter
// ─────────────────────────────────────────────────────────────────────────
export async function deleteStarter(entryId: string): Promise<UploadResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  const { data: row } = await supabase
    .from("entries")
    .select("id, media_url, is_starter")
    .eq("id", entryId)
    .maybeSingle();
  if (!row || !row.is_starter) {
    return { ok: false, error: "Starter entry not found." };
  }

  const { data: deleted, error: delErr } = await supabase
    .from("entries")
    .delete()
    .eq("id", entryId)
    .select("id");
  if (delErr) return { ok: false, error: `Delete failed: ${delErr.message}` };
  if (!deleted || deleted.length === 0) {
    return {
      ok: false,
      error: "Delete was blocked — the database refused the change. Check RLS policies.",
    };
  }

  if (row.media_url && !row.media_url.startsWith("http")) {
    await supabase.storage.from(STARTER_BUCKET).remove([row.media_url]);
  }

  revalidatePath("/teacher/deck");
  revalidatePath("/play");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// updateStarterDescription
// ─────────────────────────────────────────────────────────────────────────
export async function updateStarterDescription(
  entryId: string,
  newText: string,
): Promise<UploadResult> {
  const { error, supabase } = await requireTeacher();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  const trimmed = String(newText || "").trim();
  if (trimmed.length < DESC_MIN) {
    return { ok: false, error: `Description must be at least ${DESC_MIN} characters.` };
  }
  if (trimmed.length > DESC_MAX) {
    return { ok: false, error: `Description is too long (${DESC_MAX} chars max).` };
  }

  const { data: row } = await supabase
    .from("entries")
    .select("id, is_starter")
    .eq("id", entryId)
    .maybeSingle();
  if (!row || !row.is_starter) {
    return { ok: false, error: "Starter entry not found." };
  }

  const { error: updErr } = await supabase
    .from("entries")
    .update({ description_text: trimmed })
    .eq("id", entryId);
  if (updErr) return { ok: false, error: `Could not save changes: ${updErr.message}` };

  revalidatePath("/teacher/deck");
  revalidatePath("/play");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// toggleModeSelection — Session 70: per-mode selection with limits
//
// mode: "solo" | "trio" | "full"
// selected: true to add, false to remove
//
// When selecting (true), checks count vs limit for that mode.
// Also syncs is_active: true if selected for ANY mode, false if none.
// ─────────────────────────────────────────────────────────────────────────
export async function toggleModeSelection(
  entryId: string,
  mode: string,
  selected: boolean,
): Promise<UploadResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  const column = MODE_COLUMNS[mode];
  const limit = MODE_LIMITS[mode];
  if (!column || limit === undefined) {
    return { ok: false, error: `Invalid mode: ${mode}` };
  }

  const { data: row } = await supabase
    .from("entries")
    .select("id, is_starter, student_id, selected_solo, selected_trio, selected_full")
    .eq("id", entryId)
    .maybeSingle();
  if (!row || !row.is_starter) {
    return { ok: false, error: "Starter entry not found." };
  }

  // If selecting, check the limit for this mode
  if (selected) {
    const { count } = await supabase
      .from("entries")
      .select("id", { count: "exact", head: true })
      .eq("student_id", userId)
      .eq("is_starter", true)
      .eq("status", "live")
      .eq(column, true);

    const currentCount = count ?? 0;
    if (currentCount >= limit) {
      const modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);
      return {
        ok: false,
        error: `${modeLabel} mode allows ${limit} photo${limit === 1 ? "" : "s"}. Remove one first.`,
      };
    }
  }

  // Update the mode column
  const update: Record<string, boolean> = { [column]: selected };

  // Sync is_active: true if selected for any mode after this change
  const soloAfter = mode === "solo" ? selected : (row.selected_solo ?? false);
  const trioAfter = mode === "trio" ? selected : (row.selected_trio ?? false);
  const fullAfter = mode === "full" ? selected : (row.selected_full ?? false);
  update.is_active = soloAfter || trioAfter || fullAfter;

  const { error: updErr } = await supabase
    .from("entries")
    .update(update)
    .eq("id", entryId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/teacher/deck");
  revalidatePath("/play");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Legacy toggleStarterActive — kept for admin dashboard compatibility
// ─────────────────────────────────────────────────────────────────────────
export async function toggleStarterActive(
  entryId: string,
  active: boolean,
): Promise<UploadResult> {
  const { error, supabase } = await requireTeacher();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  const { data: row } = await supabase
    .from("entries")
    .select("id, is_starter")
    .eq("id", entryId)
    .maybeSingle();
  if (!row || !row.is_starter) {
    return { ok: false, error: "Starter entry not found." };
  }

  const { error: updErr } = await supabase
    .from("entries")
    .update({ is_active: active })
    .eq("id", entryId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/teacher/deck");
  revalidatePath("/play");
  return { ok: true };
}
