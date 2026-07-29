// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/multi/[gameId]/page.tsx
//
// Session 99: Game detail page — teacher's view of a specific
// multi-teacher game. Shows round tabs, per-round photo upload,
// participants, and game settings (creator only).
// Session 102: Fetches monster_avatars + avatar assignments for
//   the avatar spinner gate (Phase 3.5).
// Session 104: Added max-width wrapper matching other teacher dashboards.
//   Passes participant count to client for settings-edit gating.
// Session 105 (Phase 5): Fetches favorite comments on this teacher's
//   photos for the comment review inbox. Includes replies and author email.
// Session 106 (Phases 7–8): Fetches game stats for active/complete games.
//   Fetches waiting list participants. Passes stats + waiters to client.
// ─────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { GameDetailClient } from "./game-detail-client";
import type { CommentForReview } from "./game-detail-client";
import type { PhotoData } from "../multi-client";
import { getGameStats } from "@/lib/multi-game-stats";
import type { GameStats } from "@/lib/multi-game-stats";

export const dynamic = "force-dynamic";

const C = {
  bg: "#FBF6EC",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
};

// ── TopNav ──────────────────────────────────────────────────────────────
function TopNav() {
  return (
    <nav
      style={{
        display: "flex",
        gap: 24,
        marginBottom: 16,
        fontSize: 14,
        borderBottom: `1px solid ${C.panelEdge}55`,
        paddingBottom: 0,
      }}
    >
      <Link
        href="/teacher/students"
        style={{ color: C.textDim, textDecoration: "none", paddingBottom: 6, marginBottom: -1, fontWeight: 500 }}
      >
        Class
      </Link>
      <Link
        href="/teacher/deck"
        style={{ color: C.textDim, textDecoration: "none", paddingBottom: 6, marginBottom: -1, fontWeight: 500 }}
      >
        Deck
      </Link>
      <Link
        href="/teacher/multi"
        style={{
          fontWeight: 700,
          color: C.light,
          borderBottom: `2px solid ${C.light}`,
          paddingBottom: 6,
          marginBottom: -1,
          textDecoration: "none",
        }}
      >
        Multi
      </Link>
      <Link
        href="/teacher/profile"
        style={{ color: C.textDim, textDecoration: "none", paddingBottom: 6, marginBottom: -1, fontWeight: 500 }}
      >
        Profile
      </Link>
    </nav>
  );
}

// ── Types for the client ────────────────────────────────────────────────
export type RoundData = {
  id: string;
  round_number: number;
  topic: string;
  status: string;
};

export type ParticipantWithName = {
  id: string;
  teacher_id: string;
  name: string;
  photoCountByRound: Record<number, number>;
};

export type WaitingTeacher = {
  id: string;
  teacher_id: string;
  name: string;
};

export type GameDetailData = {
  id: string;
  topic: string;
  total_rounds: number;
  round_duration_hours: number | null;
  game_phase_hours: number | null;
  review_phase_hours: number | null;
  avatar_mode: string;
  created_by: string;
  status: string;
  created_at: string;
  isCreator: boolean;
  replay_of: string | null;
  rounds: RoundData[];
  participants: ParticipantWithName[];
  photos: PhotoData[];
  waitingList: WaitingTeacher[];
};

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;

  const supabase = await createClient();
  if (!supabase) redirect("/teacher/students");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/teacher/students");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, display_name")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "teacher") redirect("/teacher/students");

  const teacherId = profile.id;

  // ── Fetch game ────────────────────────────────────────────────────
  const { data: game } = await supabase
    .from("multi_teacher_games")
    .select("*")
    .eq("id", gameId)
    .maybeSingle();

  if (!game) notFound();

  // ── Verify teacher is a participant ────────────────────────────────
  const { data: myParticipation } = await supabase
    .from("multi_teacher_participants")
    .select("id")
    .eq("game_id", gameId)
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (!myParticipation) {
    // Not a participant — redirect back to lobby
    redirect("/teacher/multi");
  }

  // ── Fetch rounds ──────────────────────────────────────────────────
  const { data: rounds } = await supabase
    .from("multi_game_rounds")
    .select("id, round_number, topic, status")
    .eq("game_id", gameId)
    .order("round_number", { ascending: true });

  // ── Fetch participants with names ─────────────────────────────────
  const { data: participants } = await supabase
    .from("multi_teacher_participants")
    .select("id, teacher_id")
    .eq("game_id", gameId);

  const participantIds = (participants || []).map((p) => p.teacher_id);
  const teacherNames: Record<string, string> = {};
  if (participantIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, username")
      .in("id", participantIds);
    (profiles || []).forEach((p) => {
      teacherNames[p.id] = p.display_name || p.username || p.id.slice(0, 8);
    });
  }

  // ── Fetch all photos for this game ────────────────────────────────
  const { data: photos } = await supabase
    .from("multi_teacher_photos")
    .select("id, game_id, teacher_id, media_url, description_text, round_number, is_active, created_at")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true });

  // ── Build photo counts per teacher per round ──────────────────────
  const photoCounts: Record<string, Record<number, number>> = {};
  (photos || []).forEach((p) => {
    if (!photoCounts[p.teacher_id]) photoCounts[p.teacher_id] = {};
    const rn = p.round_number;
    photoCounts[p.teacher_id][rn] = (photoCounts[p.teacher_id][rn] || 0) + 1;
  });

  // ── Session 102: Fetch monsters ────────────────────────────────────
  const { data: monsters } = await supabase
    .from("monster_avatars")
    .select("id, monster_index, name, body_color, accent_color, belly_color, horn_color, personality")
    .order("monster_index", { ascending: true });

  // ── Session 102: Fetch this teacher's avatar assignments ───────────
  const { data: avatarAssignments } = await supabase
    .from("multi_game_avatar_assignments")
    .select("round_number, monster_id")
    .eq("game_id", gameId)
    .eq("teacher_id", teacherId);

  // ── Session 105: Fetch favorite comments on this teacher's photos ──
  // These feed the comment review inbox (Phase 5). Only favorite
  // comments go through the approve/reject workflow.
  const myPhotoIds = (photos || [])
    .filter((p) => p.teacher_id === teacherId)
    .map((p) => p.id);

  let commentsForReview: CommentForReview[] = [];

  if (myPhotoIds.length > 0) {
    const { data: rawComments } = await supabase
      .from("multi_game_comments")
      .select("id, photo_id, author_id, body, author_role, is_favorite_comment, review_status, created_at, reviewed_at")
      .in("photo_id", myPhotoIds)
      .eq("is_favorite_comment", true)
      .is("parent_id", null)
      .order("created_at", { ascending: false });

    if (rawComments && rawComments.length > 0) {
      // Fetch author emails
      const authorIds = [...new Set(rawComments.map((c) => c.author_id))];
      const { data: authorProfiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", authorIds);
      const emailMap: Record<string, string> = {};
      (authorProfiles || []).forEach((p) => { emailMap[p.id] = p.email || ""; });

      // Build photo lookup for thumbnails + round numbers
      const photoMap: Record<string, { media_url: string; round_number: number }> = {};
      (photos || []).forEach((p) => {
        photoMap[p.id] = { media_url: p.media_url, round_number: p.round_number };
      });

      // Fetch replies (teacher replies to these comments)
      const commentIds = rawComments.map((c) => c.id);
      const { data: replies } = await supabase
        .from("multi_game_comments")
        .select("id, parent_id, body, created_at")
        .in("parent_id", commentIds)
        .eq("author_role", "teacher")
        .order("created_at", { ascending: true });

      const replyMap: Record<string, { id: string; body: string; created_at: string }[]> = {};
      (replies || []).forEach((r) => {
        if (!replyMap[r.parent_id]) replyMap[r.parent_id] = [];
        replyMap[r.parent_id].push({ id: r.id, body: r.body, created_at: r.created_at });
      });

      commentsForReview = rawComments.map((c) => ({
        id: c.id,
        photo_id: c.photo_id,
        author_id: c.author_id,
        body: c.body,
        author_role: c.author_role,
        is_favorite_comment: c.is_favorite_comment,
        review_status: c.review_status || "pending",
        created_at: c.created_at,
        reviewed_at: c.reviewed_at || null,
        photo_media_url: photoMap[c.photo_id]?.media_url || "",
        photo_round_number: photoMap[c.photo_id]?.round_number || 1,
        author_email: emailMap[c.author_id] || null,
        replies: replyMap[c.id] || [],
      }));
    }
  }

  // ── Session 106: Fetch game stats (for active/complete games) ──────
  let gameStats: GameStats | null = null;
  if (game.status === "active" || game.status === "complete") {
    gameStats = await getGameStats(supabase, gameId);
  }

  // ── Session 106: Fetch waiting list participants ───────────────────
  const { data: waitingParticipants } = await supabase
    .from("multi_teacher_participants")
    .select("id, teacher_id")
    .eq("game_id", gameId)
    .eq("participant_status", "waiting")
    .order("joined_at", { ascending: true });

  const waitingTeacherIds = (waitingParticipants || []).map((p) => p.teacher_id);
  const waitingNames: Record<string, string> = {};
  if (waitingTeacherIds.length > 0) {
    const { data: wProfiles } = await supabase
      .from("profiles")
      .select("id, display_name, username")
      .in("id", waitingTeacherIds);
    (wProfiles || []).forEach((p) => {
      waitingNames[p.id] = p.display_name || p.username || p.id.slice(0, 8);
    });
  }

  const waitingList = (waitingParticipants || []).map((p) => ({
    id: p.id,
    teacher_id: p.teacher_id,
    name: waitingNames[p.teacher_id] || p.teacher_id.slice(0, 8),
  }));

  // ── Assemble data ─────────────────────────────────────────────────
  const gameData: GameDetailData = {
    id: game.id,
    topic: game.topic,
    total_rounds: game.total_rounds,
    round_duration_hours: game.round_duration_hours,
    game_phase_hours: game.game_phase_hours,
    review_phase_hours: game.review_phase_hours,
    avatar_mode: game.avatar_mode || "single",
    created_by: game.created_by,
    status: game.status,
    created_at: game.created_at,
    isCreator: game.created_by === teacherId,
    replay_of: game.replay_of || null,
    rounds: (rounds || []).map((r) => ({
      id: r.id,
      round_number: r.round_number,
      topic: r.topic,
      status: r.status,
    })),
    participants: (participants || []).map((p) => ({
      id: p.id,
      teacher_id: p.teacher_id,
      name: teacherNames[p.teacher_id] || p.teacher_id.slice(0, 8),
      photoCountByRound: photoCounts[p.teacher_id] || {},
    })),
    photos: (photos || []) as PhotoData[],
    waitingList,
  };

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        padding: "1.5rem 1rem 4rem",
        fontFamily: "'Outfit',sans-serif",
        color: C.text,
        colorScheme: "light",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>

      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <TopNav />

        {/* ── Back link ──────────────────────────────────────────────── */}
        <Link
          href="/teacher/multi"
          style={{
            fontSize: 13,
            color: C.light,
            textDecoration: "none",
            fontWeight: 600,
            display: "inline-block",
            marginBottom: 12,
          }}
        >
          ← All games
        </Link>

        <GameDetailClient
          game={gameData}
          teacherId={teacherId}
          monsters={monsters || []}
          avatarAssignments={avatarAssignments || []}
          comments={commentsForReview}
          gameStats={gameStats}
        />
      </div>
    </div>
  );
}
