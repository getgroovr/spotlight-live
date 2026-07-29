"use client";

// ─────────────────────────────────────────────────────────────────────────
// src/app/student/dashboard/PhotoUploadForm.tsx
//
// Session 108: Step 2 of the two-step finish-joining flow.
//
// After the student has saved their name + screen name (step 1), the
// dashboard transitions to this form. It collects:
//   - First game entry photo (required) — becomes entries row at round 1
//   - Description of the photo (required)
//   - "Why was this your favorite?" comment (required when a warmup
//     favorite exists) — saved on the game_session
//
// On submit, calls saveFirstEntry which:
//   - Uploads the photo to the media bucket
//   - Creates the entries row
//   - Sets profiles.class_id (fixing the no-class bug)
//   - Saves the favorite comment on the game_session
//
// After success, the dashboard re-renders as COMPLETE (the student now
// has an entry) and shows the full round stack.
//
// Uses useActionState (React 19) for error/success banners.
// PhotoField is a pre-existing client component reused here.
// ─────────────────────────────────────────────────────────────────────────

import { useActionState as useFormState } from "react";
import { useEffect, useState } from "react";
import { saveFirstEntry, type ActionResult } from "@/app/play/actions";
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
  screenName: string;
  newestFavorite: {
    publicUrl: string | null;
    description_text: string | null;
  } | null;
};

export default function PhotoUploadForm({ screenName, newestFavorite }: Props) {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    saveFirstEntry,
    null
  );

  // Reset form on success (same pattern as the old FinishJoiningForm).
  const [submitId, setSubmitId] = useState(0);
  useEffect(() => {
    if (state?.ok) setSubmitId((n) => n + 1);
  }, [state]);

  return (
    <form action={formAction}>
      <div key={submitId}>
        {/* ── Favorite comment section (when a warmup favorite exists) ── */}
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

        {/* ── First game entry (required) ── */}
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

      {/* ── Banners — outside keyed wrapper so they persist ── */}
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
