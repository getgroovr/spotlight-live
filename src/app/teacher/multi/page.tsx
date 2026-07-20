// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/multi/page.tsx
//
// Session 98: Multi-teacher game dashboard.
//
// Shows available games to join, games the teacher participates in,
// and a form to create new games. Each teacher uploads their own
// photos — there is no shared pot.
// ─────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { MultiClient, type GameData, type ParticipantData, type PhotoData } from "./multi-client";

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

// ── TopNav — shared with other teacher pages ────────────────────────────
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
        style={{
          color: C.textDim,
          textDecoration: "none",
          paddingBottom: 6,
          marginBottom: -1,
          fontWeight: 500,
        }}
      >
        Class
      </Link>
      <Link
        href="/teacher/deck"
        style={{
          color: C.textDim,
          textDecoration: "none",
          paddingBottom: 6,
          marginBottom: -1,
          fontWeight: 500,
        }}
      >
        Deck
      </Link>
      <span
        style={{
          fontWeight: 700,
          color: C.light,
          borderBottom: `2px solid ${C.light}`,
          paddingBottom: 6,
          marginBottom: -1,
        }}
      >
        Multi
      </span>
      <Link
        href="/teacher/profile"
        style={{
          color: C.textDim,
          textDecoration: "none",
          paddingBottom: 6,
          marginBottom: -1,
          fontWeight: 500,
        }}
      >
        Profile
      </Link>
    </nav>
  );
}

export default async function MultiTeacherPage() {
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
  const teacherName = profile.display_name || "You";

  // ── Fetch all visible games ────────────────────────────────────────
  // Games the teacher created or participates in, plus forming games
  const { data: games } = await supabase
    .from("multi_teacher_games")
    .select("*")
    .order("created_at", { ascending: false });

  // ── Fetch all participants for these games ─────────────────────────
  const gameIds = (games || []).map((g) => g.id);
  let participants: ParticipantData[] = [];
  if (gameIds.length > 0) {
    const { data: pRows } = await supabase
      .from("multi_teacher_participants")
      .select("id, game_id, teacher_id, joined_at")
      .in("game_id", gameIds);
    participants = pRows || [];
  }

  // ── Fetch teacher names for all participants ──────────────────────
  const participantTeacherIds = [...new Set(participants.map((p) => p.teacher_id))];
  const teacherNames: Record<string, string> = {};
  if (participantTeacherIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, username")
      .in("id", participantTeacherIds);
    (profiles || []).forEach((p) => {
      teacherNames[p.id] = p.display_name || p.username || p.id.slice(0, 8);
    });
  }

  // ── Fetch photos for games the teacher is in ──────────────────────
  const myGameIds = participants
    .filter((p) => p.teacher_id === teacherId)
    .map((p) => p.game_id);

  let photos: PhotoData[] = [];
  if (myGameIds.length > 0) {
    const { data: pRows } = await supabase
      .from("multi_teacher_photos")
      .select("id, game_id, teacher_id, media_url, description_text, round_number, is_active, created_at")
      .in("game_id", myGameIds)
      .order("created_at", { ascending: true });
    photos = pRows || [];
  }

  // ── Build game data ───────────────────────────────────────────────
  const gameData: GameData[] = (games || []).map((g) => ({
    id: g.id,
    topic: g.topic,
    total_rounds: g.total_rounds,
    round_duration_hours: g.round_duration_hours,
    game_phase_hours: g.game_phase_hours,
    review_phase_hours: g.review_phase_hours,
    created_by: g.created_by,
    created_by_name: teacherNames[g.created_by] || "Unknown",
    status: g.status,
    created_at: g.created_at,
    participants: participants
      .filter((p) => p.game_id === g.id)
      .map((p) => ({
        ...p,
        name: teacherNames[p.teacher_id] || p.teacher_id.slice(0, 8),
      })),
    photos: photos.filter((p) => p.game_id === g.id),
    isParticipant: participants.some(
      (p) => p.game_id === g.id && p.teacher_id === teacherId,
    ),
    isCreator: g.created_by === teacherId,
  }));

  return (
    <div style={{ fontFamily: "'Outfit',sans-serif" }}>
      <TopNav />
      <h1
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: C.text,
          margin: "0 0 16px",
        }}
      >
        Multi-teacher games
      </h1>
      <MultiClient
        games={gameData}
        teacherId={teacherId}
        teacherName={teacherName}
      />
    </div>
  );
}
