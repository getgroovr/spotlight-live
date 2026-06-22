// ─────────────────────────────────────────────────────────────────────────
// src/lib/game-results.ts — data layer for the end-of-game celebration page.
//
// Queries all game_sessions for a class, tallies favorites per round,
// and returns the "winner" (most-favorited entry) for each round plus
// the current student's own pick.
//
// Session 44 — B19 fix: the game-over page needs actual content, not
// just a dead-end message.
//
// Data shape:
//   Each round produces a RoundResult with:
//     - winner: the entry that got the most favorite votes
//     - winnerName: display name of the student who submitted it
//     - voteCount: how many students picked it as their favorite
//     - yourPick: the entry the current student favorited (if different
//       from winner, shown as a secondary callout)
//     - yourPickName: display name of who submitted your pick
//     - youPickedWinner: true if your pick === the winner
//
// Bucket handling:
//   Student entries → media bucket (private, signed URLs)
//   Starter entries → teacher-deck bucket (public, getPublicUrl)
//   Full URLs → passthrough (seed/test data)
// ─────────────────────────────────────────────────────────────────────────
import "server-only";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const MEDIA_BUCKET = "media";
const SIGNED_URL_TTL = 60 * 60; // 1 hour

export type RoundResult = {
  roundNumber: number;
  winner: {
    entryId: string;
    photoUrl: string | null;
    description: string;
    studentName: string;
    voteCount: number;
  };
  yourPick: {
    entryId: string;
    photoUrl: string | null;
    description: string;
    studentName: string;
  } | null;
  youPickedWinner: boolean;
  totalVoters: number;  // how many students played this round
};

export type GameResultsData =
  | { ok: true; rounds: RoundResult[]; studentName: string; className: string }
  | { ok: false; error: string };

export async function getGameResults(): Promise<GameResultsData> {
  const ssr = await createClient();
  if (!ssr) return { ok: false, error: "config" };

  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return { ok: false, error: "no-session" };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { ok: false, error: "config" };
  const admin = createServiceClient(supabaseUrl, serviceKey);

  // ── Resolve student + class ──────────────────────────────────────────
  const { data: profile } = await admin
    .from("profiles")
    .select("class_id, display_name")
    .eq("id", user.id)
    .maybeSingle();
  const classId = profile?.class_id;
  if (!classId) return { ok: false, error: "no-class" };

  const { data: student } = await admin
    .from("students")
    .select("id, screen_name, name")
    .eq("email", user.email!.toLowerCase())
    .maybeSingle();
  if (!student) return { ok: false, error: "no-student" };

  const studentName = student.screen_name || student.name || "there";

  // Get class name + total_rounds
  const { data: classRow } = await admin
    .from("classes")
    .select("name, total_rounds")
    .eq("id", classId)
    .maybeSingle();
  const className = classRow?.name || "your class";
  const totalRounds = classRow?.total_rounds || 3;

  // ── Get ALL game sessions for this class (all students, all rounds) ──
  // game_sessions.student_id = students.id (NOT auth.users.id)
  //
  // Round-0 convention:
  //   round 0 = warm-up (enrollStudent writes this)
  //   round 1+ = student game rounds (saveStudentRound writes currentRound)
  //
  // The favorites in game_sessions contain { entryId: true } — one per session.
  // To find the most-favorited entry per round, we count across all sessions.

  const { data: allSessions } = await admin
    .from("game_sessions")
    .select("id, student_id, round, favorites, comments")
    .eq("class_id", classId)
    .order("round", { ascending: true });

  if (!allSessions || allSessions.length === 0) {
    return { ok: false, error: "no-sessions" };
  }

  // Group sessions by round and tally favorites
  // Map: round → Map: entryId → count
  const roundTallies = new Map<number, Map<string, number>>();
  const roundVoterCounts = new Map<number, number>();
  // Track the current student's pick per round
  const myPickPerRound = new Map<number, string>();

  for (const session of allSessions) {
    const round = session.round as number;
    const favorites = (session.favorites || {}) as Record<string, boolean>;
    const favEntryId = Object.keys(favorites).find((k) => favorites[k]);

    if (!favEntryId) continue;

    // Tally
    if (!roundTallies.has(round)) roundTallies.set(round, new Map());
    const tally = roundTallies.get(round)!;
    tally.set(favEntryId, (tally.get(favEntryId) || 0) + 1);

    // Voter count
    roundVoterCounts.set(round, (roundVoterCounts.get(round) || 0) + 1);

    // Is this the current student's session?
    if (session.student_id === student.id) {
      myPickPerRound.set(round, favEntryId);
    }
  }

  // Skip round 0 (warm-up) — only show game rounds (1, 2, 3, ...)
  // The warm-up used starter photos (teacher's deck), while game rounds use
  // student photos. We include all rounds that have votes and let the page
  // label them. Round 0 = warm-up, rounds 1+ = student rounds.

  // For each round, find the winner (most-voted entry)
  const entryIdsNeeded = new Set<string>();
  const winnerPerRound = new Map<number, { entryId: string; voteCount: number }>();

  for (const [round, tally] of roundTallies) {
    let maxVotes = 0;
    let winnerId = "";
    for (const [entryId, count] of tally) {
      if (count > maxVotes) {
        maxVotes = count;
        winnerId = entryId;
      }
      entryIdsNeeded.add(entryId);
    }
    winnerPerRound.set(round, { entryId: winnerId, voteCount: maxVotes });
  }

  // Also add the student's own picks
  for (const entryId of myPickPerRound.values()) {
    entryIdsNeeded.add(entryId);
  }

  // ── Fetch entry details for all referenced entries ───────────────────
  const entryIds = Array.from(entryIdsNeeded);
  if (entryIds.length === 0) {
    return { ok: false, error: "no-favorites" };
  }

  const { data: entries } = await admin
    .from("entries")
    .select("id, student_id, media_url, description_text, is_starter, status")
    .in("id", entryIds);

  // Sign or resolve URLs
  async function resolveUrl(mediaUrl: string | null, isStarter: boolean): Promise<string | null> {
    if (!mediaUrl) return null;

    // Full URL passthrough (seed data, external images)
    if (mediaUrl.startsWith("http://") || mediaUrl.startsWith("https://")) {
      return mediaUrl;
    }

    if (isStarter) {
      // Starter entries live in the public teacher-deck bucket
      const { data } = admin.storage.from("teacher-deck").getPublicUrl(mediaUrl);
      return data?.publicUrl ?? null;
    }

    // Student entries live in the private media bucket
    try {
      const { data, error } = await admin.storage
        .from(MEDIA_BUCKET)
        .createSignedUrl(mediaUrl, SIGNED_URL_TTL);
      if (error || !data?.signedUrl) return null;
      return data.signedUrl;
    } catch {
      return null;
    }
  }

  // Build entry lookup with signed URLs
  const entryMap = new Map<string, {
    photoUrl: string | null;
    description: string;
    studentAuthId: string; // entries.student_id = auth.users.id = profiles.id
  }>();

  for (const e of entries || []) {
    const url = await resolveUrl(e.media_url, e.is_starter);
    entryMap.set(e.id, {
      photoUrl: url,
      description: e.description_text || "",
      studentAuthId: e.student_id,
    });
  }

  // ── Resolve display names for entry submitters ───────────────────────
  // entries.student_id = auth.users.id = profiles.id
  // We need to go auth.users → email → students → screen_name
  const authIdsNeeded = new Set<string>();
  for (const e of entryMap.values()) authIdsNeeded.add(e.studentAuthId);

  const nameByAuthId = new Map<string, string>();

  for (const authId of authIdsNeeded) {
    // Get email from auth, then name from students
    try {
      const { data: { user: authUser } } = await admin.auth.admin.getUserById(authId);
      if (authUser?.email) {
        const { data: stu } = await admin
          .from("students")
          .select("screen_name, name")
          .eq("email", authUser.email.toLowerCase())
          .maybeSingle();
        nameByAuthId.set(authId, stu?.screen_name || stu?.name || authUser.email);
      }
    } catch {
      // Check profiles as fallback
      const { data: prof } = await admin
        .from("profiles")
        .select("display_name, username")
        .eq("id", authId)
        .maybeSingle();
      nameByAuthId.set(authId, prof?.display_name || prof?.username || "A classmate");
    }
  }

  // ── Assemble round results ───────────────────────────────────────────
  const rounds: RoundResult[] = [];

  // Sort rounds numerically
  const sortedRounds = Array.from(winnerPerRound.keys()).sort((a, b) => a - b);

  for (const roundNum of sortedRounds) {
    const winner = winnerPerRound.get(roundNum)!;
    const winnerEntry = entryMap.get(winner.entryId);
    if (!winnerEntry) continue;

    const myPickId = myPickPerRound.get(roundNum) || null;
    const youPickedWinner = myPickId === winner.entryId;

    let yourPick: RoundResult["yourPick"] = null;
    if (myPickId && !youPickedWinner) {
      const pickEntry = entryMap.get(myPickId);
      if (pickEntry) {
        yourPick = {
          entryId: myPickId,
          photoUrl: pickEntry.photoUrl,
          description: pickEntry.description,
          studentName: nameByAuthId.get(pickEntry.studentAuthId) || "A classmate",
        };
      }
    }

    rounds.push({
      roundNumber: roundNum,
      winner: {
        entryId: winner.entryId,
        photoUrl: winnerEntry.photoUrl,
        description: winnerEntry.description,
        studentName: nameByAuthId.get(winnerEntry.studentAuthId) || "A classmate",
        voteCount: winner.voteCount,
      },
      yourPick,
      youPickedWinner,
      totalVoters: roundVoterCounts.get(roundNum) || 0,
    });
  }

  return { ok: true, rounds, studentName, className };
}
