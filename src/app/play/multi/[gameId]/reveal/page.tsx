// ─────────────────────────────────────────────────────────────────────────
// src/app/play/multi/[gameId]/reveal/page.tsx
//
// Session 106 — Phase 6: Reveal Ceremony server component.
//
// Computes a personalised teacher ranking for the authenticated student
// by tallying their votes across all rounds (1st = 3 pts, 2nd = 2, 3rd = 1).
// Fetches teacher profiles, avatar assignments, and approved favorite
// comments. Passes the shaped data to RevealClient for animated display.
//
// Tiebreaker: most 1st-place votes → most 2nd-place votes → earliest join.
// ─────────────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import RevealClient from "./reveal-client";

// ── Types shared with the client ─────────────────────────────────────────
export type RevealComment = {
  body: string;
  roundNumber: number;
  rank: number; // the student's vote rank for that photo (1/2/3)
};

export type RevealClass = {
  id: string;
  level: string | null;
  isRecruiting: boolean;
};

export type RevealTeacher = {
  teacherId: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  teachingStyle: string | null;
  totalPoints: number;
  personalRank: number; // 1, 2, 3 for podium; 0 for honorable mention
  firstPlaceVotes: number;
  secondPlaceVotes: number;
  /** Monster indices this teacher played as (one per round, or same for all) */
  monsterIndices: number[];
  approvedComments: RevealComment[];
  classes: RevealClass[];
};

type Props = { params: Promise<{ gameId: string }> };

export default async function RevealPage({ params }: Props) {
  const { gameId } = await params;
  const supabase = await createClient();

  // ── 1. Auth ──────────────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/play`);

  const studentId = user.id;

  // ── 2. Game must exist and be in reveal/complete status ──────────────
  const { data: game } = await supabase
    .from("multi_teacher_games")
    .select("id, topic, status")
    .eq("id", gameId)
    .single();

  if (!game) redirect("/play");
  // Allow reveal access once game is in reveal or complete state
  if (!["reveal", "complete", "active"].includes(game.status)) {
    redirect(`/play/multi/${gameId}`);
  }

  // ── 3. Student must be enrolled ──────────────────────────────────────
  const { data: enrollment } = await supabase
    .from("multi_game_students")
    .select("student_id")
    .eq("game_id", gameId)
    .eq("student_id", studentId)
    .single();

  if (!enrollment) redirect(`/play/multi/${gameId}`);

  // ── 4. Fetch this student's votes + the photo's teacher ─────────────
  const { data: votes } = await supabase
    .from("multi_game_votes")
    .select(`
      rank,
      photo_id,
      round_id,
      multi_teacher_photos!inner ( teacher_id, round_number )
    `)
    .eq("game_id", gameId)
    .eq("student_id", studentId);

  // ── 5. Tally points per teacher ─────────────────────────────────────
  const POINTS: Record<number, number> = { 1: 3, 2: 2, 3: 1 };

  type Tally = {
    points: number;
    first: number;
    second: number;
    rounds: { roundNumber: number; rank: number; photoId: string }[];
  };
  const tallyMap = new Map<string, Tally>();

  for (const v of votes ?? []) {
    const photo = v.multi_teacher_photos as unknown as {
      teacher_id: string;
      round_number: number;
    };
    if (!photo) continue;

    const tid = photo.teacher_id;
    if (!tallyMap.has(tid)) {
      tallyMap.set(tid, { points: 0, first: 0, second: 0, rounds: [] });
    }
    const t = tallyMap.get(tid)!;
    t.points += POINTS[v.rank] ?? 0;
    if (v.rank === 1) t.first++;
    if (v.rank === 2) t.second++;
    t.rounds.push({
      roundNumber: photo.round_number,
      rank: v.rank,
      photoId: v.photo_id,
    });
  }

  // Sort: highest points → most 1st → most 2nd
  const sorted = [...tallyMap.entries()].sort((a, b) => {
    if (b[1].points !== a[1].points) return b[1].points - a[1].points;
    if (b[1].first !== a[1].first) return b[1].first - a[1].first;
    return b[1].second - a[1].second;
  });

  // Assign personal ranks: top 3 get 1/2/3, rest get 0
  const rankedTeacherIds = sorted.map(([tid]) => tid);

  // ── 6. All participants (for honorable mentions too) ─────────────────
  const { data: participants } = await supabase
    .from("multi_teacher_participants")
    .select("teacher_id, joined_at")
    .eq("game_id", gameId)
    .eq("status", "active");

  const allTeacherIds = (participants ?? []).map((p) => p.teacher_id);
  // Teachers not in student's votes (honorable mentions)
  const honorableMentionIds = allTeacherIds.filter(
    (tid) => !tallyMap.has(tid),
  );

  const allNeededIds = [...new Set([...rankedTeacherIds, ...honorableMentionIds])];

  // ── 7. Fetch teacher profiles ───────────────────────────────────────
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, bio, teaching_style")
    .in("id", allNeededIds);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p]),
  );

  // ── 8. Fetch avatar assignments for this game ───────────────────────
  const { data: avatarAssignments } = await supabase
    .from("multi_game_avatar_assignments")
    .select("teacher_id, round_number, monster_id, monster_avatars!inner ( monster_index )")
    .eq("game_id", gameId);

  // Map: teacherId → monsterIndex[]
  const avatarMap = new Map<string, number[]>();
  for (const a of avatarAssignments ?? []) {
    const mi = (a.monster_avatars as unknown as { monster_index: number })
      ?.monster_index;
    if (mi == null) continue;
    if (!avatarMap.has(a.teacher_id)) avatarMap.set(a.teacher_id, []);
    avatarMap.get(a.teacher_id)!.push(mi);
  }

  // ── 9. Fetch approved favorite comments by this student ─────────────
  // Join through photos to get round_number, and through votes to get rank.
  const { data: comments } = await supabase
    .from("multi_game_comments")
    .select(`
      body,
      photo_id,
      multi_teacher_photos!inner ( teacher_id, round_number )
    `)
    .eq("author_id", studentId)
    .eq("is_favorite_comment", true)
    .eq("review_status", "approved");

  // Group comments by teacher
  const commentMap = new Map<string, RevealComment[]>();
  for (const c of comments ?? []) {
    const photo = c.multi_teacher_photos as unknown as {
      teacher_id: string;
      round_number: number;
    };
    if (!photo) continue;
    const tid = photo.teacher_id;
    if (!commentMap.has(tid)) commentMap.set(tid, []);

    // Find the rank from the student's votes for this photo
    const votedRound = tallyMap
      .get(tid)
      ?.rounds.find(
        (r) =>
          r.roundNumber === photo.round_number && r.photoId === c.photo_id,
      );

    commentMap.get(tid)!.push({
      body: c.body,
      roundNumber: photo.round_number,
      rank: votedRound?.rank ?? 0,
    });
  }

  // ── 10. Fetch classes for each teacher (recruiting ones) ────────────
  const { data: classes } = await supabase
    .from("classes")
    .select("id, teacher_id, level, is_recruiting")
    .in("teacher_id", allNeededIds);

  const classMap = new Map<string, RevealClass[]>();
  for (const cls of classes ?? []) {
    if (!classMap.has(cls.teacher_id))
      classMap.set(cls.teacher_id, []);
    classMap.get(cls.teacher_id)!.push({
      id: cls.id,
      level: cls.level,
      isRecruiting: cls.is_recruiting,
    });
  }

  // ── 11. Assemble RevealTeacher[] ────────────────────────────────────
  const teachers: RevealTeacher[] = [];

  // Podium teachers (ranked by student's votes)
  for (let i = 0; i < sorted.length; i++) {
    const [tid, tally] = sorted[i];
    const profile = profileMap.get(tid);
    teachers.push({
      teacherId: tid,
      displayName: profile?.display_name ?? "Mystery Teacher",
      avatarUrl: profile?.avatar_url ?? null,
      bio: profile?.bio ?? null,
      teachingStyle: profile?.teaching_style ?? null,
      totalPoints: tally.points,
      personalRank: i < 3 ? i + 1 : 0,
      firstPlaceVotes: tally.first,
      secondPlaceVotes: tally.second,
      monsterIndices: avatarMap.get(tid) ?? [],
      approvedComments: commentMap.get(tid) ?? [],
      classes: classMap.get(tid) ?? [],
    });
  }

  // Honorable mentions (no votes from this student)
  for (const tid of honorableMentionIds) {
    const profile = profileMap.get(tid);
    teachers.push({
      teacherId: tid,
      displayName: profile?.display_name ?? "Mystery Teacher",
      avatarUrl: profile?.avatar_url ?? null,
      bio: profile?.bio ?? null,
      teachingStyle: profile?.teaching_style ?? null,
      totalPoints: 0,
      personalRank: 0,
      firstPlaceVotes: 0,
      secondPlaceVotes: 0,
      monsterIndices: avatarMap.get(tid) ?? [],
      approvedComments: [],
      classes: classMap.get(tid) ?? [],
    });
  }

  // ── 12. Render ──────────────────────────────────────────────────────
  return (
    <RevealClient
      gameTitle={game.topic}
      teachers={teachers}
    />
  );
}
