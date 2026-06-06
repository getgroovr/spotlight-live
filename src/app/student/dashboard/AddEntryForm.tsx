"use client";

// ─────────────────────────────────────────────────────────────────────────
// src/app/student/dashboard/AddEntryForm.tsx
//
// Client wrapper around the "Add another photo" <form> so we can use
// useFormState to capture the ActionResult returned by addEntry and render
// an error banner above the submit button on failure. Before #26, addEntry
// was Promise<void> and any failure (upload failed, insert failed) silently
// no-op'd — the student hit "Add to the class →" and the dashboard refreshed
// with their new photo nowhere to be seen.
//
// PhotoField is a pre-existing client component reused here.
// ─────────────────────────────────────────────────────────────────────────

import { useFormState } from "react-dom";
import { addEntry, type ActionResult } from "@/app/play/actions";
import PhotoField from "./PhotoField";

const C = {
  panelEdge: "#C9A877",
  light: "#D98A2B",
  text: "#3A2A18",
  errorBg: "#FBE2DC",
  errorEdge: "#B85844",
  errorText: "#7A2618",
};
const F = "'Outfit',sans-serif";

export default function AddEntryForm() {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    addEntry,
    null
  );

  return (
    <form action={formAction}>
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

      {/* ── Error banner — shows when addEntry returned ok:false ── */}
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
