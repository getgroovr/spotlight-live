// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/deck/actions.ts   (REPLACES existing file)
//
// Session 94: Per-class deck management.
//   - uploadStarter takes class_id directly (not level→find class)
//   - toggleRecruiting updates classes.is_recruiting (per-class)
//   - saveWarmupTitle stores title in round_topics["0"]
//   - saveWarmupPrompt stores prompt in round_prompts["0"]
//   - createClassWithLevel creates a class from the deck page
//   - Uploads default is_active=true (no admin approval step)
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const STARTER_BUCKET = "teacher-deck";
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const DESC_MIN = 10;
const DESC_MAX = 1000;
const NAME_MAX = 100;
const VALID_LEVELS = new Set(["beginner", "intermediate", "advanced"]);
const ALLOWED_CAPACITIES = [9, 16, 25] as const;

export type UploadResult =
  | { ok: true }
  | { ok: false; error: string };

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
  if (!profile || profile.role !== "teacher")
    return { error: "Teacher access required.", supabase: null, userId: null };
  return { error: null, supabase, userId: user.id };
}

// ── saveDisplayName ─────────────────────────────────────────────────────
export async function saveDisplayName(name: string): Promise<UploadResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };
  const trimmed = String(name || "").trim();
  if (!trimmed) return { ok: false, error: "Name cannot be empty." };
  if (trimmed.length > NAME_MAX) return { ok: false, error: `Name is too long (${NAME_MAX} chars max).` };
  const { error: updErr } = await supabase.from("profiles").update({ display_name: trimmed }).eq("id", userId);
  if (updErr) return { ok: false, error: `Could not save name: ${updErr.message}` };
  revalidatePath("/teacher/deck");
  return { ok: true };
}

// ── uploadStarter ───────────────────────────────────────────────────────
// Session 94: Takes class_id directly from the form (photos are per-class)
export async function uploadStarter(formData: FormData): Promise<UploadResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  const classId = String(formData.get("class_id") || "").trim();
  if (!classId) return { ok: false, error: "Missing class." };

  // Verify teacher owns this class and get its level
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { ok: false, error: "Server config error." };
  const admin = createServiceClient(supabaseUrl, serviceKey);

  const { data: cls } = await admin
    .from("classes")
    .select("id, level, teacher_id")
    .eq("id", classId)
    .maybeSingle();
  if (!cls || cls.teacher_id !== userId) return { ok: false, error: "Class not found or you don't own it." };

  const level = cls.level || "beginner";

  const file = formData.get("photo");
  const descriptionText = String(formData.get("description") || "").trim();

  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo to upload." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "Photo must be 8 MB or smaller." };
  if (!ALLOWED_MIME.has(file.type)) return { ok: false, error: "Photo must be JPEG, PNG, or WebP." };
  if (descriptionText.length < DESC_MIN) return { ok: false, error: `Write a description of at least ${DESC_MIN} characters.` };
  if (descriptionText.length > DESC_MAX) return { ok: false, error: `Description is too long (${DESC_MAX} chars max).` };

  const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const)[
    file.type as "image/jpeg" | "image/png" | "image/webp"
  ];
  const path = `${classId}/${userId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await admin.storage
    .from(STARTER_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  const { error: insErr } = await admin.from("entries").insert({
    student_id: userId,
    class_id: classId,
    media_url: path,
    media_type: "photo",
    description_text: descriptionText,
    status: "live",
    is_starter: true,
    is_active: true,
    round_number: 0,
    level,
  });
  if (insErr) {
    await admin.storage.from(STARTER_BUCKET).remove([path]);
    return { ok: false, error: `Could not save entry: ${insErr.message}` };
  }

  revalidatePath("/teacher/deck");
  return { ok: true };
}

// ── deleteStarter ───────────────────────────────────────────────────────
export async function deleteStarter(entryId: string): Promise<UploadResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  const { data: row } = await supabase.from("entries").select("id, media_url, is_starter").eq("id", entryId).maybeSingle();
  if (!row || !row.is_starter) return { ok: false, error: "Starter entry not found." };

  const { data: deleted, error: delErr } = await supabase.from("entries").delete().eq("id", entryId).select("id");
  if (delErr) return { ok: false, error: `Delete failed: ${delErr.message}` };
  if (!deleted || deleted.length === 0) return { ok: false, error: "Delete was blocked by the database." };

  if (row.media_url && !row.media_url.startsWith("http")) {
    await supabase.storage.from(STARTER_BUCKET).remove([row.media_url]);
  }

  revalidatePath("/teacher/deck");
  return { ok: true };
}

// ── updateStarterDescription ────────────────────────────────────────────
export async function updateStarterDescription(entryId: string, newText: string): Promise<UploadResult> {
  const { error, supabase } = await requireTeacher();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  const trimmed = String(newText || "").trim();
  if (trimmed.length < DESC_MIN) return { ok: false, error: `Description must be at least ${DESC_MIN} characters.` };
  if (trimmed.length > DESC_MAX) return { ok: false, error: `Description is too long (${DESC_MAX} chars max).` };

  const { data: row } = await supabase.from("entries").select("id, is_starter").eq("id", entryId).maybeSingle();
  if (!row || !row.is_starter) return { ok: false, error: "Starter entry not found." };

  const { error: updErr } = await supabase.from("entries").update({ description_text: trimmed }).eq("id", entryId);
  if (updErr) return { ok: false, error: `Could not save changes: ${updErr.message}` };

  revalidatePath("/teacher/deck");
  return { ok: true };
}

// ── toggleInWarmup ──────────────────────────────────────────────────────
export async function toggleInWarmup(entryId: string, active: boolean): Promise<UploadResult> {
  const { error, supabase } = await requireTeacher();
  if (error || !supabase) return { ok: false, error: error || "Auth failed." };

  const { data: row } = await supabase.from("entries").select("id, is_starter").eq("id", entryId).maybeSingle();
  if (!row || !row.is_starter) return { ok: false, error: "Starter entry not found." };

  const { error: updErr } = await supabase.from("entries").update({ is_active: active }).eq("id", entryId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/teacher/deck");
  return { ok: true };
}

// ── toggleRecruiting ────────────────────────────────────────────────────
// Session 94: Now updates classes.is_recruiting (per-class, not per-level on profiles)
export async function toggleRecruiting(classId: string, active: boolean): Promise<UploadResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { ok: false, error: "Server config error." };
  const admin = createServiceClient(supabaseUrl, serviceKey);

  // Verify ownership
  const { data: cls } = await admin
    .from("classes")
    .select("id, teacher_id")
    .eq("id", classId)
    .maybeSingle();
  if (!cls || cls.teacher_id !== userId) return { ok: false, error: "Class not found." };

  const { error: updErr } = await admin
    .from("classes")
    .update({ is_recruiting: active })
    .eq("id", classId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/teacher/deck");
  return { ok: true };
}

// ── saveWarmupTitle ─────────────────────────────────────────────────────
// Session 94: Stores warmup title in round_topics["0"]
export async function saveWarmupTitle(classId: string, title: string): Promise<UploadResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { ok: false, error: "Server config error." };
  const admin = createServiceClient(supabaseUrl, serviceKey);

  const { data: cls } = await admin
    .from("classes")
    .select("id, teacher_id, round_topics")
    .eq("id", classId)
    .maybeSingle();
  if (!cls || cls.teacher_id !== userId) return { ok: false, error: "Class not found." };

  const topics = (cls.round_topics as Record<string, string | null>) || {};
  topics["0"] = title.trim() || null;

  const { error: updErr } = await admin
    .from("classes")
    .update({ round_topics: topics })
    .eq("id", classId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/teacher/deck");
  return { ok: true };
}

// ── saveWarmupPrompt ────────────────────────────────────────────────────
// Session 94: Stores warmup prompt in round_prompts["0"]
// Requires migration: 20260718060000_round_prompts.sql
export async function saveWarmupPrompt(classId: string, prompt: string): Promise<UploadResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { ok: false, error: "Server config error." };
  const admin = createServiceClient(supabaseUrl, serviceKey);

  const { data: cls } = await admin
    .from("classes")
    .select("id, teacher_id, round_prompts")
    .eq("id", classId)
    .maybeSingle();
  if (!cls || cls.teacher_id !== userId) return { ok: false, error: "Class not found." };

  const prompts = (cls.round_prompts as Record<string, string | null>) || {};
  prompts["0"] = prompt.trim() || null;

  const { error: updErr } = await admin
    .from("classes")
    .update({ round_prompts: prompts })
    .eq("id", classId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/teacher/deck");
  return { ok: true };
}

// ── createClassWithLevel ────────────────────────────────────────────────
// Session 94: Create a class from the deck page with a specific level.
// Mirrors createClassDirect from students/actions but includes level.
export async function createClassWithLevel(
  className: string,
  capacity: number,
  level: string,
): Promise<UploadResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  const name = className.trim();
  if (!name || name.length > 100) return { ok: false, error: "Class name must be 1–100 characters." };
  if (!(ALLOWED_CAPACITIES as readonly number[]).includes(capacity as 9 | 16 | 25))
    return { ok: false, error: "Invalid class size." };
  if (!VALID_LEVELS.has(level)) return { ok: false, error: "Invalid level." };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { ok: false, error: "Server config error." };
  const admin = createServiceClient(supabaseUrl, serviceKey);

  const { data: newClass, error: clsErr } = await admin
    .from("classes")
    .insert({
      teacher_id: userId,
      name,
      capacity,
      level,
      is_archived: false,
    })
    .select("id")
    .single();

  if (clsErr) return { ok: false, error: `Could not create class: ${clsErr.message}` };

  // Create a game row (status pending until teacher sets schedule)
  const { error: gameErr } = await admin.from("games").insert({
    class_id: newClass.id,
    name: `${name} Game`,
    status: "pending",
    current_round_phase: "game",
  });
  if (gameErr) {
    console.error(`[createClassWithLevel] Could not create game row: ${gameErr.message}`);
  }

  revalidatePath("/teacher/deck");
  revalidatePath("/teacher/students");
  return { ok: true };
}
