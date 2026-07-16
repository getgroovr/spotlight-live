// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/switch-mode-footer.tsx
//
// Session 89: Small footer link that lets an admin switch from standard
// mode back to multi mode without hitting the SQL editor.
// Only rendered when isStandardMode && isAdmin on the teacher page.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchToMultiMode } from "./actions";

const C = {
  textFaint: "#9A815E",
  light: "#D98A2B",
  panelEdge: "#C9A877",
};

export function SwitchToMultiFooter() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSwitch = () => {
    setError(null);
    startTransition(async () => {
      const res = await switchToMultiMode();
      if (res.ok) {
        router.push("/admin");
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div
      style={{
        marginTop: 40,
        paddingTop: 16,
        borderTop: `1px solid ${C.panelEdge}44`,
        textAlign: "center",
      }}
    >
      {!confirm ? (
        <button
          onClick={() => setConfirm(true)}
          style={{
            background: "none",
            border: "none",
            color: C.textFaint,
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "inherit",
            textDecoration: "underline",
            opacity: 0.7,
          }}
        >
          Switch to multi mode →
        </button>
      ) : (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            fontSize: 12,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <span style={{ color: C.textFaint }}>
            This will enable the admin dashboard and multi-teacher features.
          </span>
          <button
            onClick={handleSwitch}
            disabled={pending}
            style={{
              background: C.light,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "inherit",
              cursor: pending ? "default" : "pointer",
              opacity: pending ? 0.5 : 1,
            }}
          >
            {pending ? "Switching…" : "Switch"}
          </button>
          <button
            onClick={() => {
              setConfirm(false);
              setError(null);
            }}
            style={{
              background: "none",
              border: "none",
              color: C.textFaint,
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          {error && (
            <span style={{ color: "#C0392B", fontSize: 12, flex: "1 0 100%" }}>
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
