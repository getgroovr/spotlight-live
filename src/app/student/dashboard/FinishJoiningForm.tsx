"use client";

// ─────────────────────────────────────────────────────────────────────────
// src/app/student/dashboard/FinishJoiningForm.tsx
//
// Client wrapper around the finish-joining <form>. Uses useActionState
// (aliased to useFormState below for grep continuity) to capture the
// ActionResult returned by saveProfile and render a banner above the
// submit button — red on failure, green on success.
//
// Before #26, saveProfile was Promise<void> and any failure (no class,
// upload failed, insert failed) silently no-op'd; the student hit
// "Finish joining →" and either nothing happened or they were left in
// INCOMPLETE state with no explanation.
//
// Success polish (#26 follow-up): green success banner and resets all
// form fields on each successful submit by keying a wrapper div on a
// submit counter — React unmounts and remounts the subtree, which resets
// PhotoField's internal preview state alongside the native input/textarea
// values.
//
// Note: on successful saveProfile, the dashboard immediately transitions
// from INCOMPLETE to COMPLETE state and this component unmounts, so the
// success banner and reset machinery here are effectively defense-in-
// depth — they cost nothing but kick in if a re-render keeps the form
// mounted (e.g. partial-save scenarios we haven't seen yet).
//
// React/Next note: on Next 16 / React 19, useFormState from react-dom is
// no longer available — useActionState from "react" replaces it. Same
// signature (returns [state, dispatch, isPending] — we ignore isPending).
// PhotoField is a pre-existing client component reused here.
// ─────────────────────────────────────────────────────────────────────────

import { useActionState as useFormState } from "react";
import { useEffect, useState } from "react";
import { saveProfile, type ActionResult } from "@/app/play/actions";
import PhotoField from "./PhotoField";

const C = {
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  light: "#D98A2B",
  text: "#3A2A18",
  textFaint: "#9A815E",
  errorBg: "#FBE2DC",
  errorEdge: "#B85844",
  errorText: "#7A2618",
  successBg: "#E2EFD9",
  successEdge: "#7A9F5C",
  successText: "#3D5A1F",
};
const F = "'Outfit',sans-serif";

type Props = {
  studentName: string | null;
  studentScreenName: string | null;
  newestFavorite: {
    publicUrl: string | null;
    description_text: string | null;
  } | null;
};

export default function FinishJoiningForm({
  studentName,
  studentScreenName,
  newestFavorite,
}: Props) {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    saveProfile,
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
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
            Your name <span style={{ color: C.textFaint, fontWeight: 400 }}>— your teacher sees this</span>
          </label>
          <input
            name="name"
            type="text"
            required
            defaultValue={studentName || ""}
            placeholder="First name is fine"
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px",
              fontFamily: F, fontSize: 14, background: "#FFFDF7", color: C.text,
              border: `1px solid ${C.panelEdge}`, borderRadius: 10, outline: "none" }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
            Screen name <span style={{ color: C.textFaint, fontWeight: 400 }}>— what classmates see</span>
          </label>
          <input
            name="screen_name"
            type="text"
            required
            defaultValue={studentScreenName || ""}
            placeholder="A name for the class to see"
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px",
              fontFamily: F, fontSize: 14, background: "#FFFDF7", color: C.text,
              border: `1px solid ${C.panelEdge}`, borderRadius: 10, outline: "none" }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <PhotoField
            name="photo"
            label="A photo of yourself"
            helper="required — this is your avatar in the game"
            required
            previewSize={120}
          />
        </div>

        {newestFavorite && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 8 }}>
              Why was this your favorite? What did you like about it?
            </label>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start",
              background: C.panel, border: `1px solid ${C.panelEdge}`,
              borderRadius: 14, padding: 12, marginBottom: 10 }}>
              {newestFavorite.publicUrl && (
                <img src={newestFavorite.publicUrl} alt=""
                  style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 10,
                    border: `2px solid ${C.light}`, flexShrink: 0 }} />
              )}
              {newestFavorite.description_text && (
                <p style={{ fontSize: 13, color: C.text, fontStyle: "italic",
                  lineHeight: 1.5, margin: 0, borderLeft: `2px solid ${C.light}`, paddingLeft: 10 }}>
                  &quot;{newestFavorite.description_text}&quot;
                </p>
              )}
            </div>
            <textarea
              name="favorite_comment"
              required
              minLength={15}
              rows={4}
              placeholder="Tell your teacher what drew you to this one (at least 15 characters)."
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px",
                fontFamily: F, fontSize: 14, lineHeight: 1.5,
                background: "#FFFDF7", color: C.text,
                border: `1px solid ${C.panelEdge}`, borderRadius: 12, outline: "none",
                resize: "vertical" }}
            />
          </div>
        )}

        {/* ── FIRST GAME ENTRY (required) — becomes their first entries row ── */}
        <div style={{ marginTop: 8, marginBottom: 16, paddingTop: 18,
          borderTop: `1px solid ${C.panelEdge}` }}>
          <PhotoField
            name="entry_photo"
            label="Add your first photo"
            helper="this is your own photo for the class to see and comment on"
            required
            previewSize={200}
          />
          <label style={{ fontSize: 13, fontWeight: 600, display: "block",
            marginTop: 12, marginBottom: 6 }}>
            Tell us about your photo
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
      </div>

      {/* ── Banners — live OUTSIDE the keyed wrapper so they persist across resets ── */}
      {state?.ok && (
        <div role="status" style={{
          background: C.successBg, border: `1px solid ${C.successEdge}`,
          color: C.successText, padding: "10px 14px", borderRadius: 10,
          fontSize: 13, lineHeight: 1.5, marginBottom: 12,
        }}>
          <strong>Submitted ✓</strong> Your teacher will review this.
        </div>
      )}
      {state && !state.ok && (
        <div role="alert" style={{
          background: C.errorBg, border: `1px solid ${C.errorEdge}`,
          color: C.errorText, padding: "10px 14px", borderRadius: 10,
          fontSize: 13, lineHeight: 1.5, marginBottom: 12,
        }}>
          {state.error}
        </div>
      )}

      <button
        type="submit"
        style={{ width: "100%", padding: "13px", fontFamily: F, fontSize: 15, fontWeight: 700,
          background: C.light, color: "#fff", border: "none", borderRadius: 12,
          cursor: "pointer", letterSpacing: 0.5, marginTop: 4 }}
      >
        Finish joining →
      </button>
    </form>
  );
}
