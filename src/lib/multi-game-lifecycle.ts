// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/lib/multi-game-lifecycle.ts
//
// Session 106 (Phase 7): Lifecycle helpers for multi-teacher games.
//
// checkAutoArchive — archive forming games past their deadline
// promoteWaiter — move first waiting teacher to active when a slot opens
// buildReplayGame — create a new game from a completed game's settings
// ─────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Archive any forming games whose archive_after deadline has passed.
 * Call this on lobby page load — it's idempotent and cheap.
 */
export async function checkAutoArchive(supabase: SupabaseClient): Promise<number> {
  const now = new Date().toISOString();

  const { data: staleGames } = await supabase
    .from("multi_teacher_games")
    .select("id")
    .eq("status", "forming")
    .not("archive_after", "is", null)
    .lt("archive_after", now);

  if (!staleGames || staleGames.length === 0) return 0;

  const ids = staleGames.map((g) => g.id);
  await supabase
    .from("multi_teacher_games")
    .update({ status: "archived", updated_at: now })
    .in("id", ids);

  return ids.length;
}

/**
 * Promote the earliest-joined waiting teacher to active status.
 * Returns the promoted teacher's ID, or null if no one is waiting.
 */
export async function promoteWaiter(
  supabase: SupabaseClient,
  gameId: string,
): Promise<string | null> {
  // Find the first waiter by join order
  const { data: waiter } = await supabase
    .from("multi_teacher_participants")
    .select("id, teacher_id")
    .eq("game_id", gameId)
    .eq("participant_status", "waiting")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!waiter) return null;

  await supabase
    .from("multi_teacher_participants")
    .update({ participant_status: "active" })
    .eq("id", waiter.id);

  return waiter.teacher_id;
}

/**
 * Count active participants in a game.
 */
export async function countActiveParticipants(
  supabase: SupabaseClient,
  gameId: string,
): Promise<number> {
  const { count } = await supabase
    .from("multi_teacher_participants")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId)
    .eq("participant_status", "active");

  return count ?? 0;
}

/**
 * Build a replay game from a completed game.
 * Copies topic, round count, timing settings. Links via replay_of.
 * The caller (creator) becomes the first participant.
 *
 * Returns the new game ID, or an error string.
 */
export async function buildReplayGame(
  supabase: SupabaseClient,
  originalGameId: string,
  creatorId: string,
): Promise<{ gameId: string } | { error: string }> {
  // Fetch original game
  const { data: original } = await supabase
    .from("multi_teacher_games")
    .select("*")
    .eq("id", originalGameId)
    .maybeSingle();

  if (!original) return { error: "Original game not found." };
  if (original.status !== "complete") {
    return { error: "Only completed games can be replayed." };
  }

  // Create the replay game
  const { data: newGame, error: insErr } = await supabase
    .from("multi_teacher_games")
    .insert({
      topic: original.topic,
      total_rounds: original.total_rounds,
      round_duration_hours: original.round_duration_hours,
      game_phase_hours: original.game_phase_hours,
      review_phase_hours: original.review_phase_hours,
      avatar_mode: original.avatar_mode,
      created_by: creatorId,
      status: "forming",
      replay_of: originalGameId,
      archive_after: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString(), // 7-day deadline
    })
    .select("id")
    .single();

  if (insErr || !newGame) {
    return { error: insErr?.message || "Failed to create replay game." };
  }

  // Create round rows (copy topics from original)
  const { data: originalRounds } = await supabase
    .from("multi_game_rounds")
    .select("round_number, topic")
    .eq("game_id", originalGameId)
    .order("round_number", { ascending: true });

  const roundRows = (originalRounds || []).map((r) => ({
    game_id: newGame.id,
    round_number: r.round_number,
    topic: r.topic,
    status: "upcoming",
  }));

  if (roundRows.length > 0) {
    await supabase.from("multi_game_rounds").insert(roundRows);
  }

  // Add creator as first participant
  await supabase
    .from("multi_teacher_participants")
    .insert({
      game_id: newGame.id,
      teacher_id: creatorId,
      participant_status: "active",
    });

  // Promote waiting teachers from the original game (up to 2 more)
  const { data: waiters } = await supabase
    .from("multi_teacher_participants")
    .select("teacher_id")
    .eq("game_id", originalGameId)
    .eq("participant_status", "waiting")
    .order("joined_at", { ascending: true })
    .limit(2);

  if (waiters && waiters.length > 0) {
    const waiterRows = waiters.map((w) => ({
      game_id: newGame.id,
      teacher_id: w.teacher_id,
      participant_status: "active" as const,
    }));
    await supabase.from("multi_teacher_participants").insert(waiterRows);
  }

  return { gameId: newGame.id };
}
