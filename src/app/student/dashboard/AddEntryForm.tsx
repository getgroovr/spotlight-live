"use client";

// ─────────────────────────────────────────────────────────────────────────
// src/app/student/dashboard/AddEntryForm.tsx
//
// Client wrapper around an "Add to Student Round N" <form>. Lives inside
// each EMPTY UPCOMING slot of the dashboard's three-band round stack (#27).
//
// Takes a `roundNumber` prop and posts it as a hidden round_number input.
// addEntry validates it server-side (must be unlocked, in range, unfilled
// by this student) and writes the new `entries` row at that exact slot.
//
// Pre-#27, this form was standalone in the "Your photo → Add another photo"
// card with no slot target; addEntry auto-resolved.  The slot-aware version
// is explicit: each empty upcoming slot has its own AddEntryForm instance
// scoped to that slot's round.
//
// Error/success banners (#26 polish) preserved:
//   • Red banner above the submit on state.error.
//   • Green banner ("Added to the queue — your teacher will review your
//     Student Round N photo") on state.ok, written specifically for the
//     queueing model rather than the old generic "Submitted ✓".
//   • Form-reset trick: the keyed wrapper <div key={submitId}> bumps on
//     each successful submit, remounting PhotoField (which resets its
//     internal preview thumbnail) and clearing the textarea/file input.
//     Banners live outside the keyed wrapper so they persist through reset.
//
// React/Next note: on Next 16 / React 19, useFormState from react-dom is
// no longer available — useActionState from "react" replaces it. Same
// signature; the third tuple element (isPending) is ignored.
// ─────────────────────────────────────────────────────────────────────────

import { useActionState as useFormState } from "react";
import { useEffect, useState } from "react";
import { addEntry, type ActionResult } from "@/app/play/actions";
import PhotoField from "./PhotoField";

const C = {
  panelEdge: "#C9A877",
  light: "#D98A2B",
  text: "#3A2A18",
  errorBg: "#FBE2DC",
  errorEdge: "#B85844",
  errorText: "#7A2618",
  successBg: "#E2EFD9",
  successEdge: "#7A9F5C",
  successText: "#3D5A1F",
};
const F = "'Outfit',sans-serif";

export default function AddEntryForm({ roundNumber }: { roundNumber: number }) {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    addEntry,
    null
  );

  const [submitId, setSubmitId] = useState(0);
  useEffect(() => {
    if (state?.ok) setSubmitId((n) => n + 1);
  }, [state]);

  return (
    <form action={formAction}>
      {/* #27: tell addEntry exactly which slot this submission is for. */}
      <input type="hidden" name="round_number" value={roundNumber} />

      <div key={submitId}>
        <PhotoField
          name="entry_photo"
          label="Photo"
          helper="something you'd like classmates to see and comment on"
          required
          previewSize={140}
        />
        <label style={{ fontSize: 13, fontWeight: 600, display: "block",
          marginTop: 12, marginBottom: 6, color: C.text }}>
          Tell us about it
        </label>
        <textarea
          name="entry_description"
          required
          rows={3}
          placeholder="What is it? Why did you pick it?"
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px",
            fontFamily: F, fontSize: 14, lineHeight: 1.5,
            background: "#FFFDF7", color: C.text,
            border: `1px solid ${C.panelEdge}`, borderRadius: 12, outline: "none",
            resize: "vertical" }}
        />
      </div>

      {/* Banners live OUTSIDE the keyed wrapper so they persist across resets. */}
      {state?.ok && (
        <div role="status" style={{
          background: C.successBg, border: `1px solid ${C.successEdge}`,
          color: C.successText, padding: "10px 14px", borderRadius: 10,
          fontSize: 13, lineHeight: 1.5, marginTop: 12,
        }}>
          <strong>Added to the queue ✓</strong> Your teacher will review your
          Student Round {roundNumber} photo before it goes live.
        </div>
      )}
      {state && !state.ok && (
        <div role="alert" style={{
          background: C.errorBg, border: `1px solid ${C.errorEdge}`,
          color: C.errorText, padding: "10px 14px", borderRadius: 10,
          fontSize: 13, lineHeight: 1.5, marginTop: 12,
        }}>
          {state.error}
        </div>
      )}

      <button
        type="submit"
        style={{ width: "100%", padding: "11px", fontFamily: F,
          fontSize: 14, fontWeight: 700, background: C.light,
          color: "#fff", border: "none", borderRadius: 10,
          cursor: "pointer", letterSpacing: 0.5, marginTop: 12 }}
      >
        Add to Student Round {roundNumber} →
      </button>
    </form>
  );
}
