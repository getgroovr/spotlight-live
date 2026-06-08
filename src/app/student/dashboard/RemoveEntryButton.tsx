"use client";

// ─────────────────────────────────────────────────────────────────────────
// src/app/student/dashboard/RemoveEntryButton.tsx — NEW in #27.
//
// Tiny client component wrapping a one-button <form> that calls
// removeEntry. Rendered on FILLED UPCOMING slots only (filled slots in
// the Current or Completed bands are read-only — their rounds have
// already started, so the action would be rejected server-side anyway).
//
// Label note (#28): the user-facing label reads "Replace photo" even
// though the action itself only REMOVES the entry — the empty slot
// then surfaces "+ Add photo" so the student can upload a new one.
// Mike's call: the user's mental model is replacement, not deletion;
// the two-step nature is invisible to them.  Component name stays
// `RemoveEntryButton` because that's still what the underlying action
// does, and renaming the component would churn imports for no gain.
//
// PLANNED — status-only replacement block (Mike's call, captured #28
// planning):
//
// Once a teacher has APPROVED an entry, the student should no longer
// be able to replace it.  Approval is a commitment; casually nuking
// the teacher's sign-off is bad UX.  Pending entries — even those
// with a teacher NOTE attached — REMAIN replaceable; notes are
// cheaper to redo than approvals, so blocking on note-presence would
// be too aggressive.
//
// Implementation when this lands:
//   • Take `entryStatus` as a new prop on this component (or just
//     conditionally render at the call site in page.tsx).
//   • When status === 'approved': hide the button entirely, OR render
//     a small "✓ Approved — locked in" indicator in its place.
//   • Update the helper line in page.tsx ("You can replace this photo
//     until the round starts.") to reflect approval as an additional
//     lockout — e.g. "You can replace this photo until your teacher
//     approves it or the round starts."
//   • removeEntry on the server should ALSO reject when the entry is
//     already approved.  This button is a UX affordance, not a
//     security boundary; the server is the gate.
//
// Classmate comments are a separate, deferred concern — pending the
// `entries` ↔ `submissions` seam resolution.  Once comments exist,
// "what happens to comments when the underlying entry is replaced?"
// becomes its own design question (CASCADE delete vs orphan vs
// block-replace-if-comments-exist).  Solve it then, not now.
//
// The button is intentionally restrained: a small underlined link
// rather than a big destructive-red affordance. Two reasons:
//   • The slot still has the queued photo visible right above the button.
//     Big "DELETE" framing would feel scarier than the action warrants.
//   • If the student misclicks, they can just re-upload — the storage
//     object is gone but the photo file is still on their device, and
//     the slot still exists, unlocked. Low blast radius.
//
// Server-side authorization is the real gate: removeEntry verifies the
// entry's student_id matches the logged-in user AND that the entry's
// round is not yet locked. This button is a UX affordance, not a security
// boundary.
//
// Failures (e.g. the round just started, so the entry is now locked)
// surface as an inline red banner below the button.
// ─────────────────────────────────────────────────────────────────────────

import { useActionState as useFormState } from "react";
import { removeEntry, type ActionResult } from "@/app/play/actions";

const C = {
  textFaint: "#9A815E",
  errorBg: "#FBE2DC",
  errorEdge: "#B85844",
  errorText: "#7A2618",
};
const F = "'Outfit',sans-serif";

export default function RemoveEntryButton({
  entryId,
  roundNumber,
}: {
  entryId: string;
  roundNumber: number;
}) {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    removeEntry,
    null
  );

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="entry_id" value={entryId} />
        <button
          type="submit"
          aria-label={`Replace your Student Round ${roundNumber} photo`}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: F,
            fontSize: 12,
            color: C.textFaint,
            textDecoration: "underline",
          }}
        >
          Replace photo
        </button>
      </form>
      {state && !state.ok && (
        <div role="alert" style={{
          background: C.errorBg,
          border: `1px solid ${C.errorEdge}`,
          color: C.errorText,
          padding: "8px 12px",
          borderRadius: 8,
          fontSize: 12,
          lineHeight: 1.5,
          marginTop: 8,
        }}>
          {state.error}
        </div>
      )}
    </div>
  );
}
