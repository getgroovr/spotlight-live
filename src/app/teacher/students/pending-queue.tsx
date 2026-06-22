// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/pending-queue.tsx   (REPLACES)
//
// Client component: renders pending-submissions AND pending-favorite-
// comments sections on the teacher students page.
//
// SECTION 1 — Pending submissions (unchanged from #37):
//   Each card shows the student's photo thumbnail, name, round number,
//   description excerpt, plus Approve / Reject buttons.
//   - Approve: optional textarea for a note → approveEntry
//   - Reject: required textarea for a reason → rejectEntry
//
// SECTION 2 — Pending favorite comments (NEW #38):
//   Each card shows the student's name, the comment they left on the
//   favorited pic, their "why it's my favorite" text, and a small
//   thumbnail of the favorited pic. Approve is a single confirm click;
//   reject requires a reason.
//   - Approve: one-click confirm → approveFavoriteComment
//   - Reject: required textarea for a reason → rejectFavoriteComment
//
// Both sections call server actions in ./actions.ts and rely on
// revalidatePath to refresh the page — reviewed items disappear on
// refresh.
//
// #41 FIX: Favorite comment cards now show "Warm-up Round" when
//   roundNumber === 0 (the enrollment/warm-up session), and
//   "Round N" for student rounds. With the round-0 convention (#45),
//   game_sessions.round=0 is warm-up and round=N maps directly to
//   Student Round N — no offset needed.
//   Entry cards are unchanged — entries.round_number already represents
//   the student round directly (1, 2, 3…).
//
// #45: Round-0 convention fix for favorite comment cards. Warm-up is
//   round 0 in the DB, student rounds start at 1 (no offset).
//   Simplified section headers: "Picture submittals" and "Favorite
//   comments" — no tags or helper text. Added combined attention
//   banner with total count.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState, useTransition } from "react";
import {
  approveEntry,
  rejectEntry,
  approveFavoriteComment,
  rejectFavoriteComment,
} from "./actions";

const C = {
  bg: "#FBF6EC",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  panelSoft: "#FFFDF7",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
  liveGreen: "#7A9F5C",
  liveGreenBg: "#E2EFD9",
  liveGreenText: "#3D5A1F",
  danger: "#C04030",
  dangerBg: "#FCEAE8",
  blue: "#4A7FB5",
  blueBg: "#E8F0F8",
};
const F = "'Outfit',sans-serif";

// ── Types ─────────────────────────────────────────────────────────────────

export type PendingEntryData = {
  id: string;
  thumbnailUrl: string | null;
  descriptionText: string;
  roundNumber: number;
  studentName: string;
};

export type PendingFavoriteCommentData = {
  sessionId: string;
  studentName: string;
  favoritedEntryThumbnailUrl: string | null;
  commentOnPic: string;
  whyFavorite: string;
  roundNumber: number;
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1 — PENDING ENTRY CARDS
// ═══════════════════════════════════════════════════════════════════════════

function PendingCard({ entry }: { entry: PendingEntryData }) {
  const [mode, setMode] = useState<"idle" | "approving" | "rejecting">("idle");
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function handleApproveConfirm() {
    setFeedback(null);
    startTransition(async () => {
      const result = await approveEntry(entry.id, comment.trim() || undefined);
      if (!result.ok) setFeedback(result.error || "Failed to approve.");
    });
  }

  function handleReject() {
    if (!reason.trim()) {
      setFeedback("Please provide a reason.");
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const result = await rejectEntry(entry.id, reason.trim());
      if (!result.ok) setFeedback(result.error || "Failed to reject.");
      else {
        setMode("idle");
        setReason("");
      }
    });
  }

  return (
    <div
      style={{
        background: C.panelSoft,
        border: `1px solid ${C.panelEdge}`,
        borderRadius: 12,
        padding: 14,
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        flexWrap: "wrap",
        opacity: isPending ? 0.5 : 1,
        transition: "opacity 0.2s ease",
      }}
    >
      {/* Thumbnail */}
      {entry.thumbnailUrl ? (
        <img
          src={entry.thumbnailUrl}
          alt=""
          style={{
            width: 80,
            height: 80,
            objectFit: "cover",
            borderRadius: 8,
            border: `1px solid ${C.panelEdge}`,
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 8,
            border: `1px dashed ${C.panelEdge}`,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            color: C.textFaint,
            background: C.bg,
          }}
        >
          no preview
        </div>
      )}

      {/* Info + actions */}
      <div style={{ flex: 1, minWidth: 200 }}>
        {/* Student name + round */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            {entry.studentName}
          </span>
          <span style={{ fontSize: 12, color: C.textFaint }}>
            · Round {entry.roundNumber}
          </span>
        </div>

        {/* Description excerpt */}
        {entry.descriptionText && (
          <p
            style={{
              fontSize: 13,
              color: C.textDim,
              fontStyle: "italic",
              lineHeight: 1.5,
              margin: "0 0 10px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical" as React.CSSProperties["WebkitBoxOrient"],
              wordBreak: "break-word",
            }}
          >
            &ldquo;{entry.descriptionText}&rdquo;
          </p>
        )}

        {/* Action buttons — idle mode */}
        {mode === "idle" && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                setMode("approving");
                setFeedback(null);
              }}
              disabled={isPending}
              style={{
                fontFamily: F,
                fontSize: 12,
                fontWeight: 700,
                padding: "5px 14px",
                borderRadius: 6,
                border: `1px solid ${C.liveGreen}`,
                background: C.liveGreen,
                color: "#fff",
                cursor: isPending ? "default" : "pointer",
              }}
            >
              ✓ Approve
            </button>
            <button
              onClick={() => {
                setMode("rejecting");
                setFeedback(null);
              }}
              disabled={isPending}
              style={{
                fontFamily: F,
                fontSize: 12,
                fontWeight: 700,
                padding: "5px 14px",
                borderRadius: 6,
                border: `1px solid ${C.danger}`,
                background: "transparent",
                color: C.danger,
                cursor: isPending ? "default" : "pointer",
              }}
            >
              ✗ Reject
            </button>
          </div>
        )}

        {/* Approve comment form (optional textarea) */}
        {mode === "approving" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a note for the student (optional)…"
              rows={2}
              autoFocus
              style={{
                fontFamily: F,
                fontSize: 13,
                padding: "8px 10px",
                borderRadius: 6,
                border: `1px solid ${C.liveGreen}66`,
                resize: "vertical",
                lineHeight: 1.5,
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleApproveConfirm}
                disabled={isPending}
                style={{
                  fontFamily: F,
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "5px 14px",
                  borderRadius: 6,
                  border: `1px solid ${C.liveGreen}`,
                  background: C.liveGreen,
                  color: "#fff",
                  cursor: isPending ? "default" : "pointer",
                  opacity: isPending ? 0.5 : 1,
                }}
              >
                Confirm approval
              </button>
              <button
                onClick={() => {
                  setMode("idle");
                  setComment("");
                  setFeedback(null);
                }}
                style={{
                  fontFamily: F,
                  fontSize: 12,
                  padding: "5px 14px",
                  borderRadius: 6,
                  border: `1px solid ${C.panelEdge}`,
                  background: "transparent",
                  color: C.textDim,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Rejection reason form */}
        {mode === "rejecting" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for rejection (the student will see this)…"
              rows={2}
              autoFocus
              style={{
                fontFamily: F,
                fontSize: 13,
                padding: "8px 10px",
                borderRadius: 6,
                border: `1px solid ${C.panelEdge}`,
                resize: "vertical",
                lineHeight: 1.5,
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleReject}
                disabled={isPending || !reason.trim()}
                style={{
                  fontFamily: F,
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "5px 14px",
                  borderRadius: 6,
                  border: `1px solid ${C.danger}`,
                  background: C.danger,
                  color: "#fff",
                  cursor:
                    !reason.trim() || isPending ? "default" : "pointer",
                  opacity: !reason.trim() || isPending ? 0.5 : 1,
                }}
              >
                Send rejection
              </button>
              <button
                onClick={() => {
                  setMode("idle");
                  setReason("");
                  setFeedback(null);
                }}
                style={{
                  fontFamily: F,
                  fontSize: 12,
                  padding: "5px 14px",
                  borderRadius: 6,
                  border: `1px solid ${C.panelEdge}`,
                  background: "transparent",
                  color: C.textDim,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Error feedback */}
        {feedback && (
          <p
            style={{
              fontSize: 12,
              color: C.danger,
              margin: "6px 0 0",
              lineHeight: 1.4,
            }}
          >
            {feedback}
          </p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2 — PENDING FAVORITE COMMENT CARDS
// ═══════════════════════════════════════════════════════════════════════════

function FavoriteCommentCard({ item }: { item: PendingFavoriteCommentData }) {
  const [mode, setMode] = useState<"idle" | "rejecting">("idle");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function handleApprove() {
    setFeedback(null);
    startTransition(async () => {
      const result = await approveFavoriteComment(item.sessionId);
      if (!result.ok) setFeedback(result.error || "Failed to approve.");
    });
  }

  function handleReject() {
    if (!reason.trim()) {
      setFeedback("Please provide a reason.");
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const result = await rejectFavoriteComment(item.sessionId, reason.trim());
      if (!result.ok) setFeedback(result.error || "Failed to reject.");
      else {
        setMode("idle");
        setReason("");
      }
    });
  }

  // #45: round-0 convention — warm-up is round 0 in the DB.
  // Student game rounds start at 1 and display directly (no offset).
  const roundLabel =
    item.roundNumber === 0
      ? "Warm-up Round"
      : `Round ${item.roundNumber}`;

  return (
    <div
      style={{
        background: C.blueBg,
        border: `1px solid ${C.blue}44`,
        borderRadius: 12,
        padding: 14,
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        flexWrap: "wrap",
        opacity: isPending ? 0.5 : 1,
        transition: "opacity 0.2s ease",
      }}
    >
      {/* Thumbnail of the favorited entry */}
      {item.favoritedEntryThumbnailUrl ? (
        <img
          src={item.favoritedEntryThumbnailUrl}
          alt=""
          style={{
            width: 64,
            height: 64,
            objectFit: "cover",
            borderRadius: 8,
            border: `1px solid ${C.blue}44`,
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 8,
            border: `1px dashed ${C.blue}44`,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            color: C.textFaint,
            background: C.bg,
          }}
        >
          no pic
        </div>
      )}

      {/* Info + actions */}
      <div style={{ flex: 1, minWidth: 200 }}>
        {/* Student name + round */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            {item.studentName}
          </span>
          <span style={{ fontSize: 12, color: C.textFaint }}>
            · {roundLabel}
          </span>
        </div>

        {/* Comment on the favorited pic */}
        {item.commentOnPic && (
          <div style={{ marginBottom: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.textFaint,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Comment on pic
            </span>
            <p
              style={{
                fontSize: 13,
                color: C.textDim,
                fontStyle: "italic",
                lineHeight: 1.5,
                margin: "2px 0 0",
                wordBreak: "break-word",
              }}
            >
              &ldquo;{item.commentOnPic}&rdquo;
            </p>
          </div>
        )}

        {/* Why it's my favorite */}
        {item.whyFavorite && (
          <div style={{ marginBottom: 10 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.textFaint,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Why it&rsquo;s my favorite
            </span>
            <p
              style={{
                fontSize: 13,
                color: C.textDim,
                fontStyle: "italic",
                lineHeight: 1.5,
                margin: "2px 0 0",
                wordBreak: "break-word",
              }}
            >
              &ldquo;{item.whyFavorite}&rdquo;
            </p>
          </div>
        )}

        {/* Action buttons — idle mode */}
        {mode === "idle" && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleApprove}
              disabled={isPending}
              style={{
                fontFamily: F,
                fontSize: 12,
                fontWeight: 700,
                padding: "5px 14px",
                borderRadius: 6,
                border: `1px solid ${C.liveGreen}`,
                background: C.liveGreen,
                color: "#fff",
                cursor: isPending ? "default" : "pointer",
                opacity: isPending ? 0.5 : 1,
              }}
            >
              ✓ Approve
            </button>
            <button
              onClick={() => {
                setMode("rejecting");
                setFeedback(null);
              }}
              disabled={isPending}
              style={{
                fontFamily: F,
                fontSize: 12,
                fontWeight: 700,
                padding: "5px 14px",
                borderRadius: 6,
                border: `1px solid ${C.danger}`,
                background: "transparent",
                color: C.danger,
                cursor: isPending ? "default" : "pointer",
              }}
            >
              ✗ Reject
            </button>
          </div>
        )}

        {/* Rejection reason form */}
        {mode === "rejecting" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for rejection (the student will see this)…"
              rows={2}
              autoFocus
              style={{
                fontFamily: F,
                fontSize: 13,
                padding: "8px 10px",
                borderRadius: 6,
                border: `1px solid ${C.panelEdge}`,
                resize: "vertical",
                lineHeight: 1.5,
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleReject}
                disabled={isPending || !reason.trim()}
                style={{
                  fontFamily: F,
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "5px 14px",
                  borderRadius: 6,
                  border: `1px solid ${C.danger}`,
                  background: C.danger,
                  color: "#fff",
                  cursor:
                    !reason.trim() || isPending ? "default" : "pointer",
                  opacity: !reason.trim() || isPending ? 0.5 : 1,
                }}
              >
                Send rejection
              </button>
              <button
                onClick={() => {
                  setMode("idle");
                  setReason("");
                  setFeedback(null);
                }}
                style={{
                  fontFamily: F,
                  fontSize: 12,
                  padding: "5px 14px",
                  borderRadius: 6,
                  border: `1px solid ${C.panelEdge}`,
                  background: "transparent",
                  color: C.textDim,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Error feedback */}
        {feedback && (
          <p
            style={{
              fontSize: 12,
              color: C.danger,
              margin: "6px 0 0",
              lineHeight: 1.4,
            }}
          >
            {feedback}
          </p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// QUEUE WRAPPER — renders both sections
// ═══════════════════════════════════════════════════════════════════════════

export function PendingQueue({
  entries,
  favoriteComments = [],
}: {
  entries: PendingEntryData[];
  favoriteComments?: PendingFavoriteCommentData[];
}) {
  const nothingPending = entries.length === 0 && favoriteComments.length === 0;
  if (nothingPending) return null;

  const totalPending = entries.length + favoriteComments.length;

  return (
    <div style={{ marginBottom: 24 }}>

      {/* ── Attention banner ── */}
      <div style={{
        background: C.light + "14",
        border: `1px solid ${C.light}44`,
        borderRadius: 12,
        padding: "12px 16px",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <span style={{
          fontSize: 18,
          lineHeight: 1,
          flexShrink: 0,
        }}>📋</span>
        <span style={{
          fontSize: 14,
          fontWeight: 700,
          color: C.text,
        }}>
          {totalPending} {totalPending === 1 ? "item needs" : "items need"} your review
        </span>
      </div>

      {/* ── Picture submittals ── */}
      {entries.length > 0 && (
        <>
          <h2
            style={{
              fontSize: 12,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: C.light,
              margin: "0 0 10px",
            }}
          >
            Picture submittals ({entries.length})
          </h2>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginBottom: favoriteComments.length > 0 ? 24 : 0,
            }}
          >
            {entries.map((e) => (
              <PendingCard key={e.id} entry={e} />
            ))}
          </div>
        </>
      )}

      {/* ── Favorite comments ── */}
      {favoriteComments.length > 0 && (
        <>
          <h2
            style={{
              fontSize: 12,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: C.blue,
              margin: "0 0 10px",
            }}
          >
            Favorite comments ({favoriteComments.length})
          </h2>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            {favoriteComments.map((fc) => (
              <FavoriteCommentCard key={fc.sessionId} item={fc} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
