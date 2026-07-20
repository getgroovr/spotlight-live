// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/multi/multi-client.tsx
//
// Session 98: Client component for multi-teacher game dashboard.
//
// Three sections:
//   1. "My games" — games the teacher participates in (with photo upload)
//   2. "Available games" — forming games the teacher can join
//   3. "Create game" — form to start a new game
//
// Each teacher uploads their own photos. There is no shared pot.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState, useTransition, useEffect } from "react";
import {
  createMultiGame,
  joinMultiGame,
  leaveMultiGame,
  uploadMultiPhoto,
  deleteMultiPhoto,
  startMultiGame,
  deleteMultiGame,
} from "./actions";

// ── Types ────────────────────────────────────────────────────────────────

export type ParticipantData = {
  id: string;
  game_id: string;
  teacher_id: string;
  joined_at: string;
  name?: string;
};

export type PhotoData = {
  id: string;
  game_id: string;
  teacher_id: string;
  media_url: string;
  description_text: string | null;
  round_number: number;
  is_active: boolean;
  created_at: string;
};

export type GameData = {
  id: string;
  topic: string;
  total_rounds: number;
  round_duration_hours: number | null;
  game_phase_hours: number | null;
  review_phase_hours: number | null;
  created_by: string;
  created_by_name: string;
  status: "forming" | "ready" | "active" | "complete";
  created_at: string;
  participants: (ParticipantData & { name: string })[];
  photos: PhotoData[];
  isParticipant: boolean;
  isCreator: boolean;
};

// ── Colors ───────────────────────────────────────────────────────────────

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

// ── Duration formatting ─────────────────────────────────────────────────

function formatDuration(hours: number | null): string {
  if (hours == null) return "—";
  if (hours === 0) return "none";
  const labels: Record<string, string> = {
    "0.25": "15 min", "0.5": "30 min", "1": "1 hr", "1.5": "90 min",
    "2": "2 hr", "5": "5 hr", "22": "22 hr", "24": "1 day",
    "46": "46 hr", "48": "2 days", "144": "6 days", "168": "1 week",
  };
  return labels[String(hours)] || `${hours}h`;
}

const ROUND_TIME_OPTIONS = [
  { value: 24, label: "1 day" },
  { value: 48, label: "2 days" },
  { value: 168, label: "1 week" },
];

const REVIEW_TIME_OPTIONS = [
  { value: 0.25, label: "15 min" },
  { value: 0.5, label: "30 min" },
  { value: 1, label: "1 hr" },
  { value: 2, label: "2 hr" },
  { value: 5, label: "5 hr" },
  { value: 22, label: "22 hr" },
];

// ═════════════════════════════════════════════════════════════════════════
// MultiClient — top-level
// ═════════════════════════════════════════════════════════════════════════
export function MultiClient({
  games,
  teacherId,
  teacherName,
}: {
  games: GameData[];
  teacherId: string;
  teacherName: string;
}) {
  const myGames = games.filter((g) => g.isParticipant);
  const availableGames = games.filter(
    (g) => !g.isParticipant && g.status === "forming",
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ── My games ───────────────────────────────────────────────── */}
      {myGames.length > 0 && (
        <section>
          <SectionLabel text="My games" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {myGames.map((g) => (
              <MyGameCard key={g.id} game={g} teacherId={teacherId} />
            ))}
          </div>
        </section>
      )}

      {/* ── Available games ────────────────────────────────────────── */}
      {availableGames.length > 0 && (
        <section>
          <SectionLabel text="Available games" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {availableGames.map((g) => (
              <AvailableGameCard key={g.id} game={g} />
            ))}
          </div>
        </section>
      )}

      {/* ── No games message ──────────────────────────────────────── */}
      {myGames.length === 0 && availableGames.length === 0 && (
        <div
          style={{
            background: C.panel,
            border: `1px solid ${C.panelEdge}`,
            borderRadius: 14,
            padding: "24px 20px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 14, color: C.textDim, margin: "0 0 4px" }}>
            No multi-teacher games yet.
          </p>
          <p style={{ fontSize: 12, color: C.textFaint, margin: 0 }}>
            Create one below to get started.
          </p>
        </div>
      )}

      {/* ── Create game ────────────────────────────────────────────── */}
      <section>
        <SectionLabel text="Create a game" />
        <CreateGameForm />
      </section>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Section label
// ═════════════════════════════════════════════════════════════════════════
function SectionLabel({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 10,
      }}
    >
      <span
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 1.2,
          color: C.textFaint,
          fontWeight: 600,
        }}
      >
        {text}
      </span>
      <div style={{ flex: 1, borderTop: `1px solid ${C.panelEdge}44` }} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Status badge
// ═════════════════════════════════════════════════════════════════════════
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    forming: { bg: "#FEF3C7", text: "#92400E", border: "#FDE68A" },
    ready: { bg: "#D1FAE5", text: "#065F46", border: "#A7F3D0" },
    active: { bg: "#DBEAFE", text: "#1E40AF", border: "#93C5FD" },
    complete: { bg: "#F3F4F6", text: "#6B7280", border: "#D1D5DB" },
  };
  const c = colors[status] || colors.forming;
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
      {status}
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// My Game Card — expanded view with photo upload
// ═════════════════════════════════════════════════════════════════════════
function MyGameCard({ game, teacherId }: { game: GameData; teacherId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [actionResult, setActionResult] = useState<string | null>(null);

  const myPhotos = game.photos.filter((p) => p.teacher_id === teacherId);
  const otherPhotos = game.photos.filter((p) => p.teacher_id !== teacherId);
  const participantsWithPhotos = new Set(game.photos.map((p) => p.teacher_id));
  const canStart = game.isCreator && game.status === "forming" && game.participants.length >= 3;

  function handleAction(fn: () => Promise<any>, successMsg?: string) {
    setActionResult(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setActionResult(res.error);
      else if (successMsg) {
        setActionResult(successMsg);
        setTimeout(() => setActionResult(null), 3000);
      }
    });
  }

  return (
    <div
      style={{
        background: expanded ? "#fff" : C.panel,
        border: `1px solid ${expanded ? C.light + "66" : C.panelEdge}`,
        borderRadius: 14,
        overflow: "hidden",
        transition: "all 0.15s ease",
        opacity: pending ? 0.6 : 1,
        pointerEvents: pending ? "none" : "auto",
      }}
    >
      {/* ── Summary bar ──────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 12, color: C.textDim, lineHeight: 1, flexShrink: 0 }}>
          {expanded ? "▾" : "▸"}
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text, flex: 1, minWidth: 0 }}>
          {game.topic}
        </span>
        <span style={{ fontSize: 12, color: C.textFaint, whiteSpace: "nowrap" }}>
          {game.participants.length} teacher{game.participants.length !== 1 ? "s" : ""}
          {" · "}
          {myPhotos.length} photo{myPhotos.length !== 1 ? "s" : ""}
        </span>
        <StatusBadge status={game.status} />
      </button>

      {/* ── Expanded content ──────────────────────────────────────── */}
      {expanded && (
        <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.panelEdge}44` }}>
          {/* Game details */}
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              padding: "10px 0",
              fontSize: 12,
              color: C.textFaint,
            }}
          >
            <span>{game.total_rounds} round{game.total_rounds !== 1 ? "s" : ""}</span>
            {game.round_duration_hours != null && (
              <span>Round: {formatDuration(game.round_duration_hours)}</span>
            )}
            {game.review_phase_hours != null && (
              <span>Review: {formatDuration(game.review_phase_hours)}</span>
            )}
            <span>Created by {game.created_by_name}</span>
          </div>

          {/* Participants */}
          <div style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.textDim, display: "block", marginBottom: 6 }}>
              Participants ({game.participants.length})
              {game.participants.length < 3 && (
                <span style={{ fontWeight: 400, color: C.textFaint, marginLeft: 6 }}>
                  — need {3 - game.participants.length} more to start
                </span>
              )}
            </span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {game.participants.map((p) => (
                <span
                  key={p.id}
                  style={{
                    fontSize: 11,
                    padding: "3px 10px",
                    borderRadius: 999,
                    background: p.teacher_id === teacherId ? C.light + "20" : "#f5f0eb",
                    border: `1px solid ${p.teacher_id === teacherId ? C.light + "44" : C.panelEdge + "66"}`,
                    color: p.teacher_id === teacherId ? C.light : C.textDim,
                    fontWeight: p.teacher_id === teacherId ? 700 : 400,
                  }}
                >
                  {p.name}
                  {participantsWithPhotos.has(p.teacher_id) && (
                    <span style={{ marginLeft: 4, fontSize: 9, color: C.success }}>✓</span>
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* Photo upload (only for forming/ready games) */}
          {(game.status === "forming" || game.status === "ready") && (
            <PhotoUploadSection gameId={game.id} myPhotos={myPhotos} pending={pending} startTransition={startTransition} />
          )}

          {/* Other teachers' photo counts (not the photos themselves) */}
          {otherPhotos.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <span style={{ fontSize: 11, color: C.textFaint }}>
                Other teachers have uploaded {otherPhotos.length} photo{otherPhotos.length !== 1 ? "s" : ""} total
              </span>
            </div>
          )}

          {/* Actions */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 14,
              paddingTop: 12,
              borderTop: `1px solid ${C.panelEdge}33`,
              flexWrap: "wrap",
            }}
          >
            {canStart && (
              <ActionButton
                label="Start game"
                variant="primary"
                onClick={() => handleAction(() => startMultiGame(game.id), "Game started!")}
              />
            )}
            {!game.isCreator && (game.status === "forming" || game.status === "ready") && (
              <ActionButton
                label="Leave game"
                variant="danger"
                onClick={() => {
                  if (confirm("Leave this game? Your photos will be removed.")) {
                    handleAction(() => leaveMultiGame(game.id));
                  }
                }}
              />
            )}
            {game.isCreator && game.status === "forming" && (
              <ActionButton
                label="Delete game"
                variant="danger"
                onClick={() => {
                  if (confirm("Delete this game? All participants and photos will be removed.")) {
                    handleAction(() => deleteMultiGame(game.id));
                  }
                }}
              />
            )}
          </div>

          {actionResult && (
            <p
              style={{
                fontSize: 12,
                marginTop: 8,
                color: actionResult.startsWith("Game started") ? C.success : C.error,
              }}
            >
              {actionResult}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Photo upload section within a game card
// ═════════════════════════════════════════════════════════════════════════
function PhotoUploadSection({
  gameId,
  myPhotos,
  pending,
  startTransition,
}: {
  gameId: string;
  myPhotos: PhotoData[];
  pending: boolean;
  startTransition: (cb: () => void) => void;
}) {
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

  const onSubmitUpload = async (formData: FormData) => {
    formData.set("game_id", gameId);
    formData.set("round_number", "1");
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

  const handleDeletePhoto = (photoId: string) => {
    if (!confirm("Remove this photo?")) return;
    startTransition(async () => {
      await deleteMultiPhoto(photoId);
    });
  };

  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.panelEdge}`,
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 10px", color: C.text }}>
        Your photos ({myPhotos.length})
      </h3>

      {/* Existing photos */}
      {myPhotos.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
            gap: 8,
            marginBottom: 14,
          }}
        >
          {myPhotos.map((p) => (
            <div
              key={p.id}
              style={{
                position: "relative",
                borderRadius: 8,
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
              <button
                type="button"
                onClick={() => handleDeletePhoto(p.id)}
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "rgba(0,0,0,0.5)",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: "bold",
                }}
                title="Remove photo"
              >
                ✕
              </button>
              {p.description_text && (
                <div
                  style={{
                    padding: "4px 6px",
                    fontSize: 10,
                    color: C.textFaint,
                    lineHeight: 1.3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.description_text}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload form */}
      <form action={onSubmitUpload}>
        <div style={{ marginBottom: 10 }}>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: C.light + "15",
              border: `1px solid ${C.light}66`,
              borderRadius: 8,
              padding: "8px 16px",
              cursor: "pointer",
              fontSize: 13,
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
            <span style={{ fontSize: 12, color: C.success, marginLeft: 8 }}>
              File selected ✓
            </span>
          )}
        </div>

        {previewUrl && (
          <div
            style={{
              borderRadius: 8,
              border: `1px solid ${C.panelEdge}`,
              background: "#fff",
              padding: 6,
              marginBottom: 10,
              textAlign: "center",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Preview"
              style={{ maxHeight: 160, borderRadius: 6, display: "inline-block" }}
            />
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "block", fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>
            Description
            <span style={{ fontWeight: 400, color: C.textFaint, marginLeft: 6 }}>
              (shown to students)
            </span>
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
              padding: "7px 10px",
              fontSize: 13,
              color: C.text,
              fontFamily: "inherit",
              outline: "none",
              resize: "vertical",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          style={{
            background: C.light,
            color: "#fff",
            border: "none",
            borderRadius: 999,
            padding: "7px 18px",
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "inherit",
            cursor: pending ? "default" : "pointer",
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? "Uploading…" : "Add photo"}
        </button>

        {result && !result.ok && (
          <p style={{ fontSize: 13, color: C.error, marginTop: 8 }}>{result.error}</p>
        )}
        {result && result.ok && (
          <p style={{ fontSize: 13, color: C.success, marginTop: 8 }}>Photo added.</p>
        )}
      </form>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Available Game Card — compact, with join button
// ═════════════════════════════════════════════════════════════════════════
function AvailableGameCard({ game }: { game: GameData }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleJoin() {
    setError(null);
    startTransition(async () => {
      const res = await joinMultiGame(game.id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.panelEdge}`,
        borderRadius: 14,
        padding: "14px 16px",
        opacity: pending ? 0.6 : 1,
        pointerEvents: pending ? "none" : "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
          {game.topic}
        </span>
        <StatusBadge status={game.status} />
      </div>

      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          fontSize: 12,
          color: C.textFaint,
          marginBottom: 10,
        }}
      >
        <span>Created by {game.created_by_name}</span>
        <span>{game.total_rounds} round{game.total_rounds !== 1 ? "s" : ""}</span>
        <span>{game.participants.length} teacher{game.participants.length !== 1 ? "s" : ""} joined</span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {game.participants.map((p) => (
          <span
            key={p.id}
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 999,
              background: "#f5f0eb",
              border: `1px solid ${C.panelEdge}66`,
              color: C.textDim,
            }}
          >
            {p.name}
          </span>
        ))}
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <ActionButton
          label={pending ? "Joining…" : "Join this game"}
          variant="primary"
          onClick={handleJoin}
        />
        {error && (
          <span style={{ fontSize: 12, color: C.error }}>{error}</span>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Create Game Form
// ═════════════════════════════════════════════════════════════════════════
function CreateGameForm() {
  const [pending, startTransition] = useTransition();
  const [topic, setTopic] = useState("");
  const [rounds, setRounds] = useState(3);
  const [roundTime, setRoundTime] = useState(48);
  const [reviewTime, setReviewTime] = useState(2);
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const playTime = roundTime - reviewTime;
  const playTimeLabel = formatDuration(playTime > 0 ? playTime : 0);

  function handleCreate() {
    const trimmed = topic.trim();
    if (!trimmed) {
      setResult({ ok: false, error: "Enter a topic for the game." });
      return;
    }
    setResult(null);
    startTransition(async () => {
      const r = await createMultiGame(
        trimmed,
        rounds,
        roundTime,
        playTime > 0 ? playTime : null,
        reviewTime,
      );
      setResult(r);
      if (r.ok) {
        setTopic("");
        setRounds(3);
        setRoundTime(48);
        setReviewTime(2);
      }
    });
  }

  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.panelEdge}`,
        borderRadius: 14,
        padding: "18px 20px",
        opacity: pending ? 0.6 : 1,
        pointerEvents: pending ? "none" : "auto",
      }}
    >
      {/* Topic */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>
          Topic
        </label>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Mountain landscapes of the American Southwest"
          maxLength={200}
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "#fff",
            border: `1px solid ${C.panelEdge}`,
            borderRadius: 8,
            padding: "7px 10px",
            fontSize: 13,
            color: C.text,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
      </div>

      {/* Rounds */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>
          Student rounds
        </label>
        <select
          value={rounds}
          onChange={(e) => setRounds(Number(e.target.value))}
          style={{
            background: "#fff",
            border: `1px solid ${C.panelEdge}`,
            borderRadius: 8,
            padding: "7px 10px",
            fontSize: 13,
            color: C.text,
            fontFamily: "inherit",
            outline: "none",
          }}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <option key={n} value={n}>
              {n} round{n !== 1 ? "s" : ""}
              {n > 0 && ` (${n + 1} total with warmup)`}
            </option>
          ))}
        </select>
      </div>

      {/* Timing */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ flex: "1 1 140px" }}>
          <label style={{ display: "block", fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>
            Round time
          </label>
          <select
            value={roundTime}
            onChange={(e) => setRoundTime(Number(e.target.value))}
            style={{
              width: "100%",
              background: "#fff",
              border: `1px solid ${C.panelEdge}`,
              borderRadius: 8,
              padding: "7px 10px",
              fontSize: 13,
              color: C.text,
              fontFamily: "inherit",
              outline: "none",
            }}
          >
            {ROUND_TIME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <label style={{ display: "block", fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>
            Review time
          </label>
          <select
            value={reviewTime}
            onChange={(e) => setReviewTime(Number(e.target.value))}
            style={{
              width: "100%",
              background: "#fff",
              border: `1px solid ${C.panelEdge}`,
              borderRadius: 8,
              padding: "7px 10px",
              fontSize: 13,
              color: C.text,
              fontFamily: "inherit",
              outline: "none",
            }}
          >
            {REVIEW_TIME_OPTIONS.filter((o) => o.value < roundTime).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <label style={{ display: "block", fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>
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
            {playTimeLabel}
          </div>
        </div>
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={handleCreate}
        disabled={pending}
        style={{
          background: C.light,
          color: "#fff",
          border: "none",
          borderRadius: 999,
          padding: "8px 22px",
          fontSize: 14,
          fontWeight: 700,
          fontFamily: "inherit",
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "Creating…" : "Create game"}
      </button>

      {result && !result.ok && (
        <p style={{ fontSize: 13, color: C.error, marginTop: 8 }}>{result.error}</p>
      )}
      {result && result.ok && (
        <p style={{ fontSize: 13, color: C.success, marginTop: 8 }}>
          Game created! Upload your photos above.
        </p>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Action button
// ═════════════════════════════════════════════════════════════════════════
function ActionButton({
  label,
  variant,
  onClick,
}: {
  label: string;
  variant: "primary" | "danger" | "default";
  onClick: () => void;
}) {
  const styles: Record<string, { bg: string; color: string; border: string; hover: string }> = {
    primary: { bg: C.light, color: "#fff", border: "none", hover: "#c47a24" },
    danger: { bg: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", hover: "#FEE2E2" },
    default: { bg: "#f5f0eb", color: C.textDim, border: `1px solid ${C.panelEdge}`, hover: "#ede7dd" },
  };
  const s = styles[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: s.bg,
        color: s.color,
        border: s.border,
        borderRadius: 999,
        padding: "6px 16px",
        fontSize: 12,
        fontWeight: 700,
        fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
