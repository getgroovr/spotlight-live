// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/request-class.tsx   (REPLACES)
//
// Session 81 rewrite + Session 82 Chunk C + Session 86 Chunk M1:
//   - Dual-mode component: Standard mode vs Multi mode.
//   - Standard mode: "Create class" form → calls createClassDirect
//     (inserts directly into classes table, no admin approval).
//     Mode preferences (trio/nine) are hidden — not relevant in standard.
//   - Multi mode: "Request class" form → calls requestNewClass
//     (existing request→admin approval flow). Mode prefs visible.
//   - isProminent prop: when true (zero-class teacher), form is expanded
//     by default with a welcome message.
//   - Chunk C: Class size dropdown (9 / 16 / 25).
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState, useTransition } from "react";
import { createClassDirect } from "./actions";
import { requestNewClass, saveModePreferences } from "./request-actions";

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

export function RequestClassSection({
  hasPending,
  willingTrio: initialTrio,
  willingNine: initialNine,
  isProminent = false,
  isStandardMode = false,
}: {
  hasPending: boolean;
  willingTrio: boolean;
  willingNine: boolean;
  isProminent?: boolean;
  isStandardMode?: boolean;
}) {
  const [expanded, setExpanded] = useState(isProminent);
  const [className, setClassName] = useState("");
  const [capacity, setCapacity] = useState(9);
  const [reqPending, startReqTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);
  const [requestSent, setRequestSent] = useState(false);

  // Mode preferences (local state + auto-save) — multi mode only
  const [trio, setTrio] = useState(initialTrio);
  const [nine, setNine] = useState(initialNine);
  const [, startPrefTransition] = useTransition();
  const [prefSaved, setPrefSaved] = useState(false);

  const handlePrefChange = (field: "trio" | "nine", checked: boolean) => {
    const newTrio = field === "trio" ? checked : trio;
    const newNine = field === "nine" ? checked : nine;
    if (field === "trio") setTrio(checked);
    if (field === "nine") setNine(checked);
    setPrefSaved(false);
    startPrefTransition(async () => {
      const res = await saveModePreferences(newTrio, newNine);
      if (res.ok) {
        setPrefSaved(true);
        setTimeout(() => setPrefSaved(false), 2000);
      }
    });
  };

  const handleSubmit = () => {
    const name = className.trim();
    if (!name) {
      setFeedback({ msg: "Enter a class name.", ok: false });
      return;
    }
    setFeedback(null);
    startReqTransition(async () => {
      let res: { ok: boolean; error?: string };
      if (isStandardMode) {
        // Standard mode: create class directly
        res = await createClassDirect(name, capacity);
      } else {
        // Multi mode: request class (admin approval)
        res = await requestNewClass(name, capacity);
      }
      if (!res.ok) {
        setFeedback({ msg: res.error || "Something went wrong.", ok: false });
      } else {
        setFeedback({
          msg: isStandardMode ? "Class created!" : "Request sent!",
          ok: true,
        });
        setRequestSent(true);
        setClassName("");
        setCapacity(9);
      }
    });
  };

  // In standard mode, after creating we don't show "pending" — the class
  // exists immediately. We show a success state instead.
  const showPending = isStandardMode
    ? false
    : hasPending || requestSent;
  const showSuccess = isStandardMode && requestSent;

  // Labels that change based on mode
  const actionLabel = isStandardMode ? "Create class" : "Request class";
  const buttonLabel = isStandardMode
    ? reqPending ? "Creating…" : "Create class"
    : reqPending ? "Sending…" : "Request class";
  const compactButtonLabel = isStandardMode
    ? reqPending ? "Creating…" : "Create"
    : reqPending ? "Sending…" : "Submit";

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
          {isStandardMode
            ? "Create your first class to get started."
            : "Request your first class to get started. An admin will review it shortly."}
        </p>

        {showPending ? (
          <div
            style={{
              background: C.light + "18",
              border: `1px solid ${C.light}44`,
              borderRadius: 10,
              padding: "12px 16px",
              fontSize: 14,
              color: C.light,
              fontWeight: 600,
            }}
          >
            ✓ Class request pending — an admin will review it shortly.
          </div>
        ) : showSuccess ? (
          <div
            style={{
              background: C.success + "18",
              border: `1px solid ${C.success}44`,
              borderRadius: 10,
              padding: "12px 16px",
              fontSize: 14,
              color: C.success,
              fontWeight: 600,
            }}
          >
            ✓ Class created! Refresh to see it.
          </div>
        ) : (
          <>
            {/* Class name */}
            <label style={{ display: "block", fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>
              Class name
            </label>
            <input
              type="text"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="e.g. Mr. Smith's Photography Class"
              maxLength={100}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#fff",
                border: `1px solid ${C.panelEdge}`,
                borderRadius: 8,
                padding: "9px 11px",
                fontSize: 14,
                color: C.text,
                fontFamily: "inherit",
                outline: "none",
                marginBottom: 14,
              }}
            />

            {/* Class size */}
            <label style={{ display: "block", fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>
              Class size
            </label>
            <select
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#fff",
                border: `1px solid ${C.panelEdge}`,
                borderRadius: 8,
                padding: "9px 11px",
                fontSize: 14,
                color: C.text,
                fontFamily: "inherit",
                outline: "none",
                marginBottom: 14,
                cursor: "pointer",
              }}
            >
              {CAPACITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </>
        )}

        {/* Mode preferences — multi mode only */}
        {!isStandardMode && (
          <div style={{ marginBottom: showPending ? 0 : 16 }}>
            <div style={{ fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 6 }}>
              Warmup modes you're willing to participate in
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, color: C.textFaint, display: "flex", alignItems: "center", gap: 4 }}>
                <input type="checkbox" checked disabled style={{ accentColor: C.light }} />
                Solo <span style={{ fontSize: 11, color: C.textFaint }}>(mandatory)</span>
              </label>
              <label style={{ fontSize: 13, color: C.text, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={trio}
                  onChange={(e) => handlePrefChange("trio", e.target.checked)}
                  style={{ accentColor: C.light }}
                />
                Trio (3 teachers)
              </label>
              <label style={{ fontSize: 13, color: C.text, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={nine}
                  onChange={(e) => handlePrefChange("nine", e.target.checked)}
                  style={{ accentColor: C.light }}
                />
                Full (9 teachers)
              </label>
              {prefSaved && (
                <span style={{ fontSize: 11, color: C.success }}>Saved</span>
              )}
            </div>
          </div>
        )}

        {!showPending && !showSuccess && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: isStandardMode ? 0 : undefined }}>
            <button
              onClick={handleSubmit}
              disabled={reqPending || !className.trim()}
              style={{
                background: C.light,
                color: "#fff",
                border: "none",
                borderRadius: 999,
                padding: "9px 22px",
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "inherit",
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
      ) : showSuccess ? (
        <span
          style={{
            fontSize: 12,
            color: C.success,
            background: C.success + "22",
            padding: "4px 12px",
            borderRadius: 20,
            fontWeight: 600,
          }}
        >
          Class created!
        </span>
      ) : !expanded ? (
        <button
          onClick={() => setExpanded(true)}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: C.light,
            background: C.light + "15",
            border: `1px solid ${C.light}44`,
            borderRadius: 8,
            padding: "6px 14px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {isStandardMode ? "Create new class" : "Request new class"}
        </button>
      ) : (
        <div
          style={{
            background: C.panel,
            border: `1px solid ${C.panelEdge}`,
            borderRadius: 12,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            minWidth: 280,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
              {actionLabel}
            </span>
            <button
              onClick={() => { setExpanded(false); setFeedback(null); }}
              style={{
                background: "none",
                border: "none",
                color: C.textFaint,
                fontSize: 16,
                cursor: "pointer",
                fontFamily: "inherit",
                padding: 0,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          <input
            type="text"
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="Class name"
            maxLength={100}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
            style={{
              background: "#fff",
              border: `1px solid ${C.panelEdge}`,
              borderRadius: 8,
              padding: "7px 10px",
              fontSize: 13,
              color: C.text,
              fontFamily: "inherit",
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />

          {/* Class size */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: C.textDim, fontWeight: 600, whiteSpace: "nowrap" }}>
              Size
            </span>
            <select
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              style={{
                background: "#fff",
                border: `1px solid ${C.panelEdge}`,
                borderRadius: 8,
                padding: "5px 8px",
                fontSize: 12,
                color: C.text,
                fontFamily: "inherit",
                outline: "none",
                cursor: "pointer",
              }}
            >
              {CAPACITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Mode prefs — multi mode only */}
          {!isStandardMode && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ fontSize: 12, color: C.textFaint, display: "flex", alignItems: "center", gap: 3 }}>
                <input type="checkbox" checked disabled style={{ accentColor: C.light }} />
                Solo
              </label>
              <label style={{ fontSize: 12, color: C.text, display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={trio}
                  onChange={(e) => handlePrefChange("trio", e.target.checked)}
                  style={{ accentColor: C.light }}
                />
                Trio
              </label>
              <label style={{ fontSize: 12, color: C.text, display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={nine}
                  onChange={(e) => handlePrefChange("nine", e.target.checked)}
                  style={{ accentColor: C.light }}
                />
                Full (9)
              </label>
              {prefSaved && (
                <span style={{ fontSize: 10, color: C.success }}>✓</span>
              )}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={handleSubmit}
              disabled={reqPending || !className.trim()}
              style={{
                background: C.light,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "inherit",
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
