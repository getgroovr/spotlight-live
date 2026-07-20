// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/multi/actions.ts
//
// Session 98: Server actions for multi-teacher games.
//
// createMultiGame — create a new game + add creator as first participant
// joinMultiGame — teacher joins an existing forming game
// leaveMultiGame — teacher leaves a game (only while forming/ready)
// uploadMultiPhoto — upload a photo for a game the teacher has joined
// deleteMultiPhoto — remove one of the teacher's own photos
// startMultiGame — creator marks a game active (requires ≥3 with photos)
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

const PHOTO_BUCKET = "teacher-deck";
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB

// ── Auth helper ─────────────────────────────────────────────────────────
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

/** Service-role client for storage uploads (bypasses RLS on buckets). */
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key);
}

// ─────────────────────────────────────────────────────────────────────────
// Create a new multi-teacher game
// ─────────────────────────────────────────────────────────────────────────
export async function createMultiGame(
  topic: string,
  totalRounds: number,
  roundDurationHours: number | null,
  gamePhaseHours: number | null,
  reviewPhaseHours: number | null,
): Promise<ActionResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  const trimmed = topic.trim();
  if (!trimmed) return { ok: false, error: "Topic is required." };
  if (trimmed.length > 200) return { ok: false, error: "Topic must be 200 characters or less." };
  if (!Number.isInteger(totalRounds) || totalRounds < 1 || totalRounds > 20) {
    return { ok: false, error: "Rounds must be between 1 and 20." };
  }

  // Create the game
  const { data: game, error: insErr } = await supabase
    .from("multi_teacher_games")
    .insert({
      topic: trimmed,
      total_rounds: totalRounds,
      round_duration_hours: roundDurationHours,
      game_phase_hours: gamePhaseHours,
      review_phase_hours: reviewPhaseHours,
      created_by: userId,
      status: "forming",
    })
    .select("id")
    .single();

  if (insErr || !game) {
    return { ok: false, error: insErr?.message || "Failed to create game." };
  }

  // Add creator as first participant
  const { error: joinErr } = await supabase
    .from("multi_teacher_participants")
    .insert({ game_id: game.id, teacher_id: userId });

  if (joinErr) {
    // Clean up the game if join fails
    await supabase.from("multi_teacher_games").delete().eq("id", game.id);
    return { ok: false, error: joinErr.message };
  }

  revalidatePath("/teacher/multi");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Join an existing game
// ─────────────────────────────────────────────────────────────────────────
export async function joinMultiGame(
  gameId: string,
): Promise<ActionResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  // Verify game exists and is joinable
  const { data: game } = await supabase
    .from("multi_teacher_games")
    .select("id, status")
    .eq("id", gameId)
    .maybeSingle();

  if (!game) return { ok: false, error: "Game not found." };
  if (game.status !== "forming") {
    return { ok: false, error: "This game is no longer accepting new participants." };
  }

  const { error: joinErr } = await supabase
    .from("multi_teacher_participants")
    .insert({ game_id: gameId, teacher_id: userId });

  if (joinErr) {
    if (joinErr.message.includes("duplicate") || joinErr.message.includes("unique")) {
      return { ok: false, error: "You've already joined this game." };
    }
    return { ok: false, error: joinErr.message };
  }

  revalidatePath("/teacher/multi");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Leave a game (only before it's active)
// ─────────────────────────────────────────────────────────────────────────
export async function leaveMultiGame(
  gameId: string,
): Promise<ActionResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  // Verify game is still forming or ready
  const { data: game } = await supabase
    .from("multi_teacher_games")
    .select("id, status, created_by")
    .eq("id", gameId)
    .maybeSingle();

  if (!game) return { ok: false, error: "Game not found." };
  if (game.status === "active" || game.status === "complete") {
    return { ok: false, error: "Cannot leave an active or completed game." };
  }

  // Don't let the creator leave — they should delete the game instead
  if (game.created_by === userId) {
    return { ok: false, error: "As the creator, you can't leave. Delete the game instead." };
  }

  // Remove participant
  const { error: delErr } = await supabase
    .from("multi_teacher_participants")
    .delete()
    .eq("game_id", gameId)
    .eq("teacher_id", userId);

  if (delErr) return { ok: false, error: delErr.message };

  // Also remove their photos for this game
  await supabase
    .from("multi_teacher_photos")
    .delete()
    .eq("game_id", gameId)
    .eq("teacher_id", userId);

  // If participant count dropped, revert status to forming
  const { count } = await supabase
    .from("multi_teacher_participants")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId);

  if (count != null && count < 3 && game.status === "ready") {
    await supabase
      .from("multi_teacher_games")
      .update({ status: "forming" })
      .eq("id", gameId);
  }

  revalidatePath("/teacher/multi");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Upload a photo for a game
// ─────────────────────────────────────────────────────────────────────────
export async function uploadMultiPhoto(
  formData: FormData,
): Promise<ActionResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  const gameId = formData.get("game_id") as string;
  const description = (formData.get("description") as string)?.trim() || "";
  const roundNumber = parseInt(formData.get("round_number") as string || "1", 10);
  const file = formData.get("photo") as File;

  if (!gameId) return { ok: false, error: "Game ID is required." };
  if (!file || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Please select a photo to upload." };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: "Photo must be 8 MB or smaller." };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "Only image files are allowed." };
  }

  // Verify teacher is a participant in this game
  const { data: participant } = await supabase
    .from("multi_teacher_participants")
    .select("id")
    .eq("game_id", gameId)
    .eq("teacher_id", userId)
    .maybeSingle();

  if (!participant) {
    return { ok: false, error: "You must join this game before uploading photos." };
  }

  // Upload to storage
  const serviceSb = getServiceClient();
  if (!serviceSb) return { ok: false, error: "Storage not configured." };

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const ts = Date.now();
  const path = `multi/${gameId}/${userId}/${ts}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadErr } = await serviceSb.storage
    .from(PHOTO_BUCKET)
    .upload(path, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadErr) {
    return { ok: false, error: `Upload failed: ${uploadErr.message}` };
  }

  // Get public URL
  const { data: urlData } = serviceSb.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  const mediaUrl = urlData?.publicUrl || path;

  // Insert photo record
  const { error: insErr } = await supabase
    .from("multi_teacher_photos")
    .insert({
      game_id: gameId,
      teacher_id: userId,
      media_url: mediaUrl,
      description_text: description || null,
      round_number: roundNumber,
    });

  if (insErr) {
    return { ok: false, error: insErr.message };
  }

  revalidatePath("/teacher/multi");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Delete one of the teacher's own photos
// ─────────────────────────────────────────────────────────────────────────
export async function deleteMultiPhoto(
  photoId: string,
): Promise<ActionResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  // Verify ownership
  const { data: photo } = await supabase
    .from("multi_teacher_photos")
    .select("id, teacher_id, game_id")
    .eq("id", photoId)
    .maybeSingle();

  if (!photo) return { ok: false, error: "Photo not found." };
  if (photo.teacher_id !== userId) {
    return { ok: false, error: "You can only delete your own photos." };
  }

  // Check game isn't complete
  const { data: game } = await supabase
    .from("multi_teacher_games")
    .select("status")
    .eq("id", photo.game_id)
    .maybeSingle();

  if (game?.status === "complete") {
    return { ok: false, error: "Cannot modify photos in a completed game." };
  }

  const { error: delErr } = await supabase
    .from("multi_teacher_photos")
    .delete()
    .eq("id", photoId);

  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath("/teacher/multi");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Start a game (creator only, requires ≥3 participants with photos)
// ─────────────────────────────────────────────────────────────────────────
export async function startMultiGame(
  gameId: string,
): Promise<ActionResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  // Verify creator
  const { data: game } = await supabase
    .from("multi_teacher_games")
    .select("id, created_by, status")
    .eq("id", gameId)
    .maybeSingle();

  if (!game) return { ok: false, error: "Game not found." };
  if (game.created_by !== userId) {
    return { ok: false, error: "Only the game creator can start the game." };
  }
  if (game.status === "active") {
    return { ok: false, error: "Game is already active." };
  }
  if (game.status === "complete") {
    return { ok: false, error: "Game is already complete." };
  }

  // Count participants who have uploaded at least one photo
  const { data: participants } = await supabase
    .from("multi_teacher_participants")
    .select("teacher_id")
    .eq("game_id", gameId);

  if (!participants || participants.length < 3) {
    return { ok: false, error: `Need at least 3 participants (currently ${participants?.length || 0}).` };
  }

  // Check each participant has at least one photo for round 1
  const teacherIds = participants.map((p) => p.teacher_id);
  const { data: photos } = await supabase
    .from("multi_teacher_photos")
    .select("teacher_id")
    .eq("game_id", gameId)
    .eq("round_number", 1)
    .in("teacher_id", teacherIds);

  const teachersWithPhotos = new Set((photos || []).map((p) => p.teacher_id));
  if (teachersWithPhotos.size < 3) {
    const missing = teacherIds.length - teachersWithPhotos.size;
    return {
      ok: false,
      error: `${missing} participant${missing !== 1 ? "s" : ""} still need${missing === 1 ? "s" : ""} to upload photos for round 1.`,
    };
  }

  // Start the game
  const { error: updErr } = await supabase
    .from("multi_teacher_games")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", gameId);

  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/teacher/multi");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Delete a game (creator only, only while forming)
// ─────────────────────────────────────────────────────────────────────────
export async function deleteMultiGame(
  gameId: string,
): Promise<ActionResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  const { data: game } = await supabase
    .from("multi_teacher_games")
    .select("id, created_by, status")
    .eq("id", gameId)
    .maybeSingle();

  if (!game) return { ok: false, error: "Game not found." };
  if (game.created_by !== userId) {
    return { ok: false, error: "Only the game creator can delete the game." };
  }
  if (game.status === "active" || game.status === "complete") {
    return { ok: false, error: "Cannot delete an active or completed game." };
  }

  // CASCADE will clean up participants and photos
  const { error: delErr } = await supabase
    .from("multi_teacher_games")
    .delete()
    .eq("id", gameId);

  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath("/teacher/multi");
  return { ok: true };
}
