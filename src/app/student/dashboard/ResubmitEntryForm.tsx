// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/student/dashboard/ResubmitEntryForm.tsx   (REPLACES)
//
// B23 (#47): Client component for resubmitting a rejected entry.
//
// Shows an inline form on the student dashboard when an entry has
// status='rejected'. The student can upload a new photo and write a
// new description, then hit "Resubmit." The form calls resubmitEntry
// in play/actions.ts, which updates the entry in place and resets
// status to 'pending'.
//
// The form starts collapsed behind an "Edit and resubmit" button so
// it doesn't overwhelm the card layout. Once expanded, it shows the
// file input, textarea, and submit button.
//
// B28 (#48): on success, call router.refresh() so the parent dashboard
//   re-fetches server data and the card re-renders with the NEW media_url
//   (status flips from 'rejected' → 'pending', red border → orange,
//   new photo replaces old). Previously the action's revalidatePath()
//   updated server-side state but the client never refetched, so the
//   old "rejected" card kept rendering until a hard refresh — which
//   read as "the resubmitted photo isn't viewable."
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { resubmitEntry } from "@/app/play/actions";

const C = {
  bg: "#FBF6EC",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  panelSoft: "#FFFDF7",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
  danger: "#C04030",
  dangerBg: "#FCEAE8",
  liveGreen: "#7A9F5C",
};
const F = "'Outfit',sans-serif";

export default function ResubmitEntryForm({
  entryId,
  currentDescription,
  roundNumber,
}: {
  entryId: string;
  currentDescription: string | null;
  roundNumber: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [description, setDescription] = useState(currentDescription || "");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function handleSubmit() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    fd.set("entry_id", entryId);
    fd.set("entry_description", description);

    setFeedback(null);
    startTransition(async () => {
      const result = await resubmitEntry(null, fd);
      if (!result.ok) {
        setFeedback(result.error || "Something went wrong.");
      } else {
        // B28 (#48): show the success state briefly, then refresh server
        // data on the client so the parent card transitions out of the
        // rejected branch and renders the new photo + pending status.
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
        marginBottom: 10, letterSpacing: 0.5,
      }}>
        Resubmit for Round {roundNumber}
      </div>

      <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
        {/* Photo upload */}
        <div style={{ marginBottom: 12 }}>
          <label style={{
            fontSize: 11, fontWeight: 600, color: C.textDim,
            textTransform: "uppercase", letterSpacing: 1,
            display: "block", marginBottom: 4,
          }}>
            New photo
          </label>
          <input
            type="file"
            name="entry_photo"
            accept="image/*"
            required
            style={{
              fontFamily: F, fontSize: 13,
              width: "100%", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: 12 }}>
          <label style={{
            fontSize: 11, fontWeight: 600, color: C.textDim,
            textTransform: "uppercase", letterSpacing: 1,
            display: "block", marginBottom: 4,
          }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your photo…"
            rows={2}
            style={{
              fontFamily: F, fontSize: 13,
              padding: "8px 10px", borderRadius: 6,
              border: `1px solid ${C.panelEdge}`,
              resize: "vertical", width: "100%",
              boxSizing: "border-box", lineHeight: 1.5,
            }}
          />
        </div>

        {/* Actions */}
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
      </form>
    </div>
  );
}
