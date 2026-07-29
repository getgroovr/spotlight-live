// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/play/multi/[gameId]/page.tsx
//
// Session 105: Server component for the multi-teacher game student play
// page. Fetches the game, finds the active round, loads all 9 photos for
// that round (3 teachers × 3 each), loads avatar assignments + monster
// data for the reveal moments, and renders the play client.
//
// If the game isn't active or has no active round, shows a status message.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase-server";
import { MultiPlayClient } from "./play-client";

export default async function MultiGamePlayPage({
  params,
}: {
  params: { gameId: string };
}) {
  const supabase = await createClient();
  if (!supabase) {
    return <ErrorShell message="Unable to connect. Please try again later." />;
  }

  const { gameId } = params;

  // ── Fetch game ──────────────────────────────────────────────────────
  const { data: game } = await supabase
    .from("multi_teacher_games")
    .select("id, topic, status, total_rounds, avatar_mode")
    .eq("id", gameId)
    .maybeSingle();

  if (!game) {
    return <ErrorShell message="Game not found." />;
  }

  if (game.status !== "active") {
    const messages: Record<string, string> = {
      forming: "This game is still being set up by teachers. Check back soon!",
      ready: "This game is almost ready — teachers are uploading their photos.",
      complete: "This game has ended. Check the reveal page to see your results!",
    };
    return (
      <ErrorShell
        message={messages[game.status] || "This game is not currently active."}
        title={game.topic}
      />
    );
  }

  // ── Find the active round ───────────────────────────────────────────
  const { data: activeRound } = await supabase
    .from("multi_game_rounds")
    .select("id, round_number, topic, status")
    .eq("game_id", gameId)
    .eq("status", "active")
    .order("round_number", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!activeRound) {
    return (
      <ErrorShell
        message="No round is currently active. Check back when the next round opens!"
        title={game.topic}
      />
    );
  }

  // ── Fetch photos for this round ─────────────────────────────────────
  const { data: photos } = await supabase
    .from("multi_teacher_photos")
    .select("id, teacher_id, media_url, description_text, round_number")
    .eq("game_id", gameId)
    .eq("round_number", activeRound.round_number);

  if (!photos || photos.length === 0) {
    return (
      <ErrorShell
        message="Photos are still being uploaded for this round. Check back soon!"
        title={game.topic}
      />
    );
  }

  // ── Fetch avatar assignments for this round ─────────────────────────
  // Maps teacher_id → monster_id so we can reveal the avatar when a
  // student picks a favorite photo.
  const { data: avatarAssignments } = await supabase
    .from("multi_game_avatar_assignments")
    .select("teacher_id, monster_id, round_number")
    .eq("game_id", gameId)
    .eq("round_number", activeRound.round_number);

  // ── Fetch all monster definitions ───────────────────────────────────
  const { data: monsters } = await supabase
    .from("monster_avatars")
    .select("id, name, monster_index, personality, body_color, accent_color, belly_color, horn_color")
    .order("monster_index", { ascending: true });

  // ── Check if current user already submitted for this round ──────────
  let hasSubmitted = false;
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: existingVote } = await supabase
      .from("multi_game_votes")
      .select("id")
      .eq("game_id", gameId)
      .eq("round_id", activeRound.id)
      .eq("student_id", user.id)
      .limit(1)
      .maybeSingle();

    hasSubmitted = !!existingVote;
  }

  // ── Build teacher→avatar map ────────────────────────────────────────
  const teacherAvatarMap: Record<string, string> = {};
  if (avatarAssignments) {
    for (const a of avatarAssignments) {
      teacherAvatarMap[a.teacher_id] = a.monster_id;
    }
  }

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "1rem",
      }}
    >
      <MultiPlayClient
        game={{
          id: game.id,
          topic: game.topic,
          status: game.status,
          totalRounds: game.total_rounds,
        }}
        round={{
          id: activeRound.id,
          roundNumber: activeRound.round_number,
          topic: activeRound.topic,
        }}
        photos={(photos || []).map((p) => ({
          id: p.id,
          teacherId: p.teacher_id,
          mediaUrl: p.media_url,
          description: p.description_text || "",
        }))}
        monsters={(monsters || []).map((m) => ({
          id: m.id,
          name: m.name,
          monsterIndex: m.monster_index,
          personality: m.personality,
          bodyColor: m.body_color,
          accentColor: m.accent_color,
          bellyColor: m.belly_color,
        }))}
        teacherAvatarMap={teacherAvatarMap}
        hasSubmitted={hasSubmitted}
      />
    </div>
  );
}

// ── Shared error/status shell ─────────────────────────────────────────
function ErrorShell({
  message,
  title,
}: {
  message: string;
  title?: string;
}) {
  return (
    <div
      style={{
        maxWidth: 480,
        margin: "3rem auto",
        textAlign: "center",
        padding: "2rem 1.5rem",
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12 }}>🎪</div>
      {title && (
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#3A2A18",
            margin: "0 0 12px",
          }}
        >
          {title}
        </h1>
      )}
      <p
        style={{
          fontSize: 15,
          color: "#6E5536",
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        {message}
      </p>
      <a
        href="/play"
        style={{
          display: "inline-block",
          marginTop: 24,
          fontSize: 14,
          fontWeight: 600,
          color: "#D98A2B",
          textDecoration: "none",
        }}
      >
        ← Back to browse
      </a>
    </div>
  );
}
