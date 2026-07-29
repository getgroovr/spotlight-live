"use client";

// ─────────────────────────────────────────────────────────────────────────
// src/app/student/dashboard/ProfileForm.tsx
//
// Session 108: Step 1 of the two-step finish-joining flow.
//
// Lightweight form — just full name + screen name. On submit, calls
// saveProfileInfo which saves to students.name + students.screen_name.
// No photo upload, no entry creation, no enrollment mutation.
//
// After success, the server re-renders the dashboard page. Since the
// student now has a name + screen_name but no entry yet, the dashboard
// shows PhotoUploadForm (step 2) instead of this form.
//
// Uses useActionState (React 19) for error/success banners.
// ─────────────────────────────────────────────────────────────────────────

import { useActionState as useFormState } from "react";
import { saveProfileInfo, type ActionResult } from "@/app/play/actions";

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
};

export default function ProfileForm({ studentName, studentScreenName }: Props) {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    saveProfileInfo,
    null
  );

  return (
    <form action={formAction}>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
          Your full name <span style={{ color: C.textFaint, fontWeight: 400 }}>— only your teacher sees this</span>
        </label>
        <input
          name="name"
          type="text"
          required
          defaultValue={studentName || ""}
          placeholder="First and last name"
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px",
            fontFamily: F, fontSize: 14, background: "#FFFDF7", color: C.text,
            border: `1px solid ${C.panelEdge}`, borderRadius: 10, outline: "none" }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
          Screen name <span style={{ color: C.textFaint, fontWeight: 400 }}>— what your classmates see</span>
        </label>
        <input
          name="screen_name"
          type="text"
          required
          defaultValue={studentScreenName || ""}
          placeholder="Your first name or a nickname"
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px",
            fontFamily: F, fontSize: 14, background: "#FFFDF7", color: C.text,
            border: `1px solid ${C.panelEdge}`, borderRadius: 10, outline: "none" }}
        />
      </div>

      {/* ── Banners ── */}
      {state?.ok && (
        <div role="status" style={{
          background: C.successBg, border: `1px solid ${C.successEdge}`,
          color: C.successText, padding: "10px 14px", borderRadius: 10,
          fontSize: 13, lineHeight: 1.5, marginBottom: 12,
        }}>
          <strong>Saved ✓</strong> Loading next step…
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
        Next →
      </button>
    </form>
  );
}
