// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/student/dashboard/ResubmitFavoriteCommentForm.tsx   (REPLACES)
//
// B23 (#47): Client component for resubmitting a rejected favorite comment.
//
// Shows an inline form in the Teacher's Warm-up Round section when the
// favorite comment has been rejected. The student edits the text and
// hits "Resubmit." The form calls resubmitFavoriteComment in
// play/actions.ts, which updates the game_session and resets
// favorite_comment_status to 'pending'.
//
// B28 (#48): Same router.refresh() fix as ResubmitEntryForm — without
//   it, success leaves the parent warm-up card showing the OLD rejected
//   state until a hard refresh. Calling router.refresh() after success
//   makes the card transition out of the rejected branch immediately.
//
// Session 77: Removed the duplicate favorite-photo display from the
//   expanded form. The parent (Action Needed / ROUND FAVORITE COMMENT
//   SENT BACK) already shows the photo the student picked. Showing it
//   again inside the form was redundant — now matches the cleaner
//   entry-resubmit pattern. Props kept for backward compat.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resubmitFavoriteComment } from "@/app/play/actions";

const C = {
  panelEdge: "#C9A877",
  panelSoft: "#FFFDF7",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
  danger: "#C04030",
  liveGreen: "#7A9F5C",
};
const F = "'Outfit',sans-serif";

// B73 (session 73): round prop added so the action knows which
// game_session to update. Defaults to 0 (warm-up) for backward compat.
//
// Session 76: favoritePhotoUrl / favoriteDescription props kept for
// backward compat but the photo is no longer rendered inside the form
// (parent already shows it — no duplicate).
export default function ResubmitFavoriteCommentForm({
  currentText,
  round = 0,
  favoritePhotoUrl = null,
  favoriteDescription = null,
}: {
  currentText: string;
  round?: number;
  favoritePhotoUrl?: string | null;
  favoriteDescription?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState(currentText);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  function handleSubmit() {
    if (!text.trim() || text.trim().length < 15) {
      setFeedback("Please write at least 15 characters.");
      return;
    }

    const fd = new FormData();
    fd.set("favorite_comment", text.trim());
    fd.set("round", String(round));

    setFeedback(null);
    startTransition(async () => {
      const result = await resubmitFavoriteComment(null, fd);
      if (!result.ok) {
        setFeedback(result.error || "Something went wrong.");
      } else {
        // B28 (#48): refresh server data so the parent re-renders out
        // of the rejected branch (red border / rejection box go away,
        // status pill flips to "AWAITING APPROVAL").
        setSuccess(true);
        router.refresh();
      }
    });
  }

  if (success) {
    return (
      <div style={{
        background: "#E2EFD9",
        border: `1px solid ${C.liveGreen}`,
        borderRadius: 8, padding: "10px 14px",
        fontSize: 13, color: "#3D5A1F", fontWeight: 600,
        marginTop: 10,
      }}>
        Resubmitted! Refreshing…
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          fontFamily: F,
          fontSize: 12,
          fontWeight: 700,
          padding: "7px 16px",
          borderRadius: 8,
          border: `1px solid ${C.light}`,
          background: C.light,
          color: "#fff",
          cursor: "pointer",
          marginTop: 8,
        }}
      >
        Edit and resubmit →
      </button>
    );
  }

  return (
    <div style={{
      marginTop: 10,
      background: C.panelSoft,
      border: `1px solid ${C.panelEdge}`,
      borderRadius: 10, padding: 14,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 700, color: C.text,
        marginBottom: 8, letterSpacing: 0.5,
      }}>
        Edit your favorite comment
      </div>

      {/* Session 77: photo display removed — the parent section already
          shows the favorited photo in context. No duplicate. */}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Why was this your favorite? (at least 15 characters)"
        rows={3}
        style={{
          fontFamily: F, fontSize: 13,
          padding: "8px 10px", borderRadius: 6,
          border: `1px solid ${C.panelEdge}`,
          resize: "vertical", width: "100%",
          boxSizing: "border-box", lineHeight: 1.5,
          marginBottom: 10,
        }}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          style={{
            fontFamily: F, fontSize: 12, fontWeight: 700,
            padding: "7px 18px", borderRadius: 6,
            border: `1px solid ${C.light}`,
            background: C.light, color: "#fff",
            cursor: isPending ? "default" : "pointer",
            opacity: isPending ? 0.5 : 1,
          }}
        >
          {isPending ? "Submitting…" : "Resubmit"}
        </button>
        <button
          type="button"
          onClick={() => { setExpanded(false); setFeedback(null); }}
          disabled={isPending}
          style={{
            fontFamily: F, fontSize: 12,
            padding: "7px 14px", borderRadius: 6,
            border: `1px solid ${C.panelEdge}`,
            background: "transparent", color: C.textDim,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>

      {feedback && (
        <p style={{
          fontSize: 12, color: C.danger, margin: "8px 0 0",
          lineHeight: 1.4,
        }}>
          {feedback}
        </p>
      )}
    </div>
  );
}
