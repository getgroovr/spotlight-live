// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/multi/page.tsx
//
// Session 98: Multi-teacher game dashboard.
// Session 100: Fixed centering — wrapped in maxWidth container to match
//   other teacher pages. Removed duplicate h1 (client already has one).
//   Added page background and min-height.
// Session 106 (Phases 7–8): Fetches participant_status for waiting list.
//   Calls checkAutoArchive on load. Passes myParticipantStatus and
//   waitingCount to client.
// ─────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { MultiClient, type GameData, type ParticipantData, type PhotoData } from "./multi-client";
import { checkAutoArchive } from "@/lib/multi-game-lifecycle";

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
const F = "'Outfit',sans-serif";

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

  // ── Session 106: Auto-archive stale forming games ───────────────────
  await checkAutoArchive(supabase);

  // ── Fetch all visible games (exclude archived from non-participants) ─
  const { data: games } = await supabase
    .from("multi_teacher_games")
    .select("*")
    .order("created_at", { ascending: false });

  // ── Fetch all participants for these games ─────────────────────────
  const gameIds = (games || []).map((g) => g.id);
  let participants: (ParticipantData & { participant_status?: string })[] = [];
  if (gameIds.length > 0) {
    const { data: pRows } = await supabase
      .from("multi_teacher_participants")
      .select("id, game_id, teacher_id, joined_at, participant_status")
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
  const gameData: GameData[] = (games || [])
    // Session 106: hide archived games the teacher isn't part of
    .filter((g) => g.status !== "archived" || participants.some(
      (p) => p.game_id === g.id && p.teacher_id === teacherId,
    ))
    .map((g) => {
      const gameParticipants = participants.filter((p) => p.game_id === g.id);
      const activeParticipants = gameParticipants.filter(
        (p) => (p.participant_status || "active") === "active",
      );
      const waitingParticipants = gameParticipants.filter(
        (p) => p.participant_status === "waiting",
      );
      const myParticipation = gameParticipants.find(
        (p) => p.teacher_id === teacherId,
      );

      return {
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
        // Show only active participants in the lobby cards
        participants: activeParticipants.map((p) => ({
          ...p,
          name: teacherNames[p.teacher_id] || p.teacher_id.slice(0, 8),
        })),
        photos: photos.filter((p) => p.game_id === g.id),
        isParticipant: !!myParticipation,
        isCreator: g.created_by === teacherId,
        myParticipantStatus: myParticipation?.participant_status || undefined,
        waitingCount: waitingParticipants.length,
      };
    });

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        padding: "1.5rem 1rem 4rem",
        fontFamily: F,
        color: C.text,
        colorScheme: "light",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <TopNav />
        <MultiClient
          games={gameData}
          teacherId={teacherId}
          teacherName={teacherName}
        />
      </div>
    </div>
  );
}
