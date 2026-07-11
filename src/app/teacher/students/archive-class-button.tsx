"use client";

// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/archive-class-button.tsx   (NEW)
//
// Session 79: Simple archive/unarchive toggle button for classes.
// Called from the teacher students page (server component).
// ─────────────────────────────────────────────────────────────────────────

import { useTransition, useState } from "react";
import { archiveClass, unarchiveClass } from "./actions";

const C = {
  textFaint: "#9A815E",
  danger: "#C04030",
};

export function ArchiveClassButton({
  classId,
  action,
}: {
  classId: string;
  action: "archive" | "unarchive";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function handleClick() {
    if (action === "archive" && !confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = action === "archive"
        ? await archiveClass(classId)
        : await unarchiveClass(classId);
      if (!res.ok) setError(res.error);
      setConfirming(false);
    });
  }

  if (confirming) {
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: C.danger }}>Archive this class?</span>
        <button
          onClick={handleClick}
          disabled={pending}
          style={{
            fontSize: 11, fontWeight: 600, color: C.danger,
            background: "transparent", border: `1px solid ${C.danger}`,
            borderRadius: 6, padding: "2px 8px", cursor: "pointer",
            opacity: pending ? 0.5 : 1,
          }}
        >
          {pending ? "…" : "Yes"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          style={{
            fontSize: 11, color: C.textFaint,
            background: "transparent", border: "none",
            cursor: "pointer", textDecoration: "underline",
          }}
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={pending}
        style={{
          fontSize: 11, fontWeight: 600,
          color: action === "archive" ? C.textFaint : "#5A8A3C",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textDecoration: "underline",
          opacity: pending ? 0.5 : 1,
        }}
      >
        {pending
          ? "…"
          : action === "archive"
            ? "Archive this class"
            : "Unarchive"}
      </button>
      {error && (
        <span style={{ fontSize: 10, color: C.danger, marginLeft: 6 }}>{error}</span>
      )}
    </>
  );
}
