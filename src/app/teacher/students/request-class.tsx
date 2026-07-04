// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/request-class.tsx   (NEW FILE)
//
// Client component: "Request new class" button shown on the teacher's
// class page. Shows different states:
//   - Button: teacher can request
//   - "Request pending" pill: already submitted, waiting on admin
//   - Hidden: teacher is at their max_classes limit with no room
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState, useTransition } from "react";
import { requestNewClass } from "./request-actions";

const C = {
  light: "#D98A2B",
  text: "#3A2A18",
  success: "#2B8A3E",
  error: "#C53030",
};

export function RequestClassButton({
  hasPending,
  atLimit,
}: {
  hasPending: boolean;
  atLimit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    msg: string;
    ok: boolean;
  } | null>(null);

  // Already has a pending request — show status pill
  if (hasPending) {
    return (
      <span
        style={{
          fontSize: 12,
          color: C.light,
          background: C.light + "22",
          padding: "4px 12px",
          borderRadius: 20,
          fontWeight: 600,
        }}
      >
        Class request pending
      </span>
    );
  }

  // At class limit — hide button entirely
  if (atLimit) return null;

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        disabled={pending}
        onClick={() => {
          setFeedback(null);
          startTransition(async () => {
            const res = await requestNewClass();
            if (!res.ok) {
              setFeedback({ msg: res.error, ok: false });
            } else {
              setFeedback({ msg: "Request sent!", ok: true });
            }
          });
        }}
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: C.light,
          background: C.light + "15",
          border: `1px solid ${C.light}44`,
          borderRadius: 8,
          padding: "6px 14px",
          cursor: pending ? "not-allowed" : "pointer",
          opacity: pending ? 0.5 : 1,
          transition: "opacity 0.15s",
        }}
      >
        {pending ? "Requesting…" : "Request new class"}
      </button>
      {feedback && (
        <span
          style={{
            fontSize: 12,
            color: feedback.ok ? C.success : C.error,
            fontWeight: 500,
          }}
        >
          {feedback.msg}
        </span>
      )}
    </div>
  );
}
