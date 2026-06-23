// ─────────────────────────────────────────────────────────────────────────
// src/lib/game-results.ts — data layer for the end-of-game celebration page.
//
// Session 52C redesign: instead of showing a single winner per round,
// return the top 3 most-favorited entries (gold / silver / bronze) along
// with every comment classmates wrote about those entries. The page
// shows photos + comments so the results feel communal, not just a
// scoreboard.
//
// Data shape per round:
//   topEntries[] — up to 3 entries, sorted by vote count descending.
//     Each has: rank (1/2/3), photo, description, student name, vote
//     count, and an array of { studentName, text } comments from all
//     the game_sessions that referenced that entry.
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

export type EntryComment = {
  studentName: string;
  text: string;
};

export type TopEntry = {
  rank: number;              // 1 = gold, 2 = silver, 3 = bronze
  entryId: string;
  photoUrl: string | null;
  description: string;
  studentName: string;
  voteCount: number;
  comments: EntryComment[];  // every comment written about this entry
};

export type RoundResult = {
  roundNumber: number;
  topEntries: TopEntry[];
  totalVoters: number;       // how many students played this round
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

  // Get class name
  const { data: classRow } = await admin
    .from("classes")
    .select("name, total_rounds")
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

  // ── Tally favorites per round AND collect comments per entry ─────────
  // roundTallies: round → entryId → favorite vote count
  // entryComments: entryId → array of { studentId (students.id), text }
  const roundTallies = new Map<number, Map<string, number>>();
  const roundVoterCounts = new Map<number, number>();
  const entryComments = new Map<string, { studentId: string; text: string }[]>();

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
    }

    // Collect ALL comments (not just for the favorite)
    for (const [entryId, text] of Object.entries(comments)) {
      if (!text || typeof text !== "string" || !text.trim()) continue;
      if (!entryComments.has(entryId)) entryComments.set(entryId, []);
      entryComments.get(entryId)!.push({
        studentId: session.student_id,
        text: text.trim(),
      });
    }
  }

  // ── Find top 3 entries per round ─────────────────────────────────────
  const entryIdsNeeded = new Set<string>();
  const topPerRound = new Map<number, { entryId: string; voteCount: number }[]>();

  for (const [round, tally] of roundTallies) {
    const sorted = Array.from(tally.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    topPerRound.set(round, sorted.map(([entryId, voteCount]) => ({ entryId, voteCount })));
    for (const [entryId] of sorted) entryIdsNeeded.add(entryId);
  }

  // Also need entry IDs referenced in comments for the top entries
  // (already covered by entryIdsNeeded above)

  if (entryIdsNeeded.size === 0) {
    return { ok: false, error: "no-favorites" };
  }

  // ── Fetch entry details ──────────────────────────────────────────────
  const { data: entries } = await admin
    .from("entries")
    .select("id, student_id, media_url, description_text, is_starter, status")
    .in("id", Array.from(entryIdsNeeded));

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
    studentAuthId: string;
  }>();

  for (const e of entries || []) {
    const url = await resolveUrl(e.media_url, e.is_starter);
    entryMap.set(e.id, {
      photoUrl: url,
      description: e.description_text || "",
      studentAuthId: e.student_id,
    });
  }

  // ── Resolve display names ────────────────────────────────────────────
  // Need names for: entry submitters (auth IDs) and comment authors
  // (students.id). Two separate ID spaces.

  // 1. Entry submitters: entries.student_id = auth user id
  const authIdsNeeded = new Set<string>();
  for (const e of entryMap.values()) authIdsNeeded.add(e.studentAuthId);

  const nameByAuthId = new Map<string, string>();
  for (const authId of authIdsNeeded) {
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
      const { data: prof } = await admin
        .from("profiles")
        .select("display_name, username")
        .eq("id", authId)
        .maybeSingle();
      nameByAuthId.set(authId, prof?.display_name || prof?.username || "A classmate");
    }
  }

  // 2. Comment authors: game_sessions.student_id = students.id
  const commentStudentIds = new Set<string>();
  for (const comments of entryComments.values()) {
    for (const c of comments) commentStudentIds.add(c.studentId);
  }

  const nameByStudentId = new Map<string, string>();
  if (commentStudentIds.size > 0) {
    const { data: commentStudents } = await admin
      .from("students")
      .select("id, screen_name, name")
      .in("id", Array.from(commentStudentIds));
    for (const s of commentStudents || []) {
      nameByStudentId.set(s.id, s.screen_name || s.name || "A classmate");
    }
  }

  // ── Assemble round results ───────────────────────────────────────────
  const rounds: RoundResult[] = [];
  const sortedRounds = Array.from(topPerRound.keys()).sort((a, b) => a - b);

  for (const roundNum of sortedRounds) {
    const topList = topPerRound.get(roundNum)!;
    const topEntries: TopEntry[] = [];

    for (let i = 0; i < topList.length; i++) {
      const { entryId, voteCount } = topList[i];
      const entry = entryMap.get(entryId);
      if (!entry) continue;

      // Gather comments for this entry
      const rawComments = entryComments.get(entryId) || [];
      const resolvedComments: EntryComment[] = rawComments.map((c) => ({
        studentName: nameByStudentId.get(c.studentId) || "A classmate",
        text: c.text,
      }));

      topEntries.push({
        rank: i + 1,
        entryId,
        photoUrl: entry.photoUrl,
        description: entry.description,
        studentName: nameByAuthId.get(entry.studentAuthId) || "A classmate",
        voteCount,
        comments: resolvedComments,
      });
    }

    if (topEntries.length > 0) {
      rounds.push({
        roundNumber: roundNum,
        topEntries,
        totalVoters: roundVoterCounts.get(roundNum) || 0,
      });
    }
  }

  return { ok: true, rounds, studentName, className };
}
