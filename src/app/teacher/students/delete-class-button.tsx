// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/delete-class-button.tsx   (NEW)
//
// Session 88: Delete button for archived classes with zero enrollments.
// Shows a confirmation dialog before deleting.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useTransition } from "react";
import { deleteArchivedClass } from "./actions";

const C = {
  textFaint: "#9A815E",
};

export function DeleteClassButton({ classId }: { classId: string }) {
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    if (!confirm("Permanently delete this empty class? This cannot be undone.")) return;
    startTransition(async () => {
      const result = await deleteArchivedClass(classId);
      if (!result.ok) {
        alert(result.error);
      }
    });
  };

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      style={{
        background: "none",
        border: "none",
        color: "#A23",
        fontSize: 11,
        fontWeight: 600,
        cursor: pending ? "default" : "pointer",
        opacity: pending ? 0.5 : 1,
        fontFamily: "inherit",
        padding: 0,
      }}
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
