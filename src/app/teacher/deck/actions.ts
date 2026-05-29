// ─────────────────────────────────────────────────────────────────────────
// src/app/teacher/deck/actions.ts — Server Actions for the deck UI
//
// Slice 1A actions:
//   - uploadStarter           : add a new photo + description to the pool
//   - deleteStarter           : remove a starter (DB row + storage file)
//   - updateStarterDescription: edit the description text of an existing
//                               starter (photo unchanged)
//
// Per the Next.js 16 mutating-data guide: Server Actions are reachable via
// direct POST, so we MUST authenticate inside each action — the form's
// existence is not authorization. We:
//   1. resolve the calling user's auth.users id,
//   2. confirm their profiles.role = 'teacher',
//   3. confirm they own the target class (or the target entry).
// RLS enforces (3) anyway at the storage and entries layer, but we check
// here so we can return a useful error rather than a generic "denied."
//
// STORAGE BUCKET — `teacher-deck` (public)
//   Starter photos are world-viewable by design (anon /play visitors need
//   them). Student uploads (future Slice 1B+) go to the private `media`
//   bucket, NOT here. See migration 08 for the bucket+policy split rationale.
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

// Bucket name in one place so the upload, delete, and (future) edit paths
// can't drift apart. Anything that talks to starter storage uses this const.
const STARTER_BUCKET = "teacher-deck";

const MAX_FILE_BYTES = 8 * 1024 * 1024;       // 8 MiB — mirrors bucket limit
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

// Description length bounds in one place — used by upload AND update so
// they cannot drift apart.
const DESC_MIN = 10;
const DESC_MAX = 1000;

export type UploadResult =
  | { ok: true }
  | { ok: false; error: string };

export async function uploadStarter(formData: FormData): Promise<UploadResult> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  // ── Auth check ────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be logged in." };

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();
  if (pErr || !profile) return { ok: false, error: "Profile not found." };
  if (profile.role !== "teacher") {
    return { ok: false, error: "Only teachers can upload to the deck." };
  }

  // ── Find the target class (the public deck) ───────────────────────────
  const pinnedId = process.env.NEXT_PUBLIC_DEMO_CLASS_ID;
  let classId: string | null = pinnedId || null;
  if (!classId) {
    const { data: cls } = await supabase
      .from("classes")
      .select("id, teacher_id")
      .eq("is_public", true)
      .limit(1)
      .maybeSingle();
    classId = cls?.id ?? null;
  }
  if (!classId) {
    return {
      ok: false,
      error:
        "No public class exists yet. Run the setup SQL in SLICE_1A_MANUAL_STEPS.md.",
    };
  }

  // Confirm ownership at the app layer for a clean error.
  const { data: owned } = await supabase
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("teacher_id", user.id)
    .maybeSingle();
  if (!owned) return { ok: false, error: "You do not own the public class." };

  // ── Validate inputs ───────────────────────────────────────────────────
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
    return {
      ok: false,
      error: `Write a description of at least ${DESC_MIN} characters.`,
    };
  }
  if (descriptionText.length > DESC_MAX) {
    return { ok: false, error: `Description is too long (${DESC_MAX} chars max).` };
  }

  // ── Upload to storage ─────────────────────────────────────────────────
  // Path convention: <class_id>/<teacher_id>/<filename>. Owner is the
  // uploading teacher. Filename includes timestamp + uuid so re-upload of
  // same name doesn't collide.
  const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const)[
    file.type as "image/jpeg" | "image/png" | "image/webp"
  ];
  const path = `${classId}/${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(STARTER_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
  if (upErr) {
    return { ok: false, error: `Upload failed: ${upErr.message}` };
  }

  // ── Insert the entries row ────────────────────────────────────────────
  const { error: insErr } = await supabase.from("entries").insert({
    student_id: user.id,              // teacher owns their own starters
    class_id: classId,
    media_url: path,                  // storage path; adapter builds public URL at read time
    media_type: "photo",
    description_text: descriptionText,
    status: "live",                   // starters go straight to live (no approval gate)
    is_starter: true,
  });
  if (insErr) {
    // Best-effort cleanup so we don't leave an orphaned storage file.
    await supabase.storage.from(STARTER_BUCKET).remove([path]);
    return { ok: false, error: `Could not save entry: ${insErr.message}` };
  }

  revalidatePath("/teacher/deck");
  revalidatePath("/play");
  return { ok: true };
}

export async function deleteStarter(entryId: string): Promise<UploadResult> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be logged in." };

  // Look up the entry to get the media path (so we can also clean up storage).
  // RLS enforces that the teacher owns the row; if the select returns nothing,
  // we treat it as a permission/not-found error.
  const { data: row } = await supabase
    .from("entries")
    .select("id, media_url, is_starter")
    .eq("id", entryId)
    .maybeSingle();
  if (!row || !row.is_starter) {
    return { ok: false, error: "Starter entry not found." };
  }

  // CRITICAL: use .select() after .delete() so we get the deleted rows back.
  // If RLS silently filters the delete (which is exactly what was happening
  // before migration 20260529130000 added the missing DELETE policy on
  // entries), the array is empty and we treat that as a permission failure
  // INSTEAD of falsely reporting success and going on to orphan the storage
  // file. This is the structural fix that prevents the zombie-row bug class
  // even if a future migration ever drops or breaks the DELETE policy again.
  const { data: deleted, error: delErr } = await supabase
    .from("entries")
    .delete()
    .eq("id", entryId)
    .select("id");
  if (delErr) return { ok: false, error: `Delete failed: ${delErr.message}` };
  if (!deleted || deleted.length === 0) {
    return {
      ok: false,
      error:
        "Delete was blocked — the database refused the change. " +
        "This usually means an RLS policy is missing or misconfigured.",
    };
  }

  if (row.media_url) {
    // Storage delete failure is non-fatal — the row is already gone, the
    // file becomes orphaned. Worth logging but not worth surfacing.
    await supabase.storage.from(STARTER_BUCKET).remove([row.media_url]);
  }

  revalidatePath("/teacher/deck");
  revalidatePath("/play");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// updateStarterDescription
//
// Edit the description text of an existing starter. Photo is untouched —
// no storage I/O happens here. Same auth pattern as the other actions:
// re-check on every call, never trust the caller's framing.
//
// RLS on `entries` already restricts UPDATE to rows the teacher owns, so
// the .update() call is the source of truth on authorization. The
// preliminary select is there only to produce a clean "not found" message
// when the entry doesn't exist or isn't this teacher's starter.
// ─────────────────────────────────────────────────────────────────────────
export async function updateStarterDescription(
  entryId: string,
  newText: string,
): Promise<UploadResult> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be logged in." };

  // Role re-check. Matches the upload/delete pattern: we never assume the
  // caller's claimed role; the action is its own perimeter.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "teacher") {
    return { ok: false, error: "Only teachers can edit starters." };
  }

  // Validate the text. Same bounds as uploadStarter so we can't drift.
  const trimmed = String(newText || "").trim();
  if (trimmed.length < DESC_MIN) {
    return {
      ok: false,
      error: `Description must be at least ${DESC_MIN} characters.`,
    };
  }
  if (trimmed.length > DESC_MAX) {
    return { ok: false, error: `Description is too long (${DESC_MAX} chars max).` };
  }

  // Confirm the target is a starter row the teacher owns. RLS will also
  // block a non-owner update, but this lets us return "not found" instead
  // of a silent zero-rows result.
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
  if (updErr) {
    return { ok: false, error: `Could not save changes: ${updErr.message}` };
  }

  revalidatePath("/teacher/deck");
  revalidatePath("/play");
  return { ok: true };
}
