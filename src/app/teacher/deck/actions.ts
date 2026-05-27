// ─────────────────────────────────────────────────────────────────────────
// src/app/teacher/deck/actions.ts — Server Actions for the deck UI
//
// Slice 1A: one action so far — uploadStarter — that takes a photo file and
// a description, writes the file to the `media` storage bucket, and inserts
// an `entries` row flagged is_starter = true, status = 'live', owned by the
// uploading teacher.
//
// Per the Next.js 16 mutating-data guide: Server Actions are reachable via
// direct POST, so we MUST authenticate inside the action — the form's
// existence is not authorization. We:
//   1. resolve the calling user's auth.users id,
//   2. confirm their profiles.role = 'teacher',
//   3. confirm they own the target class.
// RLS enforces (3) anyway at the storage and entries layer, but we check
// here so we can return a useful error rather than a generic "denied."
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

const MAX_FILE_BYTES = 8 * 1024 * 1024;       // 8 MiB — well under bucket limit
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

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
  if (descriptionText.length < 10) {
    return {
      ok: false,
      error: "Write a description of at least 10 characters.",
    };
  }
  if (descriptionText.length > 1000) {
    return { ok: false, error: "Description is too long (1000 chars max)." };
  }

  // ── Upload to storage ─────────────────────────────────────────────────
  // Path convention from migration 08: media/<class_id>/<owner_id>/<filename>
  // The owner is the teacher for starters. Filename includes a timestamp so
  // a re-upload of the same name doesn't collide.
  const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const)[
    file.type as "image/jpeg" | "image/png" | "image/webp"
  ];
  const path = `${classId}/${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("media")
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
    media_url: path,                  // storage path; adapter signs at read
    media_type: "photo",
    description_text: descriptionText,
    status: "live",                   // starters go straight to live (no approval gate)
    is_starter: true,
  });
  if (insErr) {
    // Best-effort cleanup so we don't leave an orphaned storage file.
    await supabase.storage.from("media").remove([path]);
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

  const { error: delErr } = await supabase
    .from("entries")
    .delete()
    .eq("id", entryId);
  if (delErr) return { ok: false, error: `Delete failed: ${delErr.message}` };

  if (row.media_url) {
    // Storage delete failure is non-fatal — the row is already gone, the
    // file becomes orphaned. Worth logging but not worth surfacing.
    await supabase.storage.from("media").remove([row.media_url]);
  }

  revalidatePath("/teacher/deck");
  revalidatePath("/play");
  return { ok: true };
}
