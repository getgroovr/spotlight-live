"use client";

// ─────────────────────────────────────────────────────────────────────────
// src/app/student/dashboard/AddEntryForm.tsx
//
// Client wrapper around the "Add another photo" <form>. Uses useActionState
// (aliased to useFormState below for grep continuity) to capture the
// ActionResult returned by addEntry and render a banner above the submit
// button — red on failure, green on success.
//
// Before #26, addEntry was Promise<void> and any failure (upload failed,
// insert failed) silently no-op'd; the student hit "Add to the class →"
// and the dashboard refreshed with their new photo nowhere to be seen.
//
// Success polish (#26 follow-up): green banner on success and resets all
// form fields on each successful submit by keying a wrapper div on a
// submit counter — React unmounts and remounts the subtree, which resets
// PhotoField's internal preview state alongside the native input/textarea
// values. Previously a successful submit cleared the textarea and file
// input but left PhotoField's preview thumbnail visible, which read as
// ambiguous ("did it submit or not?").
//
// React/Next note: on Next 16 / React 19, useFormState from react-dom is
// no longer available — useActionState from "react" replaces it. Same
// signature (returns [state, dispatch, isPending] — we ignore isPending).
// PhotoField is a pre-existing client component reused here.
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

export default function AddEntryForm() {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    addEntry,
    null
  );

  // Each successful submit bumps this counter. The wrapping <div key={...}>
  // below keys on it, so a successful submit causes React to unmount and
  // remount the whole subtree — which resets PhotoField (whose preview
  // lives in its own client state) along with the native file/text inputs.
  const [submitId, setSubmitId] = useState(0);
  useEffect(() => {
    if (state?.ok) setSubmitId((n) => n + 1);
  }, [state]);

  return (
    <form action={formAction}>
      <div key={submitId}>
        <PhotoField
          name="entry_photo"
          label="Photo"
          helper="something you'd like classmates to see and comment on"
          required
          previewSize={160}
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

      {/* ── Banners — live OUTSIDE the keyed wrapper so they persist across resets ── */}
      {state?.ok && (
        <div role="status" style={{
          background: C.successBg, border: `1px solid ${C.successEdge}`,
          color: C.successText, padding: "10px 14px", borderRadius: 10,
          fontSize: 13, lineHeight: 1.5, marginTop: 12,
        }}>
          <strong>Submitted ✓</strong> Your teacher will review this. Add another whenever you&apos;d like.
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
        Add to the class →
      </button>
    </form>
  );
}
