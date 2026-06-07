"use client";

// ─────────────────────────────────────────────────────────────────────────
// src/app/student/dashboard/RemoveEntryButton.tsx — NEW in #27.
//
// Tiny client component wrapping a one-button <form> that calls
// removeEntry. Rendered on FILLED UPCOMING slots only (filled slots in
// the Current or Completed bands are read-only — their rounds have
// already started, so the action would be rejected server-side anyway).
//
// The button is intentionally restrained: a small "✕ Remove" link rather
// than a big destructive-red affordance. Two reasons:
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
          aria-label={`Remove your Student Round ${roundNumber} photo`}
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
          ✕ Remove
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
