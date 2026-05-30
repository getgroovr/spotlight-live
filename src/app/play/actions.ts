// ─────────────────────────────────────────────────────────────────────────
// src/app/play/actions.ts — Server Actions for the /play surface
//
// Slice 1B actions:
//   - enrollStudent : called at end of game when a student chooses to join.
//                     Creates a student row, an enrollment row, a game_session
//                     row, uploads their profile photo, and sends a magic-link
//                     email so they can return later.
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const MEDIA_BUCKET = "media";
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export type EnrollResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function enrollStudent(formData: FormData): Promise<EnrollResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return { ok: false, error: "Server is not configured." };
  }
  const admin = createServiceClient(supabaseUrl, serviceKey);

  // ── Validate inputs ───────────────────────────────────────────────────
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const photo = formData.get("photo");
  const commentsRaw = String(formData.get("comments") || "{}");
  const favoritesRaw = String(formData.get("favorites") || "{}");

  if (!name || name.length < 2) {
    return { ok: false, error: "Please enter your name (at least 2 characters)." };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (!(photo instanceof File) || photo.size === 0) {
    return { ok: false, error: "Please upload a photo of yourself." };
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return { ok: false, error: "Photo must be 8 MB or smaller." };
  }
  if (!ALLOWED_MIME.has(photo.type)) {
    return { ok: false, error: "Photo must be JPEG, PNG, or WebP." };
  }

  let comments: Record<string, string> = {};
  let favorites: Record<string, boolean> = {};
  try {
    comments = JSON.parse(commentsRaw);
    favorites = JSON.parse(favoritesRaw);
  } catch {}

  const classId = process.env.NEXT_PUBLIC_DEMO_CLASS_ID;
  if (!classId) {
    return { ok: false, error: "No class configured on this server." };
  }

  // ── Existing student? ─────────────────────────────────────────────────
  const { data: existing } = await admin
    .from("students")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  let studentId: string;

  if (existing) {
    studentId = existing.id;
  } else {
    // ── Upload profile photo ──────────────────────────────────────────
    const ext = (
      { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const
    )[photo.type as "image/jpeg" | "image/png" | "image/webp"];
    const photoPath = `students/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { error: photoErr } = await admin.storage
      .from(MEDIA_BUCKET)
      .upload(photoPath, photo, { contentType: photo.type, upsert: false });
    if (photoErr) {
      return { ok: false, error: `Photo upload failed: ${photoErr.message}` };
    }

    const { data: newStudent, error: stuErr } = await admin
      .from("students")
      .insert({ name, email, photo_url: photoPath })
      .select("id")
      .single();
    if (stuErr || !newStudent) {
      await admin.storage.from(MEDIA_BUCKET).remove([photoPath]);
      return { ok: false, error: `Could not create student record: ${stuErr?.message}` };
    }
    studentId = newStudent.id;
  }

  // ── Upsert enrollment ─────────────────────────────────────────────────
  const { error: enrollErr } = await admin
    .from("enrollments")
    .upsert(
      { student_id: studentId, class_id: classId, round: 1 },
      { onConflict: "student_id,class_id" }
    );
  if (enrollErr) {
    return { ok: false, error: `Enrollment failed: ${enrollErr.message}` };
  }

  // ── Save game session (bridge from localStorage → DB) ─────────────────
  const { error: sessionErr } = await admin
    .from("game_sessions")
    .insert({
      student_id: studentId,
      class_id: classId,
      round: 1,
      comments,
      favorites,
    });
  if (sessionErr) {
    console.error("game_session insert failed:", sessionErr.message);
  }

  // ── Send magic link via signInWithOtp ─────────────────────────────────
  // Uses an anon-key client so signInWithOtp actually emails the user.
  // (The admin-generated link from `auth.admin.generateLink` is NOT sent
  // by Supabase — that endpoint just returns a link for manual use.)
  const anon = createServiceClient(supabaseUrl, anonKey);
  const { error: otpErr } = await anon.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/student/dashboard`,
    },
  });
  if (otpErr) {
    console.error("Magic link send failed:", otpErr.message);
    // Non-fatal — enrollment succeeded, student can request another link later.
  }

  revalidatePath("/play");
  return {
    ok: true,
    message: "You're in! Check your email for a link to come back.",
  };
}
