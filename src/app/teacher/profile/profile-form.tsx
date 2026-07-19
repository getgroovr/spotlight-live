// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/profile/profile-form.tsx   (NEW FILE)
//
// Session 95 — Client component: teacher profile edit form.
//
// Uses useActionState to call saveTeacherProfile server action.
// Fields: bio (textarea), teaching_style (text), is_public (checkbox).
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useActionState } from "react";
import { saveTeacherProfile } from "./actions";

interface Props {
  initialBio: string;
  initialTeachingStyle: string;
  initialIsPublic: boolean;
}

export default function ProfileForm({
  initialBio,
  initialTeachingStyle,
  initialIsPublic,
}: Props) {
  const [state, formAction, isPending] = useActionState(
    saveTeacherProfile,
    null,
  );

  return (
    <form action={formAction} style={styles.form}>
      {/* ── Teaching style ───────────────────────────── */}
      <label style={styles.label}>
        Teaching style
        <span style={styles.hint}>
          A short tagline — e.g. "Conversational English through photography"
        </span>
        <input
          name="teaching_style"
          defaultValue={initialTeachingStyle}
          maxLength={500}
          placeholder="What's your teaching approach?"
          style={styles.input}
        />
      </label>

      {/* ── Bio ──────────────────────────────────────── */}
      <label style={styles.label}>
        About you
        <span style={styles.hint}>
          Tell students about your background and what they can expect
        </span>
        <textarea
          name="bio"
          defaultValue={initialBio}
          maxLength={2000}
          rows={6}
          placeholder="A few sentences about your teaching experience, interests, and what makes your class special..."
          style={styles.textarea}
        />
      </label>

      {/* ── Public toggle ────────────────────────────── */}
      <label style={styles.checkboxLabel}>
        <input
          type="checkbox"
          name="is_public"
          defaultChecked={initialIsPublic}
          style={styles.checkbox}
        />
        <span>
          Show my profile on the browse page
          <span style={styles.hint}> — students can find you and try a warmup</span>
        </span>
      </label>

      {/* ── Status messages ──────────────────────────── */}
      {state && "ok" in state && state.ok && (
        <div style={styles.success}>Profile saved!</div>
      )}
      {state && "error" in state && (
        <div style={styles.error}>{state.error}</div>
      )}

      {/* ── Submit ────────────────────────────────────── */}
      <button type="submit" disabled={isPending} style={styles.button}>
        {isPending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "#3D2E1E",
  },
  hint: {
    fontSize: "0.82rem",
    fontWeight: 400,
    color: "#8A7B6B",
  },
  input: {
    padding: "0.6rem 0.75rem",
    border: "1px solid #D4C9A8",
    borderRadius: "6px",
    fontSize: "0.95rem",
    backgroundColor: "#FFFDF5",
    color: "#3D2E1E",
    fontFamily: "inherit",
  },
  textarea: {
    padding: "0.6rem 0.75rem",
    border: "1px solid #D4C9A8",
    borderRadius: "6px",
    fontSize: "0.95rem",
    backgroundColor: "#FFFDF5",
    color: "#3D2E1E",
    fontFamily: "inherit",
    resize: "vertical" as const,
    minHeight: "120px",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.6rem",
    fontSize: "0.95rem",
    color: "#3D2E1E",
    cursor: "pointer",
    padding: "0.75rem",
    backgroundColor: "#FFFDF5",
    border: "1px solid #E0D5BA",
    borderRadius: "8px",
  },
  checkbox: {
    marginTop: "0.2rem",
    width: "18px",
    height: "18px",
    accentColor: "#D4A853",
    flexShrink: 0,
  },
  button: {
    padding: "0.7rem 1.5rem",
    backgroundColor: "#D4A853",
    color: "#3D2E1E",
    border: "none",
    borderRadius: "6px",
    fontWeight: 600,
    fontSize: "0.95rem",
    cursor: "pointer",
    alignSelf: "flex-start",
  },
  success: {
    padding: "0.6rem 1rem",
    backgroundColor: "#E8F5E9",
    color: "#2E7D32",
    borderRadius: "6px",
    fontSize: "0.9rem",
  },
  error: {
    padding: "0.6rem 1rem",
    backgroundColor: "#FFEBEE",
    color: "#C62828",
    borderRadius: "6px",
    fontSize: "0.9rem",
  },
};
