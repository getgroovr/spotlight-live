// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/request-class.tsx   (REPLACES)
//
// Session 94: Added level picker dropdown (beginner/intermediate/advanced).
//   - Both prominent (zero-class) and compact forms include level.
//   - Level passed to createClassDirect.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState, useTransition } from "react";
import { createClassDirect } from "./actions";

const C = {
  bg: "#FBF6EC",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
  success: "#2B8A3E",
  error: "#C53030",
};

const CAPACITY_OPTIONS = [
  { value: 9, label: "9 students" },
  { value: 16, label: "16 students" },
  { value: 25, label: "25 students" },
];

const LEVEL_OPTIONS = [
  { value: "beginner", label: "Beginning" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

export function RequestClassSection({
  hasPending,
  isProminent = false,
}: {
  hasPending: boolean;
  isProminent?: boolean;
}) {
  const [expanded, setExpanded] = useState(isProminent);
  const [className, setClassName] = useState("");
  const [capacity, setCapacity] = useState(9);
  const [level, setLevel] = useState("beginner");
  const [reqPending, startReqTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);
  const [requestSent, setRequestSent] = useState(false);

  const handleSubmit = () => {
    const name = className.trim();
    if (!name) {
      setFeedback({ msg: "Enter a class name.", ok: false });
      return;
    }
    setFeedback(null);
    startReqTransition(async () => {
      const res = await createClassDirect(name, capacity, level);
      if (!res.ok) {
        setFeedback({ msg: res.error || "Something went wrong.", ok: false });
      } else {
        setFeedback({ msg: "Class created!", ok: true });
        setRequestSent(true);
        setClassName("");
        setCapacity(9);
        setLevel("beginner");
      }
    });
  };

  const showPending = false; // No admin approval needed
  const showSuccess = requestSent;
  const buttonLabel = reqPending ? "Creating…" : "Create class";
  const compactButtonLabel = reqPending ? "Creating…" : "Create";

  // ── Prominent layout (zero-class teacher) ──────────────────────────
  if (isProminent) {
    return (
      <section
        style={{
          background: C.panel,
          border: `1px solid ${C.panelEdge}`,
          borderRadius: 16,
          padding: "24px 22px",
          marginTop: 14,
          maxWidth: 520,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px", color: C.text }}>
          Welcome!
        </h2>
        <p style={{ fontSize: 14, color: C.textDim, margin: "0 0 18px", lineHeight: 1.5 }}>
          Create your first class to get started.
        </p>

        {showPending ? (
          <div style={{
            background: C.light + "18", border: `1px solid ${C.light}44`,
            borderRadius: 10, padding: "12px 16px", fontSize: 14,
            color: C.light, fontWeight: 600,
          }}>
            ✓ Class request pending — an admin will review it shortly.
          </div>
        ) : showSuccess ? (
          <div style={{
            background: C.success + "18", border: `1px solid ${C.success}44`,
            borderRadius: 10, padding: "12px 16px", fontSize: 14,
            color: C.success, fontWeight: 600,
          }}>
            ✓ Class created! Refresh to see it.
          </div>
        ) : (
          <>
            {/* Class name */}
            <label style={{ display: "block", fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>
              Class name
            </label>
            <input
              type="text" value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="e.g. Mr. Smith's Photography Class"
              maxLength={100}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
              style={{
                width: "100%", boxSizing: "border-box", background: "#fff",
                border: `1px solid ${C.panelEdge}`, borderRadius: 8,
                padding: "9px 11px", fontSize: 14, color: C.text,
                fontFamily: "inherit", outline: "none", marginBottom: 14,
              }}
            />

            {/* Level + Class size side by side */}
            <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>
                  Level
                </label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  style={{
                    width: "100%", boxSizing: "border-box", background: "#fff",
                    border: `1px solid ${C.panelEdge}`, borderRadius: 8,
                    padding: "9px 11px", fontSize: 14, color: C.text,
                    fontFamily: "inherit", outline: "none", cursor: "pointer",
                  }}
                >
                  {LEVEL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>
                  Class size
                </label>
                <select
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  style={{
                    width: "100%", boxSizing: "border-box", background: "#fff",
                    border: `1px solid ${C.panelEdge}`, borderRadius: 8,
                    padding: "9px 11px", fontSize: 14, color: C.text,
                    fontFamily: "inherit", outline: "none", cursor: "pointer",
                  }}
                >
                  {CAPACITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}

        {!showPending && !showSuccess && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={handleSubmit}
              disabled={reqPending || !className.trim()}
              style={{
                background: C.light, color: "#fff", border: "none",
                borderRadius: 999, padding: "9px 22px", fontSize: 14,
                fontWeight: 700, fontFamily: "inherit",
                cursor: reqPending || !className.trim() ? "default" : "pointer",
                opacity: reqPending || !className.trim() ? 0.5 : 1,
              }}
            >
              {buttonLabel}
            </button>
            {feedback && (
              <span style={{ fontSize: 12, color: feedback.ok ? C.success : C.error }}>
                {feedback.msg}
              </span>
            )}
          </div>
        )}
      </section>
    );
  }

  // ── Compact layout (teacher already has classes) ────────────────────
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
      {showPending ? (
        <span style={{
          fontSize: 12, color: C.light, background: C.light + "22",
          padding: "4px 12px", borderRadius: 20, fontWeight: 600,
        }}>
          Class request pending
        </span>
      ) : showSuccess ? (
        <span style={{
          fontSize: 12, color: C.success, background: C.success + "22",
          padding: "4px 12px", borderRadius: 20, fontWeight: 600,
        }}>
          Class created!
        </span>
      ) : !expanded ? (
        <button
          onClick={() => setExpanded(true)}
          style={{
            fontSize: 13, fontWeight: 600, color: C.light,
            background: C.light + "15", border: `1px solid ${C.light}44`,
            borderRadius: 8, padding: "6px 14px",
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Create new class
        </button>
      ) : (
        <div style={{
          background: C.panel, border: `1px solid ${C.panelEdge}`,
          borderRadius: 12, padding: "12px 14px",
          display: "flex", flexDirection: "column", gap: 8, minWidth: 280,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Create class</span>
            <button
              onClick={() => { setExpanded(false); setFeedback(null); }}
              style={{
                background: "none", border: "none", color: C.textFaint,
                fontSize: 16, cursor: "pointer", fontFamily: "inherit",
                padding: 0, lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          <input
            type="text" value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="Class name"
            maxLength={100}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
            style={{
              background: "#fff", border: `1px solid ${C.panelEdge}`,
              borderRadius: 8, padding: "7px 10px", fontSize: 13,
              color: C.text, fontFamily: "inherit", outline: "none",
              width: "100%", boxSizing: "border-box",
            }}
          />

          {/* Level + Size */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: C.textDim, fontWeight: 600, whiteSpace: "nowrap" }}>Level</span>
            <select
              value={level} onChange={(e) => setLevel(e.target.value)}
              style={{
                background: "#fff", border: `1px solid ${C.panelEdge}`,
                borderRadius: 8, padding: "5px 8px", fontSize: 12,
                color: C.text, fontFamily: "inherit", outline: "none", cursor: "pointer",
              }}
            >
              {LEVEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <span style={{ fontSize: 12, color: C.textDim, fontWeight: 600, whiteSpace: "nowrap", marginLeft: 4 }}>Size</span>
            <select
              value={capacity} onChange={(e) => setCapacity(Number(e.target.value))}
              style={{
                background: "#fff", border: `1px solid ${C.panelEdge}`,
                borderRadius: 8, padding: "5px 8px", fontSize: 12,
                color: C.text, fontFamily: "inherit", outline: "none", cursor: "pointer",
              }}
            >
              {CAPACITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={handleSubmit}
              disabled={reqPending || !className.trim()}
              style={{
                background: C.light, color: "#fff", border: "none",
                borderRadius: 8, padding: "6px 14px", fontSize: 12,
                fontWeight: 700, fontFamily: "inherit",
                cursor: reqPending || !className.trim() ? "default" : "pointer",
                opacity: reqPending || !className.trim() ? 0.5 : 1,
              }}
            >
              {compactButtonLabel}
            </button>
            {feedback && (
              <span style={{ fontSize: 11, color: feedback.ok ? C.success : C.error }}>
                {feedback.msg}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
