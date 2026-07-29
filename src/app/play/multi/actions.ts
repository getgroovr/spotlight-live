// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/play/multi/actions.ts
//
// Session 105: Server actions for multi-teacher game student play.
//
// joinMultiGame — student enters email, gets magic link, added to
//   multi_game_students. If already joined, just re-sends the link.
//
// submitMultiGamePlay — end-of-game submission. Saves votes (3 ranked
//   picks) and comments (9 browse comments + 3 favorite comments) in
//   one shot. Creates auth user + multi_game_students row if needed.
//   Sends magic link for future return visits.
//
// Flow: student plays the entire game unauthenticated (client state),
// then enters email at the end to submit. This matches the existing
// visitor flow in spotlight.jsx / play/actions.ts.
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key);
}

// ─────────────────────────────────────────────────────────────────────────
// Submit the full game play — votes, comments, and join in one action.
//
// Called at the end of the game after the student has:
//   1. Shuffled through all 9 photos and commented on each
//   2. Picked their top 3 favorites with favorite comments
//
// FormData fields:
//   email        — student's email (string)
//   game_id      — UUID of the multi-teacher game
//   round_id     — UUID of the active round
//   votes        — JSON: [{ photo_id, rank }] (rank 1/2/3)
//   comments     — JSON: { [photo_id]: text } (browse comments)
//   fav_comments — JSON: { [photo_id]: text } (favorite-pick comments)
// ─────────────────────────────────────────────────────────────────────────
export async function submitMultiGamePlay(
  formData: FormData,
): Promise<ActionResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: "Server not configured." };
  }

  const admin = createServiceClient(supabaseUrl, serviceKey);

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const gameId = String(formData.get("game_id") || "");
  const roundId = String(formData.get("round_id") || "");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (!gameId || !roundId) {
    return { ok: false, error: "Missing game or round information." };
  }

  // Parse votes and comments
  let votes: { photo_id: string; rank: number }[];
  let comments: Record<string, string>;
  let favComments: Record<string, string>;
  try {
    votes = JSON.parse(String(formData.get("votes") || "[]"));
    comments = JSON.parse(String(formData.get("comments") || "{}"));
    favComments = JSON.parse(String(formData.get("fav_comments") || "{}"));
  } catch {
    return { ok: false, error: "Invalid submission data." };
  }

  if (!Array.isArray(votes) || votes.length !== 3) {
    return { ok: false, error: "Please pick exactly 3 favorites." };
  }

  // Validate game exists and is active
  const { data: game } = await admin
    .from("multi_teacher_games")
    .select("id, status")
    .eq("id", gameId)
    .maybeSingle();

  if (!game) return { ok: false, error: "Game not found." };
  if (game.status !== "active") {
    return { ok: false, error: "This game is not currently active." };
  }

  // Validate round exists
  const { data: round } = await admin
    .from("multi_game_rounds")
    .select("id, round_number")
    .eq("id", roundId)
    .maybeSingle();

  if (!round) return { ok: false, error: "Round not found." };

  // ── Find or create auth user ──────────────────────────────────────────
  // Check if user already exists in auth
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find(
    (u) => u.email?.toLowerCase() === email,
  );

  let userId: string;

  if (existingUser) {
    userId = existingUser.id;
  } else {
    // Create a new user (no password — magic link only)
    const { data: newUser, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { role: "student" },
      });

    if (createErr || !newUser?.user) {
      return {
        ok: false,
        error: `Could not create account: ${createErr?.message || "Unknown error"}`,
      };
    }
    userId = newUser.user.id;

    // Create profile row
    await admin.from("profiles").upsert(
      {
        id: userId,
        email,
        role: "student",
      },
      { onConflict: "id" },
    );
  }

  // ── Check for duplicate submission ────────────────────────────────────
  const { data: existingVote } = await admin
    .from("multi_game_votes")
    .select("id")
    .eq("game_id", gameId)
    .eq("round_id", roundId)
    .eq("student_id", userId)
    .limit(1)
    .maybeSingle();

  if (existingVote) {
    return { ok: false, error: "You've already submitted votes for this round." };
  }

  // ── Ensure student is in multi_game_students ──────────────────────────
  await admin
    .from("multi_game_students")
    .upsert(
      { game_id: gameId, student_id: userId },
      { onConflict: "game_id,student_id" },
    );

  // ── Insert votes ──────────────────────────────────────────────────────
  const voteRows = votes.map((v) => ({
    game_id: gameId,
    round_id: roundId,
    student_id: userId,
    photo_id: v.photo_id,
    rank: v.rank,
  }));

  const { error: voteErr } = await admin
    .from("multi_game_votes")
    .insert(voteRows);

  if (voteErr) {
    return { ok: false, error: `Failed to save votes: ${voteErr.message}` };
  }

  // ── Insert browse comments (non-favorite) ─────────────────────────────
  const commentRows: {
    photo_id: string;
    author_id: string;
    body: string;
    author_role: string;
    is_favorite_comment: boolean;
    is_approved: boolean;
  }[] = [];

  for (const [photoId, text] of Object.entries(comments)) {
    const trimmed = (text || "").trim();
    if (trimmed) {
      commentRows.push({
        photo_id: photoId,
        author_id: userId,
        body: trimmed,
        author_role: "student",
        is_favorite_comment: false,
        is_approved: false,
      });
    }
  }

  // ── Insert favorite comments ──────────────────────────────────────────
  for (const [photoId, text] of Object.entries(favComments)) {
    const trimmed = (text || "").trim();
    if (trimmed) {
      commentRows.push({
        photo_id: photoId,
        author_id: userId,
        body: trimmed,
        author_role: "student",
        is_favorite_comment: true,
        is_approved: false,
      });
    }
  }

  if (commentRows.length > 0) {
    const { error: commentErr } = await admin
      .from("multi_game_comments")
      .insert(commentRows);

    if (commentErr) {
      // Votes already saved — log but don't fail the whole submission
      console.error("[submitMultiGamePlay] comment insert error:", commentErr.message);
    }
  }

  // ── Send magic link ───────────────────────────────────────────────────
  const supabase = await createClient();
  if (supabase) {
    const redirectUrl = `${supabaseUrl.replace(".supabase.co", ".supabase.co")
      .replace(/\/$/, "")}`;

    await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/play/multi/${gameId}`,
      },
    });
  }

  return {
    ok: true,
    message: "Your votes are in! Check your email for a link to see your results when the reveal is ready.",
  };
}
