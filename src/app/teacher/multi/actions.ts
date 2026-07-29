// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/multi/actions.ts
//
// Session 99: Server actions for multi-teacher games.
//
// createMultiGame — create a new game + rounds + add creator as participant
// joinMultiGame — teacher joins an existing forming game
// leaveMultiGame — teacher leaves a game (only while forming/ready)
// uploadMultiPhoto — upload a photo for a specific round
// deleteMultiPhoto — remove one of the teacher's own photos
// startMultiGame — creator marks a game active (requires ≥3 with photos)
// deleteMultiGame — creator deletes a forming game
// updateRoundTopic — creator edits a round's topic
// updateGameSettings — creator edits game-level settings (timing, rounds)
//   Session 104: restricted to solo-creator (before any other teacher joins)
// spinAvatar — assign a monster avatar to a teacher for a round (Session 102)
//   Session 104: requires ≥1 photo for previous round before spinning next
//
// Session 105 (Phase 5 — Comment Review + Teacher Feedback):
// approveComment — teacher approves a favorite comment for the reveal
// rejectComment — teacher rejects a favorite comment (stays private)
// replyToComment — teacher sends a private reply to a student comment
// flagStudent — teacher flags a student (blocks further participation)
//
// Session 106 (Phases 7–8 — Lifecycle + Stats):
// joinMultiGame — updated: caps at 3 active, extras go to waiting list
// dropOutOfGame — teacher drops from active game, promotes first waiter
// replayGame — creator starts a new game from a completed game's settings
// completeGame — creator marks all rounds done, game → complete
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { promoteWaiter, countActiveParticipants, buildReplayGame } from "@/lib/multi-game-lifecycle";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

const PHOTO_BUCKET = "teacher-deck";
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB
const MAX_PHOTOS_PER_ROUND = 3;

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
// Create a new multi-teacher game + round rows
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

  // Create the game (7-day auto-archive deadline)
  const archiveAfter = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

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
      archive_after: archiveAfter,
    })
    .select("id")
    .single();

  if (insErr || !game) {
    return { ok: false, error: insErr?.message || "Failed to create game." };
  }

  // Create round rows (one per round, each gets the game topic as default)
  const roundRows = Array.from({ length: totalRounds }, (_, i) => ({
    game_id: game.id,
    round_number: i + 1,
    topic: trimmed,
    status: "upcoming",
  }));

  const { error: roundErr } = await supabase
    .from("multi_game_rounds")
    .insert(roundRows);

  if (roundErr) {
    // Clean up game if rounds fail
    await supabase.from("multi_teacher_games").delete().eq("id", game.id);
    return { ok: false, error: `Failed to create rounds: ${roundErr.message}` };
  }

  // Add creator as first participant (active)
  const { error: joinErr } = await supabase
    .from("multi_teacher_participants")
    .insert({ game_id: game.id, teacher_id: userId, participant_status: "active" });

  if (joinErr) {
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

  const { data: game } = await supabase
    .from("multi_teacher_games")
    .select("id, status")
    .eq("id", gameId)
    .maybeSingle();

  if (!game) return { ok: false, error: "Game not found." };
  if (game.status !== "forming") {
    return { ok: false, error: "This game is no longer accepting new participants." };
  }

  // Session 106: cap at 3 active participants, overflow to waiting list
  const activeCount = await countActiveParticipants(supabase, gameId);
  const status = activeCount >= 3 ? "waiting" : "active";

  const { error: joinErr } = await supabase
    .from("multi_teacher_participants")
    .insert({ game_id: gameId, teacher_id: userId, participant_status: status });

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

  const { data: game } = await supabase
    .from("multi_teacher_games")
    .select("id, status, created_by")
    .eq("id", gameId)
    .maybeSingle();

  if (!game) return { ok: false, error: "Game not found." };
  if (game.status === "active" || game.status === "complete") {
    return { ok: false, error: "Cannot leave an active or completed game." };
  }
  if (game.created_by === userId) {
    return { ok: false, error: "As the creator, you can't leave. Delete the game instead." };
  }

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

  // Session 106: promote the first waiting teacher if one exists
  await promoteWaiter(supabase, gameId);

  // If active participant count dropped below 3, revert status to forming
  const activeCount = await countActiveParticipants(supabase, gameId);
  if (activeCount < 3 && game.status === "ready") {
    await supabase
      .from("multi_teacher_games")
      .update({ status: "forming" })
      .eq("id", gameId);
  }

  revalidatePath("/teacher/multi");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Upload a photo for a specific round
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

  // Verify teacher is a participant
  const { data: participant } = await supabase
    .from("multi_teacher_participants")
    .select("id")
    .eq("game_id", gameId)
    .eq("teacher_id", userId)
    .maybeSingle();

  if (!participant) {
    return { ok: false, error: "You must join this game before uploading photos." };
  }

  // Check photo count for this round (max 3 per teacher per round)
  const { count: existingCount } = await supabase
    .from("multi_teacher_photos")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId)
    .eq("teacher_id", userId)
    .eq("round_number", roundNumber);

  if (existingCount != null && existingCount >= MAX_PHOTOS_PER_ROUND) {
    return { ok: false, error: `You already have ${MAX_PHOTOS_PER_ROUND} photos for this round.` };
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

  const { data: urlData } = serviceSb.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  const mediaUrl = urlData?.publicUrl || path;

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
  revalidatePath(`/teacher/multi/${gameId}`);
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

  const { data: photo } = await supabase
    .from("multi_teacher_photos")
    .select("id, teacher_id, game_id")
    .eq("id", photoId)
    .maybeSingle();

  if (!photo) return { ok: false, error: "Photo not found." };
  if (photo.teacher_id !== userId) {
    return { ok: false, error: "You can only delete your own photos." };
  }

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
  revalidatePath(`/teacher/multi/${photo.game_id}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Start a game (creator only, requires ≥3 participants with round-1 photos)
// ─────────────────────────────────────────────────────────────────────────
export async function startMultiGame(
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
    return { ok: false, error: "Only the game creator can start the game." };
  }
  if (game.status === "active") {
    return { ok: false, error: "Game is already active." };
  }
  if (game.status === "complete") {
    return { ok: false, error: "Game is already complete." };
  }

  const { data: participants } = await supabase
    .from("multi_teacher_participants")
    .select("teacher_id")
    .eq("game_id", gameId)
    .eq("participant_status", "active");

  if (!participants || participants.length < 3) {
    return { ok: false, error: `Need at least 3 active participants (currently ${participants?.length || 0}).` };
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

  // Mark round 1 as active
  await supabase
    .from("multi_game_rounds")
    .update({ status: "active" })
    .eq("game_id", gameId)
    .eq("round_number", 1);

  const { error: updErr } = await supabase
    .from("multi_teacher_games")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", gameId);

  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/teacher/multi");
  revalidatePath(`/teacher/multi/${gameId}`);
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

  // CASCADE will clean up participants, photos, and rounds
  const { error: delErr } = await supabase
    .from("multi_teacher_games")
    .delete()
    .eq("id", gameId);

  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath("/teacher/multi");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Update a round's topic (creator only)
// ─────────────────────────────────────────────────────────────────────────
export async function updateRoundTopic(
  gameId: string,
  roundNumber: number,
  topic: string,
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
    return { ok: false, error: "Only the game creator can edit round topics." };
  }
  if (game.status === "complete") {
    return { ok: false, error: "Cannot edit a completed game." };
  }

  const trimmed = topic.trim();
  if (trimmed.length > 200) {
    return { ok: false, error: "Topic must be 200 characters or less." };
  }

  const { error: updErr } = await supabase
    .from("multi_game_rounds")
    .update({ topic: trimmed })
    .eq("game_id", gameId)
    .eq("round_number", roundNumber);

  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath(`/teacher/multi/${gameId}`);
  revalidatePath("/teacher/multi");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Update game-level settings (creator only, only while sole participant)
// Session 104: locked once a second teacher joins
// ─────────────────────────────────────────────────────────────────────────
export async function updateGameSettings(
  gameId: string,
  settings: {
    topic?: string;
    round_duration_hours?: number | null;
    game_phase_hours?: number | null;
    review_phase_hours?: number | null;
  },
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
    return { ok: false, error: "Only the game creator can edit settings." };
  }
  if (game.status === "active" || game.status === "complete") {
    return { ok: false, error: "Cannot edit settings on an active or completed game." };
  }

  // Session 104: lock settings once another teacher has joined
  const { count: participantCount } = await supabase
    .from("multi_teacher_participants")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId);

  if (participantCount != null && participantCount > 1) {
    return { ok: false, error: "Settings are locked once another teacher has joined." };
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (settings.topic !== undefined) {
    const t = settings.topic.trim();
    if (t.length > 200) return { ok: false, error: "Topic must be 200 characters or less." };
    updates.topic = t;
  }
  if (settings.round_duration_hours !== undefined) updates.round_duration_hours = settings.round_duration_hours;
  if (settings.game_phase_hours !== undefined) updates.game_phase_hours = settings.game_phase_hours;
  if (settings.review_phase_hours !== undefined) updates.review_phase_hours = settings.review_phase_hours;

  const { error: updErr } = await supabase
    .from("multi_teacher_games")
    .update(updates)
    .eq("id", gameId);

  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath(`/teacher/multi/${gameId}`);
  revalidatePath("/teacher/multi");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Assign an avatar to a teacher for a specific round (Session 102)
//
// Business rules enforced here:
//   - Teacher must be a participant in the game
//   - No duplicate assignment for same teacher + round
//   - Session 104: round > 1 requires ≥1 photo with description for prev round
//   - In 'rotating' mode: monster must not already be assigned to this
//     teacher in a previous round of this game
//   - In 'single' mode, round > 1: monster must match round 1's assignment
//   - Increments the monster's games_played counter
// ─────────────────────────────────────────────────────────────────────────
export async function spinAvatar(
  gameId: string,
  roundNumber: number,
  monsterId: string,
): Promise<ActionResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  // Verify teacher is a participant
  const { data: participant } = await supabase
    .from("multi_teacher_participants")
    .select("id")
    .eq("game_id", gameId)
    .eq("teacher_id", userId)
    .maybeSingle();

  if (!participant) {
    return { ok: false, error: "You must join this game before spinning for an avatar." };
  }

  // Check for existing assignment this round
  const { data: existing } = await supabase
    .from("multi_game_avatar_assignments")
    .select("id")
    .eq("game_id", gameId)
    .eq("teacher_id", userId)
    .eq("round_number", roundNumber)
    .maybeSingle();

  if (existing) {
    return { ok: false, error: "You already have an avatar for this round." };
  }

  // Session 104: round > 1 requires at least 1 photo for the previous round
  if (roundNumber > 1) {
    const { count: prevPhotos } = await supabase
      .from("multi_teacher_photos")
      .select("id", { count: "exact", head: true })
      .eq("game_id", gameId)
      .eq("teacher_id", userId)
      .eq("round_number", roundNumber - 1);

    if (prevPhotos == null || prevPhotos < 1) {
      return {
        ok: false,
        error: `Upload at least one photo for Round ${roundNumber - 1} before spinning for Round ${roundNumber}.`,
      };
    }
  }

  // Get game's avatar mode
  const { data: game } = await supabase
    .from("multi_teacher_games")
    .select("id, avatar_mode, total_rounds")
    .eq("id", gameId)
    .maybeSingle();

  if (!game) return { ok: false, error: "Game not found." };

  // In 'rotating' mode: verify this monster hasn't been used by this teacher
  if (game.avatar_mode === "rotating") {
    const { data: prevAssignments } = await supabase
      .from("multi_game_avatar_assignments")
      .select("monster_id")
      .eq("game_id", gameId)
      .eq("teacher_id", userId);

    const usedIds = new Set((prevAssignments || []).map((a) => a.monster_id));
    if (usedIds.has(monsterId)) {
      return { ok: false, error: "This monster was already assigned to you in a previous round." };
    }
  }

  // In 'single' mode, round > 1: must match round 1's assignment
  if (game.avatar_mode === "single" && roundNumber > 1) {
    const { data: round1 } = await supabase
      .from("multi_game_avatar_assignments")
      .select("monster_id")
      .eq("game_id", gameId)
      .eq("teacher_id", userId)
      .eq("round_number", 1)
      .maybeSingle();

    if (round1 && round1.monster_id !== monsterId) {
      return { ok: false, error: "In this game, your avatar is locked from round 1." };
    }
  }

  // Insert the assignment
  const { error: insErr } = await supabase
    .from("multi_game_avatar_assignments")
    .insert({
      game_id: gameId,
      teacher_id: userId,
      round_number: roundNumber,
      monster_id: monsterId,
    });

  if (insErr) {
    if (insErr.message.includes("duplicate") || insErr.message.includes("unique")) {
      return { ok: false, error: "Avatar already assigned for this round." };
    }
    return { ok: false, error: insErr.message };
  }

  // Increment games_played on the monster
  const { data: monster } = await supabase
    .from("monster_avatars")
    .select("games_played")
    .eq("id", monsterId)
    .maybeSingle();

  if (monster) {
    await supabase
      .from("monster_avatars")
      .update({ games_played: (monster.games_played || 0) + 1 })
      .eq("id", monsterId);
  }

  revalidatePath(`/teacher/multi/${gameId}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Approve a favorite comment for the reveal ceremony (Session 105)
//
// Sets review_status='approved' and is_approved=true. Only the teacher
// whose photo received the comment can approve it.
// ─────────────────────────────────────────────────────────────────────────
export async function approveComment(
  commentId: string,
): Promise<ActionResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  // Fetch comment + verify the photo belongs to this teacher
  const { data: comment } = await supabase
    .from("multi_game_comments")
    .select("id, photo_id, is_favorite_comment, review_status")
    .eq("id", commentId)
    .maybeSingle();

  if (!comment) return { ok: false, error: "Comment not found." };
  if (!comment.is_favorite_comment) {
    return { ok: false, error: "Only favorite comments can be approved." };
  }

  const { data: photo } = await supabase
    .from("multi_teacher_photos")
    .select("teacher_id, game_id")
    .eq("id", comment.photo_id)
    .maybeSingle();

  if (!photo) return { ok: false, error: "Photo not found." };
  if (photo.teacher_id !== userId) {
    return { ok: false, error: "You can only review comments on your own photos." };
  }

  const { error: updErr } = await supabase
    .from("multi_game_comments")
    .update({
      review_status: "approved",
      is_approved: true,
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
    })
    .eq("id", commentId);

  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath(`/teacher/multi/${photo.game_id}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Reject a favorite comment (Session 105)
//
// Sets review_status='rejected'. The comment stays private — won't appear
// in the reveal ceremony. Only the photo's teacher can reject.
// ─────────────────────────────────────────────────────────────────────────
export async function rejectComment(
  commentId: string,
): Promise<ActionResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  const { data: comment } = await supabase
    .from("multi_game_comments")
    .select("id, photo_id, is_favorite_comment")
    .eq("id", commentId)
    .maybeSingle();

  if (!comment) return { ok: false, error: "Comment not found." };
  if (!comment.is_favorite_comment) {
    return { ok: false, error: "Only favorite comments go through review." };
  }

  const { data: photo } = await supabase
    .from("multi_teacher_photos")
    .select("teacher_id, game_id")
    .eq("id", comment.photo_id)
    .maybeSingle();

  if (!photo) return { ok: false, error: "Photo not found." };
  if (photo.teacher_id !== userId) {
    return { ok: false, error: "You can only review comments on your own photos." };
  }

  const { error: updErr } = await supabase
    .from("multi_game_comments")
    .update({
      review_status: "rejected",
      is_approved: false,
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
    })
    .eq("id", commentId);

  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath(`/teacher/multi/${photo.game_id}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Reply to a student comment (Session 105)
//
// Creates a new comment row with parent_id pointing at the original,
// author_role='teacher'. This is a private one-on-one reply — only the
// student and teacher see it.
// ─────────────────────────────────────────────────────────────────────────
export async function replyToComment(
  commentId: string,
  body: string,
): Promise<ActionResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Reply cannot be empty." };
  if (trimmed.length > 2000) return { ok: false, error: "Reply is too long (max 2000 characters)." };

  // Fetch original comment + verify photo ownership
  const { data: comment } = await supabase
    .from("multi_game_comments")
    .select("id, photo_id, author_id")
    .eq("id", commentId)
    .maybeSingle();

  if (!comment) return { ok: false, error: "Comment not found." };

  const { data: photo } = await supabase
    .from("multi_teacher_photos")
    .select("teacher_id, game_id")
    .eq("id", comment.photo_id)
    .maybeSingle();

  if (!photo) return { ok: false, error: "Photo not found." };
  if (photo.teacher_id !== userId) {
    return { ok: false, error: "You can only reply to comments on your own photos." };
  }

  const { error: insErr } = await supabase
    .from("multi_game_comments")
    .insert({
      photo_id: comment.photo_id,
      author_id: userId,
      parent_id: commentId,
      body: trimmed,
      author_role: "teacher",
      is_favorite_comment: false,
      is_approved: false,
    });

  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath(`/teacher/multi/${photo.game_id}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Flag a student (Session 105)
//
// Marks a student as flagged in multi_game_students. Flagged students
// are blocked from further participation in this game. The teacher
// provides a reason.
// ─────────────────────────────────────────────────────────────────────────
export async function flagStudent(
  gameId: string,
  studentId: string,
  reason: string,
): Promise<ActionResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  const trimmedReason = reason.trim();
  if (!trimmedReason) return { ok: false, error: "Please provide a reason for flagging." };

  // Verify teacher is a participant in this game
  const { data: participant } = await supabase
    .from("multi_teacher_participants")
    .select("id")
    .eq("game_id", gameId)
    .eq("teacher_id", userId)
    .maybeSingle();

  if (!participant) {
    return { ok: false, error: "You must be a participant in this game to flag students." };
  }

  // Verify student is in this game
  const { data: student } = await supabase
    .from("multi_game_students")
    .select("game_id, student_id, is_flagged")
    .eq("game_id", gameId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (!student) {
    return { ok: false, error: "Student not found in this game." };
  }
  if (student.is_flagged) {
    return { ok: false, error: "This student is already flagged." };
  }

  const { error: updErr } = await supabase
    .from("multi_game_students")
    .update({
      is_flagged: true,
      flagged_by: userId,
      flagged_reason: trimmedReason,
    })
    .eq("game_id", gameId)
    .eq("student_id", studentId);

  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath(`/teacher/multi/${gameId}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Drop out of an active game (Session 106 — Phase 7)
//
// Unlike leaveMultiGame (pre-start only), this works during active games.
// The teacher's existing photos remain for current rounds (students already
// voted on them), but the teacher is removed from the participant list.
// The first waiting teacher is promoted to fill the spot.
// ─────────────────────────────────────────────────────────────────────────
export async function dropOutOfGame(
  gameId: string,
): Promise<ActionResult> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  const { data: game } = await supabase
    .from("multi_teacher_games")
    .select("id, status, created_by")
    .eq("id", gameId)
    .maybeSingle();

  if (!game) return { ok: false, error: "Game not found." };
  if (game.status === "complete" || game.status === "archived") {
    return { ok: false, error: "This game is already finished." };
  }
  if (game.created_by === userId) {
    return { ok: false, error: "The game creator cannot drop out. Delete the game instead (if forming), or mark it complete." };
  }

  // Verify teacher is an active participant
  const { data: participation } = await supabase
    .from("multi_teacher_participants")
    .select("id, participant_status")
    .eq("game_id", gameId)
    .eq("teacher_id", userId)
    .maybeSingle();

  if (!participation) {
    return { ok: false, error: "You are not in this game." };
  }

  // If they're on the waiting list, just remove them
  if (participation.participant_status === "waiting") {
    await supabase
      .from("multi_teacher_participants")
      .delete()
      .eq("id", participation.id);

    revalidatePath("/teacher/multi");
    revalidatePath(`/teacher/multi/${gameId}`);
    return { ok: true };
  }

  // Active participant dropping out — remove them
  await supabase
    .from("multi_teacher_participants")
    .delete()
    .eq("id", participation.id);

  // Promote the first waiter
  const promoted = await promoteWaiter(supabase, gameId);

  // If game is forming/ready and active count dropped below 3, revert to forming
  if (game.status === "forming" || game.status === "ready") {
    const activeCount = await countActiveParticipants(supabase, gameId);
    if (activeCount < 3) {
      await supabase
        .from("multi_teacher_games")
        .update({ status: "forming" })
        .eq("id", gameId);
    }
  }

  revalidatePath("/teacher/multi");
  revalidatePath(`/teacher/multi/${gameId}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Complete a game (Session 106 — Phase 7)
//
// Creator marks the game as complete once all rounds are done.
// Sets game status to 'complete' and all round statuses to 'complete'.
// ─────────────────────────────────────────────────────────────────────────
export async function completeGame(
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
    return { ok: false, error: "Only the game creator can complete the game." };
  }
  if (game.status !== "active") {
    return { ok: false, error: "Only active games can be completed." };
  }

  // Mark all rounds complete
  await supabase
    .from("multi_game_rounds")
    .update({ status: "complete" })
    .eq("game_id", gameId);

  // Mark game complete
  const { error: updErr } = await supabase
    .from("multi_teacher_games")
    .update({ status: "complete", updated_at: new Date().toISOString() })
    .eq("id", gameId);

  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/teacher/multi");
  revalidatePath(`/teacher/multi/${gameId}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Replay a completed game (Session 106 — Phase 7)
//
// Creates a new game with the same settings and topics. Invites waiting
// teachers from the original game. The caller becomes the creator.
// ─────────────────────────────────────────────────────────────────────────
export async function replayGame(
  originalGameId: string,
): Promise<ActionResult & { gameId?: string }> {
  const { error, supabase, userId } = await requireTeacher();
  if (error || !supabase || !userId) return { ok: false, error: error || "Auth failed." };

  const result = await buildReplayGame(supabase, originalGameId, userId);

  if ("error" in result) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/teacher/multi");
  return { ok: true, gameId: result.gameId };
}
