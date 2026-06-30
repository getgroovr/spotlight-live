// ─────────────────────────────────────────────────────────────────────────
// src/app/teacher/deck/actions.ts — Server Actions for the deck UI
//
// Session 67 rebuild: removed DEMO_CLASS_ID / is_public dependency.
// Each teacher uploads to their own class. Class is resolved by
// querying classes.teacher_id = user.id.
//
// Actions:
//   - uploadStarter            : add a new photo + description to the pool
//   - deleteStarter            : remove a starter (DB row + storage file)
//   - updateStarterDescription : edit the description text
//   - toggleStarterActive      : flip is_active on a starter (NEW)
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
// Returns the first class owned by this teacher. If the teacher has
// multiple classes, photos still group by teacher (student_id) in the
// admin dashboard and warm-up deck. The class_id on starters is an FK
// requirement, not a grouping key.
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
// uploadStarter
// ─────────────────────────────────────────────────────────────────────────
export async function uploadStarter(formData: FormData): Promise<UploadResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  // Find this teacher's class
  const classId = await findTeacherClass(supabase as any, userId);
  if (!classId) {
    return { ok: false, error: "You don't have a class yet. Ask the admin to set one up." };
  }

  // ── Validate inputs ───────────────────────────────────────────────
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

  // ── Upload to storage ─────────────────────────────────────────────
  const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const)[
    file.type as "image/jpeg" | "image/png" | "image/webp"
  ];
  const path = `${classId}/${userId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(STARTER_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  // ── Insert the entries row ────────────────────────────────────────
  const { error: insErr } = await supabase.from("entries").insert({
    student_id: userId,
    class_id: classId,
    media_url: path,
    media_type: "photo",
    description_text: descriptionText,
    status: "live",
    is_starter: true,
    is_active: true,
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
    // Only clean up storage paths, not full URLs (seed photos use full URLs)
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
// toggleStarterActive — NEW in session 67
//
// Lets the teacher flip is_active on their own starters. The admin can
// also toggle via the admin dashboard. Active photos are candidates for
// the warm-up deck; inactive ones are hidden from visitors.
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
