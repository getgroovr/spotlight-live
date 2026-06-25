// ─────────────────────────────────────────────────────────────────────────
// src/lib/game-results.ts — data layer for the end-of-game celebration page.
//
// Session 54 redesign (B45):
//   • Rank entries by favorite vote count — 1st/2nd/3rd with tie handling.
//     Ties share the same rank (two golds → no silver, next is bronze).
//   • Only return comments from students who FAVORITED that entry.
//     If an entry got 4 favorite votes, show those 4 comments.
//   • Fully anonymous — no student names on submissions or comments.
//
// Session 57 — B50 awards ceremony voting rules:
//   • Competition ranking (1-2-2-4 style): ties share rank, next rank skipped.
//   • Minimum vote threshold: a winner MUST have >1 vote (MIN_VOTES = 2).
//     If nobody clears the threshold in a round → noWinners = true →
//     UI shows "No clear favorite this round" instead of false winners.
//
// Data shape per round:
//   topEntries[] — up to 3 ranked positions, sorted by vote count desc.
//     Each has: rank (1/2/3), photo, description, vote count, and an
//     array of anonymous comment strings from students who favorited it.
//   noWinners — true if nobody met the minimum vote threshold.
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

export type TopEntry = {
  rank: number;              // 1 = gold, 2 = silver, 3 = bronze
  entryId: string;
  photoUrl: string | null;
  description: string;
  voteCount: number;
  comments: string[];        // anonymous comments from students who favorited this
};

export type RoundResult = {
  roundNumber: number;
  topEntries: TopEntry[];
  totalVoters: number;       // how many students voted this round
  noWinners: boolean;        // B50: true if nobody met the minimum vote threshold
};

export type GameResultsData =
  | { ok: true; rounds: RoundResult[]; className: string }
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
    .select("class_id")
    .eq("id", user.id)
    .maybeSingle();
  const classId = profile?.class_id;
  if (!classId) return { ok: false, error: "no-class" };

  // Get class name
  const { data: classRow } = await admin
    .from("classes")
    .select("name")
    .eq("id", classId)
    .maybeSingle();
  const className = classRow?.name || "your class";

  // ── Get ALL game sessions for this class ─────────────────────────────
  const { data: allSessions } = await admin
    .from("game_sessions")
    .select("id, student_id, round, favorites, comments")
    .eq("class_id", classId)
    .order("round", { ascending: true });

  if (!allSessions || allSessions.length === 0) {
    return { ok: false, error: "no-sessions" };
  }

  // ── Tally favorites per round AND collect favorite-only comments ─────
  // roundTallies:     round → entryId → favorite vote count
  // favoriteComments: entryId → array of anonymous comment strings
  //   (only from students who picked this entry as their favorite)
  const roundTallies = new Map<number, Map<string, number>>();
  const roundVoterCounts = new Map<number, number>();
  const favoriteComments = new Map<string, string[]>();

  for (const session of allSessions) {
    const round = session.round as number;
    const favorites = (session.favorites || {}) as Record<string, boolean>;
    const comments = (session.comments || {}) as Record<string, string>;
    const favEntryId = Object.keys(favorites).find((k) => favorites[k]);

    // Tally favorite votes
    if (favEntryId) {
      if (!roundTallies.has(round)) roundTallies.set(round, new Map());
      const tally = roundTallies.get(round)!;
      tally.set(favEntryId, (tally.get(favEntryId) || 0) + 1);
      roundVoterCounts.set(round, (roundVoterCounts.get(round) || 0) + 1);

      // Only capture the comment this student wrote about their FAVORITE
      const favComment = comments[favEntryId];
      if (favComment && typeof favComment === "string" && favComment.trim()) {
        if (!favoriteComments.has(favEntryId)) favoriteComments.set(favEntryId, []);
        favoriteComments.get(favEntryId)!.push(favComment.trim());
      }
    }
  }

  // ── Find top 3 ranked positions per round (with tie handling) ────────
  //
  // B50: Competition ranking (1-2-2-4 style) with minimum vote threshold.
  //   • A winner must have MORE THAN 1 vote — no single-vote "winners."
  //   • If two entries tie for 1st, both get gold, silver is skipped, next is bronze.
  //   • If nobody has >1 vote in a round, that round has no winners.
  const MIN_VOTES = 2; // must have at least this many votes to qualify

  const entryIdsNeeded = new Set<string>();
  const topPerRound = new Map<number, { entryId: string; voteCount: number; rank: number }[]>();
  const roundsWithNoWinners = new Set<number>();

  for (const [round, tally] of roundTallies) {
    // Filter out entries that don't meet the minimum vote threshold
    const qualified = Array.from(tally.entries())
      .filter(([, count]) => count >= MIN_VOTES)
      .sort((a, b) => b[1] - a[1]);

    if (qualified.length === 0) {
      // Nobody got enough votes — mark this round as having no winners
      roundsWithNoWinners.add(round);
      topPerRound.set(round, []);
      continue;
    }

    // Assign ranks with ties: entries with the same vote count share a rank.
    // Two golds → next is bronze (rank 3). Gold + two silvers → done (no bronze).
    const ranked: { entryId: string; voteCount: number; rank: number }[] = [];
    let currentRank = 1;

    for (let i = 0; i < qualified.length && currentRank <= 3; i++) {
      const [entryId, voteCount] = qualified[i];
      // If this entry has a different vote count than the previous, update rank
      if (i > 0 && voteCount < qualified[i - 1][1]) {
        currentRank = ranked.length + 1; // skip over tied positions
      }
      if (currentRank > 3) break;
      ranked.push({ entryId, voteCount, rank: currentRank });
      entryIdsNeeded.add(entryId);
    }

    topPerRound.set(round, ranked);
  }

  if (entryIdsNeeded.size === 0 && roundsWithNoWinners.size === 0) {
    return { ok: false, error: "no-favorites" };
  }

  // ── Fetch entry details ──────────────────────────────────────────────
  let entries: { id: string; media_url: string | null; description_text: string; is_starter: boolean }[] | null = null;
  if (entryIdsNeeded.size > 0) {
    const { data } = await admin
      .from("entries")
      .select("id, media_url, description_text, is_starter")
      .in("id", Array.from(entryIdsNeeded));
    entries = data;
  }

  // Sign or resolve URLs
  async function resolveUrl(mediaUrl: string | null, isStarter: boolean): Promise<string | null> {
    if (!mediaUrl) return null;
    if (mediaUrl.startsWith("http://") || mediaUrl.startsWith("https://")) {
      return mediaUrl;
    }
    if (isStarter) {
      const { data } = admin.storage.from("teacher-deck").getPublicUrl(mediaUrl);
      return data?.publicUrl ?? null;
    }
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

  const entryMap = new Map<string, {
    photoUrl: string | null;
    description: string;
  }>();

  for (const e of entries || []) {
    const url = await resolveUrl(e.media_url, e.is_starter);
    entryMap.set(e.id, {
      photoUrl: url,
      description: e.description_text || "",
    });
  }

  // ── Assemble round results (fully anonymous) ─────────────────────────
  const rounds: RoundResult[] = [];
  const sortedRounds = Array.from(topPerRound.keys()).sort((a, b) => a - b);

  for (const roundNum of sortedRounds) {
    const topList = topPerRound.get(roundNum)!;
    const noWinners = roundsWithNoWinners.has(roundNum);
    const topEntries: TopEntry[] = [];

    for (const { entryId, voteCount, rank } of topList) {
      const entry = entryMap.get(entryId);
      if (!entry) continue;

      // Only comments from students who favorited this entry (already filtered)
      const comments = favoriteComments.get(entryId) || [];

      topEntries.push({
        rank,
        entryId,
        photoUrl: entry.photoUrl,
        description: entry.description,
        voteCount,
        comments,
      });
    }

    // B50: Include the round even if it has no winners, so the UI can
    // show a "no clear favorite" message rather than silently hiding it.
    if (topEntries.length > 0 || noWinners) {
      rounds.push({
        roundNumber: roundNum,
        topEntries,
        totalVoters: roundVoterCounts.get(roundNum) || 0,
        noWinners,
      });
    }
  }

  return { ok: true, rounds, className };
}
