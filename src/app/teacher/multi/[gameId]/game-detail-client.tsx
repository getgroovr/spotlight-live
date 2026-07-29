// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/multi/[gameId]/game-detail-client.tsx
//
// Session 99: Client component for the game detail page.
// Session 102: Avatar spinner gate — if no avatar assigned for this round,
//   show the spinner before the upload form. Shows assigned avatar badge
//   once the teacher has spun.
// Session 104:
//   - Topic section is collapsible (sub-button)
//   - Spin gate: can't spin for round N until ≥1 photo uploaded for round N-1
//   - Game settings editable by creator until another teacher joins
//   - Avatar badge links to full personality profile
// Session 105 (Phase 5 — Comment Review + Teacher Feedback):
//   - CommentInbox: collapsible section in RoundPanel showing favorite
//     comments from students. Approve/reject for reveal, reply, flag.
// Session 106 (Phases 7–8 — Lifecycle + Stats):
//   - StatsSection: engagement metrics per teacher (votes, picks, comments)
//   - Complete game button (creator, active game)
//   - Replay button (creator, completed game)
//   - Waiting list display
//   - Drop out button for non-creator participants
//
// Round tabs — each round shows:
//   - Avatar assignment (spinner gate, Session 102)
//   - Topic (editable by creator, collapsible)
//   - Your photos (upload up to 3 per round)
//   - Readiness indicator per participant
//
// Creator sees game controls (start, settings).
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import {
  uploadMultiPhoto,
  deleteMultiPhoto,
  startMultiGame,
  updateRoundTopic,
  updateGameSettings,
  approveComment,
  rejectComment,
  replyToComment,
  flagStudent,
  completeGame,
  replayGame,
  dropOutOfGame,
} from "../actions";
import { AvatarSpinner } from "./avatar-spinner";
import type { MonsterRow } from "./avatar-spinner";
import { MonsterAvatar } from "@/game/monsters.jsx";
import type { GameDetailData, RoundData, ParticipantWithName } from "./page";
import type { PhotoData } from "../multi-client";
import type { GameStats } from "@/lib/multi-game-stats";

// ── Colors ──────────────────────────────────────────────────────────────
const C = {
  bg: "#FBF6EC",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
  success: "#2B8A3E",
  error: "#C53030",
};

function formatDuration(hours: number | null): string {
  if (hours == null) return "—";
  if (hours === 0) return "none";
  const labels: Record<string, string> = {
    "0.25": "15 min", "0.5": "30 min", "1": "1 hr", "1.5": "90 min",
    "2": "2 hr", "5": "5 hr", "6": "6 hr", "12": "12 hr",
    "22": "22 hr", "24": "1 day",
    "46": "46 hr", "48": "2 days", "144": "6 days", "168": "1 week",
  };
  return labels[String(hours)] || `${hours}h`;
}

const ROUND_TIME_OPTIONS = [
  { value: 1, label: "1 hr" },
  { value: 2, label: "2 hr" },
  { value: 6, label: "6 hr" },
  { value: 12, label: "12 hr" },
  { value: 24, label: "1 day" },
  { value: 48, label: "2 days" },
  { value: 168, label: "1 week" },
];

const REVIEW_TIME_OPTIONS = [
  { value: 0, label: "None" },
  { value: 0.5, label: "30 min" },
  { value: 1, label: "1 hr" },
  { value: 2, label: "2 hr" },
  { value: 24, label: "1 day" },
];

// ── Comment data type (Session 105) ────────────────────────────────────
export type CommentForReview = {
  id: string;
  photo_id: string;
  author_id: string;
  body: string;
  author_role: string;
  is_favorite_comment: boolean;
  review_status: string; // 'pending' | 'approved' | 'rejected'
  created_at: string;
  reviewed_at: string | null;
  // Joined fields from the page query
  photo_media_url: string;
  photo_round_number: number;
  author_email: string | null;
  // Replies (teacher → student)
  replies: {
    id: string;
    body: string;
    created_at: string;
  }[];
};

// ═════════════════════════════════════════════════════════════════════════
// GameDetailClient — top-level
// ═════════════════════════════════════════════════════════════════════════
export function GameDetailClient({
  game,
  teacherId,
  monsters,
  avatarAssignments,
  comments = [],
  gameStats = null,
}: {
  game: GameDetailData;
  teacherId: string;
  monsters: MonsterRow[];
  avatarAssignments: { round_number: number; monster_id: string }[];
  comments?: CommentForReview[];
  gameStats?: GameStats | null;
}) {
  const [activeRound, setActiveRound] = useState(1);
  const currentRound = game.rounds.find((r) => r.round_number === activeRound);

  // Track avatar assignments in local state so spins update the UI immediately
  const [localAssignments, setLocalAssignments] = useState(avatarAssignments);

  const handleAvatarAssigned = useCallback(
    (roundNumber: number, monster: MonsterRow) => {
      setLocalAssignments((prev) => [
        ...prev,
        { round_number: roundNumber, monster_id: monster.id },
      ]);
    },
    [],
  );

  // Which monsters has this teacher already used? (for rotating mode greying)
  const usedMonsterIds = new Set(localAssignments.map((a) => a.monster_id));

  // For single mode: the monster from round 1 (if assigned)
  const round1Assignment = localAssignments.find((a) => a.round_number === 1);
  const lockedMonster = round1Assignment
    ? monsters.find((m) => m.id === round1Assignment.monster_id) || null
    : null;

  // Can creator edit settings? Only if sole participant + forming
  const canEditSettings =
    game.isCreator &&
    game.status === "forming" &&
    game.participants.length <= 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Game header ──────────────────────────────────────────── */}
      <GameHeader game={game} />

      {/* ── Editable game settings (creator only, before others join) ─ */}
      {canEditSettings && (
        <GameSettingsEditor game={game} />
      )}

      {/* ── Participants ─────────────────────────────────────────── */}
      <ParticipantsBar
        participants={game.participants}
        teacherId={teacherId}
        activeRound={activeRound}
      />

      {/* ── Round tabs ───────────────────────────────────────────── */}
      {game.rounds.length > 0 && (
        <>
          <RoundTabs
            rounds={game.rounds}
            activeRound={activeRound}
            onSelect={setActiveRound}
            photos={game.photos}
            teacherId={teacherId}
          />
          {currentRound && (
            <RoundPanel
              game={game}
              round={currentRound}
              teacherId={teacherId}
              photos={game.photos.filter((p) => p.round_number === activeRound)}
              allPhotos={game.photos}
              participants={game.participants}
              monsters={monsters}
              usedMonsterIds={usedMonsterIds}
              avatarForRound={
                localAssignments.find((a) => a.round_number === activeRound)
                  ? monsters.find(
                      (m) =>
                        m.id ===
                        localAssignments.find((a) => a.round_number === activeRound)!.monster_id,
                    ) || null
                  : null
              }
              lockedMonster={lockedMonster}
              onAvatarAssigned={(monster) => handleAvatarAssigned(activeRound, monster)}
              comments={comments.filter((c) => c.photo_round_number === activeRound)}
              gameId={game.id}
            />
          )}
        </>
      )}

      {/* ── Game controls (creator only) ─────────────────────────── */}
      {game.isCreator && game.status === "forming" && (
        <StartGameSection game={game} />
      )}

      {/* ── Session 106: Complete game (creator, active game) ────── */}
      {game.isCreator && game.status === "active" && (
        <CompleteGameSection gameId={game.id} />
      )}

      {/* ── Session 106: Drop out (non-creator, active/forming) ──── */}
      {!game.isCreator && (game.status === "forming" || game.status === "active") && (
        <DropOutSection gameId={game.id} status={game.status} />
      )}

      {/* ── Session 106: Waiting list ────────────────────────────── */}
      {game.waitingList && game.waitingList.length > 0 && (
        <WaitingListSection waitingList={game.waitingList} />
      )}

      {/* ── Session 106: Game stats (active/complete) ────────────── */}
      {gameStats && (
        <StatsSection stats={gameStats} />
      )}

      {/* ── Session 106: Replay (creator, completed game) ─────────── */}
      {game.isCreator && game.status === "complete" && (
        <ReplaySection gameId={game.id} />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Game header
// ═════════════════════════════════════════════════════════════════════════
function GameHeader({ game }: { game: GameDetailData }) {
  const statusColors: Record<string, { bg: string; text: string; border: string }> = {
    forming: { bg: "#FEF3C7", text: "#92400E", border: "#FDE68A" },
    ready: { bg: "#D1FAE5", text: "#065F46", border: "#A7F3D0" },
    active: { bg: "#DBEAFE", text: "#1E40AF", border: "#93C5FD" },
    complete: { bg: "#F3F4F6", text: "#6B7280", border: "#D1D5DB" },
  };
  const sc = statusColors[game.status] || statusColors.forming;

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${C.panelEdge}`,
        borderRadius: 14,
        padding: "16px 20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0, flex: 1, minWidth: 0 }}>
          {game.topic}
        </h1>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            padding: "2px 10px",
            borderRadius: 999,
            background: sc.bg,
            color: sc.text,
            border: `1px solid ${sc.border}`,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            flexShrink: 0,
          }}
        >
          {game.status}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          fontSize: 12,
          color: C.textFaint,
        }}
      >
        <span>{game.total_rounds} round{game.total_rounds !== 1 ? "s" : ""}</span>
        <span>Round time: {formatDuration(game.round_duration_hours)}</span>
        <span>Review: {formatDuration(game.review_phase_hours)}</span>
        {game.isCreator && (
          <span style={{ color: C.light, fontWeight: 600 }}>You created this game</span>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Game settings editor — creator only, before another teacher joins
// ═════════════════════════════════════════════════════════════════════════
function GameSettingsEditor({ game }: { game: GameDetailData }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [roundTime, setRoundTime] = useState(game.round_duration_hours ?? 48);
  const [reviewTime, setReviewTime] = useState(game.review_phase_hours ?? 2);
  const [saved, setSaved] = useState(false);

  const playTime = roundTime - reviewTime;

  function handleSave() {
    setSaved(false);
    startTransition(async () => {
      const res = await updateGameSettings(game.id, {
        round_duration_hours: roundTime,
        game_phase_hours: playTime > 0 ? playTime : null,
        review_phase_hours: reviewTime,
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box" as const,
    background: "#fff",
    border: `1px solid ${C.panelEdge}`,
    borderRadius: 8,
    padding: "7px 10px",
    fontSize: 13,
    color: C.text,
    fontFamily: "inherit",
    outline: "none",
  };

  const labelStyle = {
    display: "block" as const,
    fontSize: 12,
    color: C.textDim,
    fontWeight: 600,
    marginBottom: 4,
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: C.light,
          fontFamily: "inherit",
          padding: "4px 0",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ fontSize: 10 }}>{open ? "▾" : "▸"}</span>
        Edit game settings
        {saved && <span style={{ color: C.success, fontWeight: 600, marginLeft: 4 }}>Saved ✓</span>}
      </button>

      {open && (
        <div
          style={{
            background: C.panel,
            border: `1px solid ${C.panelEdge}`,
            borderRadius: 12,
            padding: "14px 16px",
            marginTop: 6,
            opacity: pending ? 0.6 : 1,
            pointerEvents: pending ? "none" : "auto",
          }}
        >
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ flex: "1 1 130px", minWidth: 130 }}>
              <label style={labelStyle}>Round time</label>
              <select
                value={roundTime}
                onChange={(e) => setRoundTime(Number(e.target.value))}
                style={inputStyle}
              >
                {ROUND_TIME_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: "1 1 130px", minWidth: 130 }}>
              <label style={labelStyle}>Review time</label>
              <select
                value={reviewTime}
                onChange={(e) => setReviewTime(Number(e.target.value))}
                style={inputStyle}
              >
                {REVIEW_TIME_OPTIONS.filter((o) => o.value < roundTime).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: "1 1 130px", minWidth: 130 }}>
              <label style={labelStyle}>
                Play time
                <span style={{ fontWeight: 400, color: C.textFaint, marginLeft: 4 }}>(calculated)</span>
              </label>
              <div
                style={{
                  background: "#f5f0eb",
                  border: `1px solid ${C.panelEdge}`,
                  borderRadius: 8,
                  padding: "7px 10px",
                  fontSize: 13,
                  color: C.textDim,
                }}
              >
                {formatDuration(playTime > 0 ? playTime : 0)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            style={{
              background: C.light,
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "6px 16px",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "inherit",
              cursor: pending ? "default" : "pointer",
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? "Saving…" : "Save settings"}
          </button>

          <p style={{ fontSize: 11, color: C.textFaint, margin: "8px 0 0", fontStyle: "italic" }}>
            Settings lock once another teacher joins the game.
          </p>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Participants bar — shows each teacher + readiness for current round
// ═════════════════════════════════════════════════════════════════════════
function ParticipantsBar({
  participants,
  teacherId,
  activeRound,
}: {
  participants: ParticipantWithName[];
  teacherId: string;
  activeRound: number;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ fontSize: 11, color: C.textFaint, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
        Teachers
      </span>
      {participants.map((p) => {
        const count = p.photoCountByRound[activeRound] || 0;
        const isMe = p.teacher_id === teacherId;
        const ready = count >= 3;
        return (
          <span
            key={p.id}
            style={{
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 999,
              background: isMe ? C.light + "15" : "#f5f0eb",
              border: `1px solid ${isMe ? C.light + "44" : C.panelEdge + "66"}`,
              color: isMe ? C.light : C.textDim,
              fontWeight: isMe ? 700 : 400,
            }}
          >
            {p.name}
            <span
              style={{
                marginLeft: 6,
                fontSize: 9,
                color: ready ? C.success : C.textFaint,
              }}
            >
              {count}/3 {ready ? "✓" : ""}
            </span>
          </span>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Round tabs
// ═════════════════════════════════════════════════════════════════════════
function RoundTabs({
  rounds,
  activeRound,
  onSelect,
  photos,
  teacherId,
}: {
  rounds: RoundData[];
  activeRound: number;
  onSelect: (n: number) => void;
  photos: PhotoData[];
  teacherId: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        borderBottom: `1px solid ${C.panelEdge}55`,
        paddingBottom: 0,
        overflowX: "auto",
      }}
    >
      {rounds.map((r) => {
        const isActive = r.round_number === activeRound;
        const myCount = photos.filter(
          (p) => p.round_number === r.round_number && p.teacher_id === teacherId,
        ).length;
        return (
          <button
            key={r.round_number}
            type="button"
            onClick={() => onSelect(r.round_number)}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: "none",
              borderBottom: isActive ? `2px solid ${C.light}` : "2px solid transparent",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? C.light : C.textDim,
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
              marginBottom: -1,
            }}
          >
            Round {r.round_number}
            {myCount > 0 && (
              <span
                style={{
                  fontSize: 9,
                  padding: "1px 5px",
                  borderRadius: 999,
                  background: myCount >= 3 ? C.success + "20" : C.panelEdge + "44",
                  color: myCount >= 3 ? C.success : C.textFaint,
                  fontWeight: 700,
                }}
              >
                {myCount}/3
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Round panel — topic, photos, upload
// ═════════════════════════════════════════════════════════════════════════
function RoundPanel({
  game,
  round,
  teacherId,
  photos,
  allPhotos,
  participants,
  monsters,
  usedMonsterIds,
  avatarForRound,
  lockedMonster,
  onAvatarAssigned,
  comments = [],
  gameId,
}: {
  game: GameDetailData;
  round: RoundData;
  teacherId: string;
  photos: PhotoData[];
  allPhotos: PhotoData[];
  participants: ParticipantWithName[];
  monsters: MonsterRow[];
  usedMonsterIds: Set<string>;
  avatarForRound: MonsterRow | null;
  lockedMonster: MonsterRow | null;
  onAvatarAssigned: (monster: MonsterRow) => void;
  comments?: CommentForReview[];
  gameId?: string;
}) {
  const myPhotos = photos.filter((p) => p.teacher_id === teacherId);
  const canUpload = game.status !== "complete" && myPhotos.length < 3;
  const hasAvatar = !!avatarForRound;

  // Session 104: check if teacher has photos for the previous round
  const prevRoundPhotoCount =
    round.round_number > 1
      ? allPhotos.filter(
          (p) => p.teacher_id === teacherId && p.round_number === round.round_number - 1,
        ).length
      : 999; // round 1 always passes
  const needsPrevRoundPhotos = round.round_number > 1 && prevRoundPhotoCount < 1;

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${C.panelEdge}`,
        borderRadius: 14,
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* ── Topic (collapsible sub-button) ──────────────────────── */}
      <RoundTopicSection
        gameId={game.id}
        round={round}
        isCreator={game.isCreator}
        gameStatus={game.status}
      />

      {/* ── Session 104: spin blocked if prev round has no photos ── */}
      {!hasAvatar && game.status !== "complete" && needsPrevRoundPhotos ? (
        <div
          style={{
            background: "#FEF3C7",
            border: "1px solid #FDE68A",
            borderRadius: 12,
            padding: "14px 16px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 13, color: "#92400E", margin: 0, fontWeight: 600 }}>
            Upload photos for Round {round.round_number - 1} first
          </p>
          <p style={{ fontSize: 12, color: "#92400E", margin: "6px 0 0", opacity: 0.8 }}>
            You need at least one photo with a description for the previous round before you can spin for your Round {round.round_number} avatar.
          </p>
        </div>
      ) : !hasAvatar && game.status !== "complete" ? (
        /* ── Avatar spinner gate (Session 102) ─────────────────────── */
        <AvatarSpinner
          monsters={monsters}
          usedMonsterIds={usedMonsterIds}
          roundNumber={round.round_number}
          gameId={game.id}
          avatarMode={game.avatar_mode === "rotating" ? "rotating" : "single"}
          lockedMonster={lockedMonster}
          onAssigned={onAvatarAssigned}
        />
      ) : (
        <>
          {/* ── Assigned avatar badge with profile link ────────────── */}
          {hasAvatar && (
            <AvatarBadge monster={avatarForRound!} />
          )}

          {/* ── Your photos ───────────────────────────────────────── */}
          <div>
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: C.text,
                margin: "0 0 10px",
              }}
            >
              Your photos — Round {round.round_number}
              <span style={{ fontWeight: 400, color: C.textFaint, fontSize: 12, marginLeft: 8 }}>
                {myPhotos.length}/3
              </span>
            </h3>

            {/* Photo grid */}
            {myPhotos.length > 0 && (
              <PhotoGrid photos={myPhotos} canDelete={game.status !== "complete"} />
            )}

            {/* Upload form */}
            {canUpload && (
              <UploadForm
                gameId={game.id}
                roundNumber={round.round_number}
              />
            )}

            {myPhotos.length >= 3 && (
              <p style={{ fontSize: 12, color: C.success, margin: "8px 0 0", fontWeight: 600 }}>
                ✓ You have 3 photos for this round
              </p>
            )}
          </div>
        </>
      )}

      {/* ── Other teachers' progress ──────────────────────────────── */}
      <div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: C.textFaint,
            textTransform: "uppercase",
            letterSpacing: 1,
            display: "block",
            marginBottom: 6,
          }}
        >
          Round {round.round_number} readiness
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {participants.map((p) => {
            const count = photos.filter((ph) => ph.teacher_id === p.teacher_id).length;
            const isMe = p.teacher_id === teacherId;
            return (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: isMe ? C.light : C.textDim,
                  fontWeight: isMe ? 600 : 400,
                }}
              >
                <span style={{ minWidth: 100 }}>{p.name}</span>
                <ProgressDots count={count} />
                <span style={{ fontSize: 10, color: count >= 3 ? C.success : C.textFaint }}>
                  {count}/3 {count >= 3 ? "✓" : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Session 105: Comment review inbox ──────────────────────── */}
      {game.status === "active" && comments.length > 0 && gameId && (
        <CommentInbox comments={comments} gameId={gameId} />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Comment inbox — teacher reviews favorite comments (Session 105)
// ═════════════════════════════════════════════════════════════════════════
function CommentInbox({
  comments,
  gameId,
}: {
  comments: CommentForReview[];
  gameId: string;
}) {
  const [open, setOpen] = useState(false);
  const pending = comments.filter((c) => c.review_status === "pending");
  const approved = comments.filter((c) => c.review_status === "approved");
  const rejected = comments.filter((c) => c.review_status === "rejected");

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          padding: "4px 0",
          width: "100%",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 10, color: C.textDim }}>{open ? "▾" : "▸"}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: C.textFaint,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Student comments
        </span>
        {pending.length > 0 && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "1px 7px",
              borderRadius: 999,
              background: C.light + "20",
              color: C.light,
              border: `1px solid ${C.light}44`,
            }}
          >
            {pending.length} pending
          </span>
        )}
        {approved.length > 0 && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: C.success,
            }}
          >
            {approved.length} approved
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            marginTop: 8,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {/* Pending comments */}
          {pending.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.light,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 6,
                }}
              >
                Needs review ({pending.length})
              </div>
              {pending.map((c) => (
                <CommentCard key={c.id} comment={c} gameId={gameId} />
              ))}
            </div>
          )}

          {/* Approved comments */}
          {approved.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.success,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 6,
                }}
              >
                Approved ({approved.length})
              </div>
              {approved.map((c) => (
                <CommentCard key={c.id} comment={c} gameId={gameId} />
              ))}
            </div>
          )}

          {/* Rejected comments */}
          {rejected.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.error,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 6,
                }}
              >
                Rejected ({rejected.length})
              </div>
              {rejected.map((c) => (
                <CommentCard key={c.id} comment={c} gameId={gameId} />
              ))}
            </div>
          )}

          {comments.length === 0 && (
            <p style={{ fontSize: 12, color: C.textFaint, fontStyle: "italic", margin: 0 }}>
              No student comments yet for this round.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Comment card — individual comment with approve/reject/reply/flag
// ═════════════════════════════════════════════════════════════════════════
function CommentCard({
  comment,
  gameId,
}: {
  comment: CommentForReview;
  gameId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [showReply, setShowReply] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [showFlag, setShowFlag] = useState(false);
  const [flagReason, setFlagReason] = useState("");

  const isPending = comment.review_status === "pending";
  const isApproved = comment.review_status === "approved";
  const isRejected = comment.review_status === "rejected";

  const statusColors = {
    pending: { bg: "#FEF3C7", border: "#FDE68A", text: "#92400E" },
    approved: { bg: "#D1FAE5", border: "#A7F3D0", text: "#065F46" },
    rejected: { bg: "#FEE2E2", border: "#FECACA", text: "#991B1B" },
  };
  const sc = statusColors[comment.review_status as keyof typeof statusColors] || statusColors.pending;

  function handleApprove() {
    setResult(null);
    startTransition(async () => {
      const res = await approveComment(comment.id);
      if (!res.ok) setResult(res.error);
    });
  }

  function handleReject() {
    setResult(null);
    startTransition(async () => {
      const res = await rejectComment(comment.id);
      if (!res.ok) setResult(res.error);
    });
  }

  function handleReply() {
    if (!replyDraft.trim()) return;
    setResult(null);
    startTransition(async () => {
      const res = await replyToComment(comment.id, replyDraft.trim());
      if (res.ok) {
        setReplyDraft("");
        setShowReply(false);
      } else {
        setResult(res.error);
      }
    });
  }

  function handleFlag() {
    if (!flagReason.trim()) return;
    setResult(null);
    startTransition(async () => {
      const res = await flagStudent(gameId, comment.author_id, flagReason.trim());
      if (res.ok) {
        setShowFlag(false);
        setFlagReason("");
      } else {
        setResult(res.error);
      }
    });
  }

  const timeAgo = (() => {
    const diff = Date.now() - new Date(comment.created_at).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  })();

  return (
    <div
      style={{
        background: sc.bg,
        border: `1px solid ${sc.border}`,
        borderRadius: 12,
        padding: "10px 12px",
        marginBottom: 6,
        opacity: pending ? 0.6 : 1,
        pointerEvents: pending ? "none" : "auto",
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {/* Photo thumbnail */}
        {comment.photo_media_url && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={comment.photo_media_url}
            alt=""
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              objectFit: "cover",
              flexShrink: 0,
              border: `1px solid ${C.panelEdge}`,
            }}
          />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Comment body */}
          <p
            style={{
              fontSize: 13,
              color: C.text,
              margin: "0 0 4px",
              lineHeight: 1.4,
              wordBreak: "break-word",
            }}
          >
            {comment.body}
          </p>

          {/* Meta line */}
          <div
            style={{
              fontSize: 10,
              color: C.textFaint,
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span>{timeAgo}</span>
            {comment.is_favorite_comment && (
              <span style={{ color: C.light, fontWeight: 600 }}>★ favorite</span>
            )}
            {comment.author_email && (
              <span>{comment.author_email}</span>
            )}
          </div>

          {/* Teacher replies */}
          {comment.replies && comment.replies.length > 0 && (
            <div style={{ marginTop: 6, paddingLeft: 10, borderLeft: `2px solid ${C.panelEdge}` }}>
              {comment.replies.map((r) => (
                <div key={r.id} style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: C.light, fontSize: 10 }}>You replied: </span>
                  {r.body}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginTop: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {isPending && (
          <>
            <button
              type="button"
              onClick={handleApprove}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "4px 12px",
                borderRadius: 999,
                background: C.success,
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Approve
            </button>
            <button
              type="button"
              onClick={handleReject}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "4px 12px",
                borderRadius: 999,
                background: "transparent",
                color: C.error,
                border: `1px solid ${C.error}44`,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Reject
            </button>
          </>
        )}

        {isApproved && (
          <button
            type="button"
            onClick={handleReject}
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "4px 12px",
              borderRadius: 999,
              background: "transparent",
              color: C.textFaint,
              border: `1px solid ${C.panelEdge}`,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Undo approval
          </button>
        )}

        {isRejected && (
          <button
            type="button"
            onClick={handleApprove}
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "4px 12px",
              borderRadius: 999,
              background: "transparent",
              color: C.textFaint,
              border: `1px solid ${C.panelEdge}`,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Undo rejection
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowReply(!showReply)}
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "4px 12px",
            borderRadius: 999,
            background: "transparent",
            color: C.textDim,
            border: `1px solid ${C.panelEdge}`,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {showReply ? "Cancel" : "Reply"}
        </button>

        <button
          type="button"
          onClick={() => setShowFlag(!showFlag)}
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "4px 10px",
            borderRadius: 999,
            background: "transparent",
            color: C.textFaint,
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          🚩
        </button>
      </div>

      {/* Reply form */}
      {showReply && (
        <div style={{ marginTop: 8 }}>
          <textarea
            value={replyDraft}
            onChange={(e) => setReplyDraft(e.target.value)}
            placeholder="Write a private reply to this student…"
            rows={2}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "7px 10px",
              fontSize: 12,
              fontFamily: "inherit",
              background: "#fff",
              color: C.text,
              border: `1px solid ${C.panelEdge}`,
              borderRadius: 8,
              outline: "none",
              resize: "vertical",
            }}
          />
          <button
            type="button"
            onClick={handleReply}
            disabled={!replyDraft.trim()}
            style={{
              marginTop: 4,
              fontSize: 11,
              fontWeight: 700,
              padding: "5px 14px",
              borderRadius: 999,
              background: replyDraft.trim() ? C.light : C.panelEdge,
              color: replyDraft.trim() ? "#fff" : C.textFaint,
              border: "none",
              cursor: replyDraft.trim() ? "pointer" : "default",
              fontFamily: "inherit",
            }}
          >
            Send reply
          </button>
        </div>
      )}

      {/* Flag form */}
      {showFlag && (
        <div
          style={{
            marginTop: 8,
            background: "#FEE2E2",
            border: "1px solid #FECACA",
            borderRadius: 8,
            padding: "8px 10px",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: "#991B1B", marginBottom: 4 }}>
            Flag this student — they will be blocked from further participation.
          </div>
          <textarea
            value={flagReason}
            onChange={(e) => setFlagReason(e.target.value)}
            placeholder="Reason for flagging…"
            rows={2}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "6px 8px",
              fontSize: 12,
              fontFamily: "inherit",
              background: "#fff",
              color: C.text,
              border: "1px solid #FECACA",
              borderRadius: 6,
              outline: "none",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <button
              type="button"
              onClick={handleFlag}
              disabled={!flagReason.trim()}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "4px 12px",
                borderRadius: 999,
                background: flagReason.trim() ? C.error : C.panelEdge,
                color: "#fff",
                border: "none",
                cursor: flagReason.trim() ? "pointer" : "default",
                fontFamily: "inherit",
              }}
            >
              Confirm flag
            </button>
            <button
              type="button"
              onClick={() => { setShowFlag(false); setFlagReason(""); }}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "4px 12px",
                borderRadius: 999,
                background: "transparent",
                color: C.textDim,
                border: `1px solid ${C.panelEdge}`,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <p style={{ fontSize: 11, color: C.error, marginTop: 4, marginBottom: 0 }}>
          {result}
        </p>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Avatar badge — shows assigned monster with expandable personality
// ═════════════════════════════════════════════════════════════════════════
function AvatarBadge({ monster }: { monster: MonsterRow }) {
  const [showProfile, setShowProfile] = useState(false);

  return (
    <div
      style={{
        background: monster.belly_color + "20",
        border: `1px solid ${monster.body_color}44`,
        borderRadius: 12,
        padding: "10px 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <MonsterAvatar
          index={monster.monster_index}
          size={40}
          ring
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
            Playing as {monster.name}
          </div>
          <div style={{ fontSize: 11, color: C.textDim, fontStyle: "italic" }}>
            {monster.personality.length > 80
              ? monster.personality.slice(0, 80) + "…"
              : monster.personality}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowProfile(!showProfile)}
          style={{
            background: "none",
            border: `1px solid ${monster.body_color}44`,
            borderRadius: 999,
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 600,
            color: C.textDim,
            fontFamily: "inherit",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {showProfile ? "Less" : "Profile"}
        </button>
      </div>

      {showProfile && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: `1px solid ${monster.body_color}22`,
          }}
        >
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <MonsterAvatar
              index={monster.monster_index}
              size={72}
              ring
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 4 }}>
                {monster.name}
              </div>
              <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.5 }}>
                {monster.personality}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  marginTop: 8,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: monster.body_color + "22",
                    color: C.textDim,
                    fontWeight: 600,
                  }}
                >
                  Body: {monster.body_color}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: monster.accent_color + "22",
                    color: C.textDim,
                    fontWeight: 600,
                  }}
                >
                  Accent: {monster.accent_color}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Progress dots — 3 dots showing upload progress
// ═════════════════════════════════════════════════════════════════════════
function ProgressDots({ count }: { count: number }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: n <= count ? C.success : C.panelEdge + "66",
            transition: "background 0.2s",
          }}
        />
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Round topic section — collapsible, editable by creator
// ═════════════════════════════════════════════════════════════════════════
function RoundTopicSection({
  gameId,
  round,
  isCreator,
  gameStatus,
}: {
  gameId: string;
  round: RoundData;
  isCreator: boolean;
  gameStatus: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(round.topic);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  // Reset value when round changes
  useEffect(() => {
    setValue(round.topic);
    setEditing(false);
    setSaved(false);
    setExpanded(false);
  }, [round.round_number, round.topic]);

  function handleSave() {
    startTransition(async () => {
      const res = await updateRoundTopic(gameId, round.round_number, value);
      if (res.ok) {
        setEditing(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  const canEdit = isCreator && gameStatus !== "complete";

  return (
    <div>
      {/* Collapsed: just a button showing topic name */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          padding: "2px 0",
          width: "100%",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 10, color: C.textDim }}>{expanded ? "▾" : "▸"}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.textFaint, textTransform: "uppercase", letterSpacing: 1 }}>
          Round {round.round_number} topic
        </span>
        {!expanded && round.topic && (
          <span
            style={{
              fontSize: 12,
              color: C.textDim,
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
          >
            — {round.topic}
          </span>
        )}
        {saved && (
          <span style={{ fontSize: 11, color: C.success, fontWeight: 600 }}>Saved ✓</span>
        )}
      </button>

      {/* Expanded: show topic with edit capability */}
      {expanded && (
        <div style={{ marginTop: 6, paddingLeft: 18 }}>
          {editing ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                maxLength={200}
                style={{
                  flex: 1,
                  background: "#fff",
                  border: `1px solid ${C.light}66`,
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontSize: 13,
                  color: C.text,
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={pending}
                style={{
                  background: C.light,
                  color: "#fff",
                  border: "none",
                  borderRadius: 999,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: "inherit",
                  cursor: pending ? "default" : "pointer",
                  opacity: pending ? 0.6 : 1,
                }}
              >
                {pending ? "…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setValue(round.topic); }}
                style={{
                  background: "none",
                  border: `1px solid ${C.panelEdge}`,
                  borderRadius: 999,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  color: C.textDim,
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <p
                style={{
                  fontSize: 14,
                  color: round.topic ? C.text : C.textFaint,
                  margin: 0,
                  fontStyle: round.topic ? "normal" : "italic",
                  flex: 1,
                }}
              >
                {round.topic || "No topic set"}
              </p>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  style={{
                    fontSize: 11,
                    color: C.light,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontFamily: "inherit",
                    padding: 0,
                  }}
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Photo grid — displays uploaded photos with delete button
// ═════════════════════════════════════════════════════════════════════════
function PhotoGrid({
  photos,
  canDelete,
}: {
  photos: PhotoData[];
  canDelete: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function handleDelete(photoId: string) {
    if (!confirm("Remove this photo?")) return;
    startTransition(async () => {
      await deleteMultiPhoto(photoId);
    });
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 8,
        marginBottom: 12,
        opacity: pending ? 0.6 : 1,
      }}
    >
      {photos.map((p) => (
        <div
          key={p.id}
          style={{
            position: "relative",
            borderRadius: 10,
            overflow: "hidden",
            border: `1px solid ${C.panelEdge}`,
            background: "#fff",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.media_url}
            alt={p.description_text || "Game photo"}
            style={{
              width: "100%",
              aspectRatio: "1",
              objectFit: "cover",
              display: "block",
            }}
          />
          {canDelete && (
            <button
              type="button"
              onClick={() => handleDelete(p.id)}
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.5)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
              }}
              title="Remove photo"
            >
              ✕
            </button>
          )}
          {p.description_text && (
            <div
              style={{
                padding: "5px 8px",
                fontSize: 11,
                color: C.textDim,
                lineHeight: 1.3,
                borderTop: `1px solid ${C.panelEdge}44`,
              }}
            >
              {p.description_text}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Upload form for a specific round
// ═════════════════════════════════════════════════════════════════════════
function UploadForm({
  gameId,
  roundNumber,
}: {
  gameId: string;
  roundNumber: number;
}) {
  const [pending, startTransition] = useTransition();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  };

  const onSubmit = async (formData: FormData) => {
    formData.set("game_id", gameId);
    formData.set("round_number", String(roundNumber));
    const f = formData.get("photo");
    if (f instanceof File && f.size > 8 * 1024 * 1024) {
      setResult({ ok: false, error: "Photo must be 8 MB or smaller." });
      return;
    }
    setResult(null);
    startTransition(async () => {
      const r = await uploadMultiPhoto(formData);
      setResult(r);
      if (r.ok) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    });
  };

  return (
    <form
      action={onSubmit}
      style={{
        background: C.panel,
        border: `1px solid ${C.panelEdge}`,
        borderRadius: 10,
        padding: "12px 14px",
        opacity: pending ? 0.6 : 1,
        pointerEvents: pending ? "none" : "auto",
      }}
    >
      {/* File picker */}
      <div style={{ marginBottom: 10 }}>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: C.light + "15",
            border: `1px solid ${C.light}66`,
            borderRadius: 8,
            padding: "7px 14px",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            color: C.light,
            fontFamily: "inherit",
          }}
        >
          📷 Choose file
          <input
            type="file"
            name="photo"
            required
            accept="image/jpeg,image/png,image/webp"
            onChange={onFileChange}
            style={{ display: "none" }}
          />
        </label>
        {previewUrl && (
          <span style={{ fontSize: 11, color: C.success, marginLeft: 8 }}>File selected ✓</span>
        )}
      </div>

      {/* Preview */}
      {previewUrl && (
        <div
          style={{
            borderRadius: 8,
            border: `1px solid ${C.panelEdge}`,
            background: "#fff",
            padding: 4,
            marginBottom: 10,
            textAlign: "center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Preview"
            style={{ maxHeight: 140, borderRadius: 6, display: "inline-block" }}
          />
        </div>
      )}

      {/* Description */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ display: "block", fontSize: 11, color: C.textDim, fontWeight: 600, marginBottom: 3 }}>
          Description
          <span style={{ fontWeight: 400, color: C.textFaint, marginLeft: 4 }}>(shown to students)</span>
        </label>
        <textarea
          name="description"
          maxLength={1000}
          rows={2}
          placeholder="What is happening in the photo?"
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "#fff",
            border: `1px solid ${C.panelEdge}`,
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            color: C.text,
            fontFamily: "inherit",
            outline: "none",
            resize: "vertical",
          }}
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={pending}
        style={{
          background: C.light,
          color: "#fff",
          border: "none",
          borderRadius: 999,
          padding: "6px 16px",
          fontSize: 12,
          fontWeight: 700,
          fontFamily: "inherit",
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "Uploading…" : "Add photo"}
      </button>

      {result && !result.ok && (
        <p style={{ fontSize: 12, color: C.error, marginTop: 6 }}>{result.error}</p>
      )}
      {result && result.ok && (
        <p style={{ fontSize: 12, color: C.success, marginTop: 6 }}>Photo added.</p>
      )}
    </form>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Complete game section — creator marks game done (Session 106)
// ═════════════════════════════════════════════════════════════════════════
function CompleteGameSection({ gameId }: { gameId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function handleComplete() {
    if (!confirm("Complete this game? All rounds will be marked finished and the game will move to complete status.")) return;
    setResult(null);
    startTransition(async () => {
      const res = await completeGame(gameId);
      if (!res.ok) setResult(res.error);
      else setResult("Game completed!");
    });
  }

  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.panelEdge}`,
        borderRadius: 14,
        padding: "14px 20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: C.textDim, flex: 1 }}>
          When all rounds are done, mark the game complete to move to the reveal phase.
        </span>
        <button
          type="button"
          onClick={handleComplete}
          disabled={pending}
          style={{
            background: C.success,
            color: "#fff",
            border: "none",
            borderRadius: 999,
            padding: "7px 18px",
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "inherit",
            cursor: pending ? "default" : "pointer",
            opacity: pending ? 0.6 : 1,
            flexShrink: 0,
          }}
        >
          {pending ? "Completing…" : "Complete game"}
        </button>
      </div>
      {result && (
        <p
          style={{
            fontSize: 12,
            marginTop: 8,
            marginBottom: 0,
            color: result === "Game completed!" ? C.success : C.error,
          }}
        >
          {result}
        </p>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Drop out section — non-creator leaves a game (Session 106)
// ═════════════════════════════════════════════════════════════════════════
function DropOutSection({ gameId, status }: { gameId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function handleDropOut() {
    const msg = status === "active"
      ? "Drop out of this active game? Your photos from past rounds will remain, but you won't participate in future rounds."
      : "Leave this game? Your photos will be removed.";
    if (!confirm(msg)) return;

    setResult(null);
    startTransition(async () => {
      const res = await dropOutOfGame(gameId);
      if (!res.ok) setResult(res.error);
    });
  }

  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <button
        type="button"
        onClick={handleDropOut}
        disabled={pending}
        style={{
          background: "#FEF2F2",
          color: "#DC2626",
          border: "1px solid #FECACA",
          borderRadius: 999,
          padding: "6px 16px",
          fontSize: 12,
          fontWeight: 600,
          fontFamily: "inherit",
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "Leaving…" : status === "active" ? "Drop out" : "Leave game"}
      </button>
      {result && (
        <span style={{ fontSize: 12, color: C.error, marginLeft: 8, alignSelf: "center" }}>
          {result}
        </span>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Waiting list display (Session 106)
// ═════════════════════════════════════════════════════════════════════════
function WaitingListSection({
  waitingList,
}: {
  waitingList: { id: string; teacher_id: string; name: string }[];
}) {
  return (
    <div
      style={{
        background: "#EDE9FE",
        border: "1px solid #DDD6FE",
        borderRadius: 14,
        padding: "12px 16px",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#7C3AED",
          textTransform: "uppercase",
          letterSpacing: 1,
          display: "block",
          marginBottom: 6,
        }}
      >
        Waiting list ({waitingList.length})
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {waitingList.map((w, i) => (
          <span
            key={w.id}
            style={{
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 999,
              background: "#F5F3FF",
              border: "1px solid #DDD6FE",
              color: "#6D28D9",
              fontWeight: 500,
            }}
          >
            {i + 1}. {w.name}
          </span>
        ))}
      </div>
      <p style={{ fontSize: 11, color: "#7C3AED", margin: "6px 0 0", opacity: 0.8 }}>
        Waiting teachers join when a spot opens or when the game replays.
      </p>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Stats section — engagement metrics (Session 106, Phase 8)
// ═════════════════════════════════════════════════════════════════════════
function StatsSection({ stats }: { stats: GameStats }) {
  const [open, setOpen] = useState(false);

  const medalColors = ["#D4A017", "#A0A0A0", "#CD7F32"];

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${C.panelEdge}`,
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 20px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 10, color: C.textDim }}>{open ? "▾" : "▸"}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: C.textFaint,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Game stats
        </span>
        <span style={{ fontSize: 12, color: C.textDim }}>
          {stats.total_students} student{stats.total_students !== 1 ? "s" : ""}
          {" · "}
          {stats.total_votes} vote{stats.total_votes !== 1 ? "s" : ""}
          {" · "}
          {stats.total_comments} comment{stats.total_comments !== 1 ? "s" : ""}
        </span>
      </button>

      {open && (
        <div style={{ padding: "0 20px 16px", borderTop: `1px solid ${C.panelEdge}44` }}>
          {/* Overview */}
          <div
            style={{
              display: "flex",
              gap: 20,
              flexWrap: "wrap",
              padding: "12px 0",
              fontSize: 12,
              color: C.textDim,
            }}
          >
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{stats.total_students}</div>
              <div>Students played</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{stats.total_votes}</div>
              <div>Total votes</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{stats.total_comments}</div>
              <div>Comments</div>
            </div>
          </div>

          {/* Per-teacher breakdown */}
          {stats.teachers.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              {stats.teachers.map((t, i) => (
                <div
                  key={t.teacher_id}
                  style={{
                    background: i < 3 ? (medalColors[i] || C.panelEdge) + "10" : "#f9f7f3",
                    border: `1px solid ${i < 3 ? (medalColors[i] || C.panelEdge) + "33" : C.panelEdge + "44"}`,
                    borderRadius: 10,
                    padding: "10px 14px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    {i < 3 && (
                      <span style={{ fontSize: 14 }}>
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                      </span>
                    )}
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                      {t.teacher_name}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.light, marginLeft: "auto" }}>
                      {t.total_points} pts
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      flexWrap: "wrap",
                      fontSize: 11,
                      color: C.textFaint,
                    }}
                  >
                    <span>1st picks: {t.first_picks}</span>
                    <span>2nd picks: {t.second_picks}</span>
                    <span>3rd picks: {t.third_picks}</span>
                    {t.favorite_comments > 0 && (
                      <span>★ {t.favorite_comments} favorite{t.favorite_comments !== 1 ? "s" : ""}</span>
                    )}
                    {t.approved_comments > 0 && (
                      <span>✓ {t.approved_comments} approved</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {stats.teachers.length === 0 && (
            <p style={{ fontSize: 12, color: C.textFaint, fontStyle: "italic", margin: "8px 0 0" }}>
              No vote data yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Replay section — creator starts a new game from completed settings
// (Session 106)
// ═════════════════════════════════════════════════════════════════════════
function ReplaySection({ gameId }: { gameId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function handleReplay() {
    if (!confirm("Create a replay game with the same settings and topics? Waiting teachers from this game will be invited.")) return;
    setResult(null);
    startTransition(async () => {
      const res = await replayGame(gameId);
      if (!res.ok) setResult(res.error);
      else setResult("Replay created! Check your lobby.");
    });
  }

  return (
    <div
      style={{
        background: C.light + "10",
        border: `1px solid ${C.light}44`,
        borderRadius: 14,
        padding: "14px 20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>
            Replay this game
          </div>
          <div style={{ fontSize: 12, color: C.textDim }}>
            Create a new game with the same topics and settings.
            Waiting teachers will be automatically invited.
          </div>
        </div>
        <button
          type="button"
          onClick={handleReplay}
          disabled={pending}
          style={{
            background: C.light,
            color: "#fff",
            border: "none",
            borderRadius: 999,
            padding: "8px 20px",
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "inherit",
            cursor: pending ? "default" : "pointer",
            opacity: pending ? 0.6 : 1,
            flexShrink: 0,
          }}
        >
          {pending ? "Creating…" : "Replay →"}
        </button>
      </div>
      {result && (
        <p
          style={{
            fontSize: 12,
            marginTop: 8,
            marginBottom: 0,
            color: result.startsWith("Replay") ? C.success : C.error,
          }}
        >
          {result}
        </p>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Start game section — creator only
// ═════════════════════════════════════════════════════════════════════════
function StartGameSection({ game }: { game: GameDetailData }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  // Check readiness: every participant needs ≥1 photo for round 1
  const round1Photos = game.photos.filter((p) => p.round_number === 1);
  const teachersWithR1 = new Set(round1Photos.map((p) => p.teacher_id));
  const allReady = game.participants.length >= 3 &&
    game.participants.every((p) => teachersWithR1.has(p.teacher_id));

  function handleStart() {
    setResult(null);
    startTransition(async () => {
      const res = await startMultiGame(game.id);
      if (!res.ok) setResult(res.error);
      else setResult("Game started!");
    });
  }

  return (
    <div
      style={{
        background: allReady ? C.success + "10" : C.panel,
        border: `1px solid ${allReady ? C.success + "44" : C.panelEdge}`,
        borderRadius: 14,
        padding: "16px 20px",
      }}
    >
      <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: "0 0 8px" }}>
        Start game
      </h3>

      {game.participants.length < 3 && (
        <p style={{ fontSize: 13, color: C.textFaint, margin: "0 0 10px" }}>
          Need {3 - game.participants.length} more teacher{3 - game.participants.length !== 1 ? "s" : ""} to join before starting.
        </p>
      )}

      {game.participants.length >= 3 && !allReady && (
        <p style={{ fontSize: 13, color: C.textFaint, margin: "0 0 10px" }}>
          Waiting for all teachers to upload at least one photo for Round 1.
        </p>
      )}

      {allReady && (
        <p style={{ fontSize: 13, color: C.success, margin: "0 0 10px", fontWeight: 600 }}>
          All {game.participants.length} teachers are ready. You can start the game.
        </p>
      )}

      <button
        type="button"
        onClick={handleStart}
        disabled={pending || !allReady}
        style={{
          background: allReady ? C.light : C.panelEdge,
          color: "#fff",
          border: "none",
          borderRadius: 999,
          padding: "8px 20px",
          fontSize: 13,
          fontWeight: 700,
          fontFamily: "inherit",
          cursor: allReady && !pending ? "pointer" : "default",
          opacity: !allReady || pending ? 0.5 : 1,
        }}
      >
        {pending ? "Starting…" : "Start game"}
      </button>

      {result && (
        <p
          style={{
            fontSize: 12,
            marginTop: 8,
            color: result === "Game started!" ? C.success : C.error,
          }}
        >
          {result}
        </p>
      )}
    </div>
  );
}
