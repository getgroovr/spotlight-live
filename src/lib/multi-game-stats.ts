// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/lib/multi-game-stats.ts
//
// Session 106 (Phase 8): Aggregation queries for multi-teacher game stats.
//
// getGameStats — vote totals, comment counts, student count per game
// ─────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from "@supabase/supabase-js";

export type TeacherStat = {
  teacher_id: string;
  teacher_name: string;
  total_points: number;
  first_picks: number;
  second_picks: number;
  third_picks: number;
  favorite_comments: number;
  approved_comments: number;
};

export type GameStats = {
  total_students: number;
  total_votes: number;
  total_comments: number;
  teachers: TeacherStat[];
};

/**
 * Compute aggregate stats for a multi-teacher game.
 * Returns per-teacher point totals, pick breakdowns, and comment counts.
 */
export async function getGameStats(
  supabase: SupabaseClient,
  gameId: string,
): Promise<GameStats> {
  // ── Student count ────────────────────────────────────────────────────
  const { count: studentCount } = await supabase
    .from("multi_game_students")
    .select("student_id", { count: "exact", head: true })
    .eq("game_id", gameId);

  // ── All votes for this game ──────────────────────────────────────────
  const { data: votes } = await supabase
    .from("multi_game_votes")
    .select("photo_id, rank")
    .eq("game_id", gameId);

  // ── Map photo_id → teacher_id ────────────────────────────────────────
  const { data: photos } = await supabase
    .from("multi_teacher_photos")
    .select("id, teacher_id")
    .eq("game_id", gameId);

  const photoTeacher: Record<string, string> = {};
  (photos || []).forEach((p) => {
    photoTeacher[p.id] = p.teacher_id;
  });

  // ── Tally votes per teacher ──────────────────────────────────────────
  const pointMap: Record<string, { total: number; first: number; second: number; third: number }> = {};

  const rankPoints: Record<number, number> = { 1: 3, 2: 2, 3: 1 };

  (votes || []).forEach((v) => {
    const tid = photoTeacher[v.photo_id];
    if (!tid) return;
    if (!pointMap[tid]) pointMap[tid] = { total: 0, first: 0, second: 0, third: 0 };
    const pts = rankPoints[v.rank] || 0;
    pointMap[tid].total += pts;
    if (v.rank === 1) pointMap[tid].first++;
    else if (v.rank === 2) pointMap[tid].second++;
    else if (v.rank === 3) pointMap[tid].third++;
  });

  // ── Comment counts per teacher (favorite + approved) ─────────────────
  const { data: comments } = await supabase
    .from("multi_game_comments")
    .select("photo_id, is_favorite_comment, review_status")
    .eq("game_id", gameId)
    .is("parent_id", null); // only top-level comments

  const commentMap: Record<string, { favorites: number; approved: number }> = {};

  (comments || []).forEach((c) => {
    const tid = photoTeacher[c.photo_id];
    if (!tid) return;
    if (!commentMap[tid]) commentMap[tid] = { favorites: 0, approved: 0 };
    if (c.is_favorite_comment) commentMap[tid].favorites++;
    if (c.review_status === "approved") commentMap[tid].approved++;
  });

  // ── Fetch teacher names ──────────────────────────────────────────────
  const { data: participants } = await supabase
    .from("multi_teacher_participants")
    .select("teacher_id")
    .eq("game_id", gameId)
    .eq("participant_status", "active");

  const teacherIds = (participants || []).map((p) => p.teacher_id);
  const nameMap: Record<string, string> = {};

  if (teacherIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, username")
      .in("id", teacherIds);
    (profiles || []).forEach((p) => {
      nameMap[p.id] = p.display_name || p.username || p.id.slice(0, 8);
    });
  }

  // ── Assemble per-teacher stats ───────────────────────────────────────
  const teachers: TeacherStat[] = teacherIds.map((tid) => ({
    teacher_id: tid,
    teacher_name: nameMap[tid] || tid.slice(0, 8),
    total_points: pointMap[tid]?.total || 0,
    first_picks: pointMap[tid]?.first || 0,
    second_picks: pointMap[tid]?.second || 0,
    third_picks: pointMap[tid]?.third || 0,
    favorite_comments: commentMap[tid]?.favorites || 0,
    approved_comments: commentMap[tid]?.approved || 0,
  }));

  // Sort by total points descending
  teachers.sort((a, b) => b.total_points - a.total_points);

  return {
    total_students: studentCount ?? 0,
    total_votes: (votes || []).length,
    total_comments: (comments || []).length,
    teachers,
  };
}
