"use client";

// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/class-header.tsx   (REPLACES previous)
//
// Slice 1 teacher UI, step 4 (client half).
//
// Changes from the previous pass:
//   - Restored a small "Class name" label above the name input. Without it
//     the field reads as a static title rather than an editable input —
//     even though the white-on-beige border was correct, the affordance
//     wasn't obvious. Label fixes that.
//   - Added "2 days" (48h) and "1 week" (168h) to the duration dropdown.
//     CHECK constraint and saveClassSettings allowed-set must move with
//     this — see the SQL migration alongside this file's handoff.
//
// LAYOUT (unchanged shape):
//   Row 1: Class: [switcher ▼]                              N classes
//   Row 2: Class name                              [Status pill]
//          [Name input (wide)]
//   Row 3: [Rounds]   [Duration ▼]   [Starts at]
//   Row 4: [Save]    (Saved. inline on success)
//   Row 5: [Warning band, if applicable]  /  [Error band, if applicable]
//
// Remount-on-switch: parent uses key={selectedClass.id}, so switching
// discards any in-progress edits and resets uncontrolled defaultValues.
//
// Datetime conversion (ISO → local "YYYY-MM-DDTHH:MM") happens in
// useEffect on the client — server-side would hydrate-mismatch.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import {
  saveClassSettings,
  type SaveClassSettingsResult,
} from "./actions";

// Same palette as the parent server component. Duplicated rather than
// imported — 7-line constant.
const C = {
  bg: "#FBF6EC",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
};

// round_duration_hours options. Values MUST match the DB CHECK constraint
// AND the ALLOWED_DURATION_HOURS list in actions.ts. If one moves, all
// three move together.
const DURATION_OPTIONS: { value: string; label: string }[] = [
  { value: "0.25", label: "15 min" },
  { value: "0.5", label: "30 min" },
  { value: "1", label: "1 hour" },
  { value: "2", label: "2 hours" },
  { value: "5", label: "5 hours" },
  { value: "24", label: "1 day" },
  { value: "48", label: "2 days" },
  { value: "168", label: "1 week" },
];

type Props = {
  classes: { id: string; name: string }[];
  selectedClass: {
    id: string;
    name: string;
    total_rounds: number;
    round_duration_hours: number;
    game_starts_at: string | null; // ISO
  };
  statusLine: string;
};

export function ClassHeader({ classes, selectedClass, statusLine }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    SaveClassSettingsResult | null,
    FormData
  >(saveClassSettings, null);

  // datetime-local wants "YYYY-MM-DDTHH:MM" in the BROWSER's local TZ.
  // Compute on client after mount; before then the input renders empty
  // (very brief flash, only visible for the future-start case).
  const [startLocal, setStartLocal] = useState("");
  useEffect(() => {
    if (!selectedClass.game_starts_at) {
      setStartLocal("");
      return;
    }
    const d = new Date(selectedClass.game_starts_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    setStartLocal(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
        d.getHours(),
      )}:${pad(d.getMinutes())}`,
    );
  }, [selectedClass.game_starts_at]);

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (id === selectedClass.id) return;
    router.push(`/teacher/students?class=${encodeURIComponent(id)}`);
  };

  // PostgREST may return numeric(6,4) as "24.0000" OR as 24; Number()
  // collapses both, String(Number(...)) gives the canonical "24" /
  // "0.25" / "168" form the <select> options use.
  const durationSelectValue = String(Number(selectedClass.round_duration_hours));

  const banner = (() => {
    if (!state) return null;
    if (!state.ok) return { kind: "error" as const, text: state.error };
    if ("warning" in state && state.warning) {
      return { kind: "warning" as const, text: state.warning };
    }
    return { kind: "success" as const, text: "Saved." };
  })();

  return (
    <section
      style={{
        background: C.panel,
        border: `1px solid ${C.panelEdge}`,
        borderRadius: 16,
        padding: "16px 18px",
        marginTop: 14,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* ── Row 1: class switcher ────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <label
          htmlFor="class-switcher"
          style={{ fontSize: 13, color: C.textDim, fontWeight: 600 }}
        >
          Current class:
        </label>
        <select
          id="class-switcher"
          value={selectedClass.id}
          onChange={handleClassChange}
          style={{ ...selectStyle(), flex: "1 1 240px", maxWidth: 380 }}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span
          style={{
            fontSize: 12,
            color: C.textFaint,
            marginLeft: "auto",
          }}
        >
          {classes.length} {classes.length === 1 ? "class" : "classes"}
        </span>
        <a
          href={`/teacher/students/export?class=${encodeURIComponent(selectedClass.id)}`}
          style={{
            fontSize: 12,
            color: C.light,
            fontWeight: 600,
            textDecoration: "none",
            textAlign: "right",
            lineHeight: 1.3,
          }}
        >
          Download class<br />spreadsheet
        </a>
      </div>

      <form
        action={formAction}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <input type="hidden" name="class_id" value={selectedClass.id} />

        {/* ── Row 2: name (with label) + status pill ─────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <label
            style={{
              flex: "1 1 280px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              fontSize: 12,
              color: C.textDim,
              fontWeight: 600,
              minWidth: 0,
            }}
          >
            Class name
            <input
              type="text"
              name="name"
              defaultValue={selectedClass.name}
              required
              minLength={1}
              maxLength={100}
              style={{
                ...inputStyle(),
                fontSize: 15,
                fontWeight: 600,
              }}
            />
          </label>
          <div
            style={{
              flex: "0 1 auto",
              fontSize: 13,
              color: C.textDim,
              padding: "8px 12px",
              background: C.bg,
              borderRadius: 8,
              border: `1px solid ${C.panelEdge}55`,
              whiteSpace: "nowrap",
            }}
          >
            {statusLine}
          </div>
        </div>

        {/* ── Row 3: three settings side-by-side ─────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
          }}
        >
          <Field label="Rounds">
            <input
              type="number"
              name="total_rounds"
              defaultValue={selectedClass.total_rounds}
              required
              min={1}
              max={100}
              step={1}
              style={inputStyle()}
            />
          </Field>

          <Field label="Duration of each round">
            <select
              name="round_duration_hours"
              defaultValue={durationSelectValue}
              style={selectStyle()}
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Starts at">
            <input
              type="datetime-local"
              name="game_starts_at"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              style={inputStyle()}
            />
          </Field>
        </div>

        {/* ── Row 4: save + inline success ──────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <button
            type="submit"
            disabled={pending}
            style={{
              background: C.light,
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "8px 22px",
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "inherit",
              cursor: pending ? "default" : "pointer",
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? "Saving…" : "Save"}
          </button>

          {banner?.kind === "success" && (
            <span style={{ fontSize: 13, color: "#2a7a4a" }}>{banner.text}</span>
          )}
        </div>

        {/* ── Row 5: warning / error bands ──────────────────────── */}
        {banner?.kind === "warning" && (
          <div
            style={{
              background: "#F8D87A55",
              border: "1px solid #C9A248",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 13,
              color: "#6B4A12",
              lineHeight: 1.45,
            }}
          >
            <strong style={{ fontWeight: 700 }}>Heads up: </strong>
            {banner.text}
          </div>
        )}

        {banner?.kind === "error" && (
          <div
            style={{
              background: "#E2554A22",
              border: "1px solid #C04A3F",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 13,
              color: "#8A2A22",
              lineHeight: 1.45,
            }}
          >
            {banner.text}
          </div>
        )}
      </form>
    </section>
  );
}

// ── tiny helpers ──────────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontSize: 12,
        color: C.textDim,
        fontWeight: 600,
        minWidth: 0,
      }}
    >
      {label}
      {children}
    </label>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: "#fff",
    border: `1px solid ${C.panelEdge}`,
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14,
    color: C.text,
    fontFamily: "inherit",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };
}

function selectStyle(): React.CSSProperties {
  return {
    ...inputStyle(),
    cursor: "pointer",
    paddingRight: 28,
  };
}
