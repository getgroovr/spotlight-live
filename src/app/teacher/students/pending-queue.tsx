// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/pending-queue.tsx   (NEW FILE)
//
// Client component: renders the pending-submissions section on the
// teacher students page. Each card shows the student's photo thumbnail,
// name, round number, description excerpt, plus Approve / Reject buttons.
//
// Reject reveals a textarea for the rejection reason (the student will
// see it on their dashboard). Approve is instant.
//
// Both actions call server actions in ./actions.ts and rely on
// revalidatePath to refresh the page — the approved/rejected entry
// disappears from the pending list on refresh.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState, useTransition } from "react";
import { approveEntry, rejectEntry } from "./actions";

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
};
const F = "'Outfit',sans-serif";

export type PendingEntryData = {
  id: string;
  thumbnailUrl: string | null;
  descriptionText: string;
  roundNumber: number;
  studentName: string;
};

// ── Individual pending card ───────────────────────────────────────────────

function PendingCard({ entry }: { entry: PendingEntryData }) {
  const [mode, setMode] = useState<"idle" | "rejecting">("idle");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function handleApprove() {
    setFeedback(null);
    startTransition(async () => {
      const result = await approveEntry(entry.id);
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

// ── Queue wrapper ─────────────────────────────────────────────────────────

export function PendingQueue({ entries }: { entries: PendingEntryData[] }) {
  if (entries.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h2
        style={{
          fontSize: 12,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: C.light,
          margin: "0 0 10px",
        }}
      >
        Pending submissions ({entries.length})
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {entries.map((e) => (
          <PendingCard key={e.id} entry={e} />
        ))}
      </div>
    </div>
  );
}
