"use client";

// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/class-header.tsx   (REPLACES previous)
//
// Session 78: Added per-round topic selector.
// Session 80: readOnly prop for multi-teacher mode.
// Session 81: currentRound prop — topic locking for past rounds.
// Session 84: Chunk D1 — Split round_duration_hours into game_phase_hours
//   + review_phase_hours.
// Session 86: Chunk M1 —
//   - isStandardMode prop. In standard mode:
//     - "Add a topic" replaces "Suggest a topic to the admin".
//     - Delete button (✕) next to each topic in the dropdown presets.
//     - readOnly is always false (teacher owns their own schedule).
//   - topicOptions now carry id + text for deletion support.
// Session 90: Chunk H —
//   - BUG FIX: Added hidden total_rounds input to the form. In readOnly
//     mode (multi-teacher), the visible total_rounds input didn't exist,
//     so the form submitted with total_rounds="" → NaN → validation error
//     "Rounds must be a whole number between 1 and 100." on every save.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import {
  saveClassSettings,
  deleteGameTopic,
  type SaveClassSettingsResult,
} from "./actions";

const C = {
  bg: "#FBF6EC",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
};

// D1: separate option lists for game time and review time
const GAME_TIME_OPTIONS: { value: string; label: string }[] = [
  { value: "0.25", label: "15 min" },
  { value: "0.5", label: "30 min" },
  { value: "1", label: "1 hour" },
  { value: "1.5", label: "90 min" },
  { value: "2", label: "2 hours" },
  { value: "5", label: "5 hours" },
  { value: "22", label: "22 hours" },
  { value: "24", label: "1 day" },
  { value: "46", label: "46 hours" },
  { value: "48", label: "2 days" },
  { value: "144", label: "6 days" },
  { value: "168", label: "1 week" },
];

const REVIEW_TIME_OPTIONS: { value: string; label: string }[] = [
  { value: "0", label: "None" },
  { value: "0.25", label: "15 min" },
  { value: "0.5", label: "30 min" },
  { value: "1", label: "1 hour" },
  { value: "2", label: "2 hours" },
  { value: "5", label: "5 hours" },
  { value: "24", label: "1 day" },
  { value: "48", label: "2 days" },
];

function durationLabel(hours: number | null): string {
  if (hours == null) return "";
  if (hours === 0) return "none";
  const labels: Record<string, string> = {
    "0.25": "15 min", "0.5": "30 min", "1": "1 hr", "1.5": "90 min",
    "2": "2 hr", "5": "5 hr", "22": "22 hr", "24": "1 day",
    "46": "46 hr", "48": "2 days", "144": "6 days", "168": "1 week",
  };
  return labels[String(hours)] || `${hours}h`;
}

// M1: topic options now carry id for deletion
export type TopicOption = { id: string; text: string };

type Props = {
  classes: { id: string; name: string }[];
  selectedClass: {
    id: string;
    name: string;
    total_rounds: number;
    game_phase_hours: number;       // D1
    review_phase_hours: number;     // D1
    game_starts_at: string | null;
    round_topics: Record<string, string | null> | null;
    teacher_prompt: string | null;  // session 89
  };
  statusLine: string;
  topicOptions: string[];           // kept for backward compat (multi mode)
  topicOptionsWithId?: TopicOption[]; // M1: standard mode topics with ids
  readOnly?: boolean;
  currentRound?: number; // session 81: rounds < this are locked
  currentPhase?: "game" | "review"; // D1: which phase the current round is in
  isStandardMode?: boolean; // M1
};

export function ClassHeader({
  classes,
  selectedClass,
  statusLine,
  topicOptions,
  topicOptionsWithId,
  readOnly = false,
  currentRound = 0,
  currentPhase,
  isStandardMode = false,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    SaveClassSettingsResult | null,
    FormData
  >(saveClassSettings, null);

  // In standard mode, teacher always has full edit access
  const effectiveReadOnly = isStandardMode ? false : readOnly;

  // datetime-local wants "YYYY-MM-DDTHH:MM" in the BROWSER's local TZ.
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

  // ── CONTROLLED total_rounds (session 78) ──────────────────────────────
  const [totalRounds, setTotalRounds] = useState(selectedClass.total_rounds);

  // ── D1: game/review phase durations ───────────────────────────────────
  const [gamePhaseHours, setGamePhaseHours] = useState(
    String(selectedClass.game_phase_hours),
  );
  const [reviewPhaseHours, setReviewPhaseHours] = useState(
    String(selectedClass.review_phase_hours),
  );

  // Computed total for hidden field + display
  const totalDurationHours = parseFloat(gamePhaseHours) + parseFloat(reviewPhaseHours);

  // ── Session 89: teacher guidance prompt state ──────────────────────────
  const [teacherPrompt, setTeacherPrompt] = useState(
    selectedClass.teacher_prompt || "",
  );

  // ── Per-round topics state ────────────────────────────────────────────
  const [roundTopics, setRoundTopics] = useState<Record<string, string>>(() => {
    const rt: Record<string, string> = {};
    for (let r = 1; r <= selectedClass.total_rounds; r++) {
      rt[String(r)] = selectedClass.round_topics?.[String(r)] || "";
    }
    return rt;
  });

  const handleRoundsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    const clamped = Number.isFinite(val) ? Math.max(1, Math.min(100, val)) : 1;
    setTotalRounds(clamped);
    setRoundTopics((prev) => {
      const next = { ...prev };
      for (let r = 1; r <= clamped; r++) {
        if (!(String(r) in next)) next[String(r)] = "";
      }
      return next;
    });
  };

  const handleTopicChange = (round: number, value: string) => {
    setRoundTopics((prev) => ({ ...prev, [String(round)]: value }));
  };

  // ── Add/suggest topic state ───────────────────────────────────────────
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestText, setSuggestText] = useState("");
  const [suggestPending, startSuggestTransition] = useTransition();
  const [suggestMsg, setSuggestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSuggest = () => {
    const text = suggestText.trim();
    if (!text) return;
    startSuggestTransition(async () => {
      const result = await (await import("./actions")).suggestTopic(text);
      if (result.ok) {
        setSuggestMsg({
          ok: true,
          text: isStandardMode ? "Topic added!" : "Sent to admin for approval!",
        });
        setSuggestText("");
        setTimeout(() => {
          setShowSuggest(false);
          setSuggestMsg(null);
        }, 2500);
      } else {
        setSuggestMsg({ ok: false, text: result.error });
      }
    });
  };

  // ── Session 88: collapsible topic section ──────────────────────────────
  const [topicsOpen, setTopicsOpen] = useState(false);

  // ── M1: Delete topic (standard mode) ──────────────────────────────────
  const [deletingTopicId, setDeletingTopicId] = useState<string | null>(null);
  const [, startDeleteTransition] = useTransition();

  const handleDeleteTopic = (topicId: string) => {
    setDeletingTopicId(topicId);
    startDeleteTransition(async () => {
      await deleteGameTopic(topicId);
      setDeletingTopicId(null);
    });
  };

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (id === selectedClass.id) return;
    router.push(`/teacher/students?class=${encodeURIComponent(id)}`);
  };

  // Build the round_topics JSON for the hidden form field.
  const roundTopicsJson = JSON.stringify(
    Object.fromEntries(
      Array.from({ length: totalRounds }, (_, i) => {
        const r = String(i + 1);
        const val = roundTopics[r]?.trim() || null;
        return [r, val];
      }),
    ),
  );

  const banner = (() => {
    if (!state) return null;
    if (!state.ok) return { kind: "error" as const, text: state.error };
    if ("warning" in state && state.warning) {
      return { kind: "warning" as const, text: state.warning };
    }
    return { kind: "success" as const, text: "Saved." };
  })();

  const hasAnyTopic = Object.values(roundTopics).some((v) => v && v.trim());

  // ── Add/suggest button label ──────────────────────────────────────────
  const addTopicLabel = isStandardMode
    ? "Add a topic →"
    : effectiveReadOnly
      ? "Suggest a topic to the admin →"
      : "Don\u0027t see the right topic? Suggest one →";

  const addTopicButtonLabel = isStandardMode
    ? suggestPending ? "Adding…" : "Add"
    : suggestPending ? "Sending…" : "Send";

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
        {/* Session 90: total_rounds must always be present — readOnly mode
            hides the visible input, but saveClassSettings still validates it */}
        <input type="hidden" name="total_rounds" value={String(totalRounds)} />
        <input type="hidden" name="round_topics" value={roundTopicsJson} />
        {/* Session 89: teacher guidance prompt */}
        <input type="hidden" name="teacher_prompt" value={teacherPrompt} />
        {/* D1: hidden computed round_duration_hours for backward compat */}
        <input type="hidden" name="round_duration_hours" value={String(totalDurationHours)} />
        {/* D1: individual phase values for saveClassSettings */}
        <input type="hidden" name="game_phase_hours" value={gamePhaseHours} />
        <input type="hidden" name="review_phase_hours" value={reviewPhaseHours} />

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
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {statusLine}
            {/* D1: phase badge */}
            {currentPhase && currentRound > 0 && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 12,
                  background: currentPhase === "game" ? "#2a7a4a22" : "#D98A2B22",
                  color: currentPhase === "game" ? "#2a7a4a" : "#B06B1A",
                  border: `1px solid ${currentPhase === "game" ? "#2a7a4a44" : "#D98A2B44"}`,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {currentPhase === "game" ? "Game phase" : "Review phase"}
              </span>
            )}
          </div>
        </div>

        {effectiveReadOnly ? (
          /* ── Read-only game settings (multi-teacher mode) ── */
          <>
            <div
              style={{
                background: C.bg,
                border: `1px solid ${C.panelEdge}55`,
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 12,
                color: C.textDim,
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: C.text }}>Game schedule is set by the admin.</strong>{" "}
              {selectedClass.total_rounds} rounds · {durationLabel(selectedClass.game_phase_hours)} game
              {selectedClass.review_phase_hours > 0 && (
                <> + {durationLabel(selectedClass.review_phase_hours)} review</>
              )}
              {selectedClass.game_starts_at && (
                <> · starts {new Date(selectedClass.game_starts_at).toLocaleString()}</>
              )}
            </div>

            {/* Show assigned topics as read-only pills */}
            {hasAnyTopic && (
              <div>
                <div style={{ fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 6 }}>
                  Round topics
                </div>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: totalRounds <= 3
                    ? `repeat(${totalRounds}, 1fr)`
                    : totalRounds <= 6 ? "repeat(3, 1fr)" : "repeat(4, 1fr)",
                  gap: 8,
                }}>
                  {Array.from({ length: totalRounds }, (_, i) => i + 1).map((r) => (
                    <div key={r}>
                      <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 2 }}>Round {r}</div>
                      <div style={{
                        background: "#fff",
                        border: `1px solid ${C.panelEdge}`,
                        borderRadius: 8,
                        padding: "7px 10px",
                        fontSize: 13,
                        color: roundTopics[String(r)] ? C.text : C.textFaint,
                        fontStyle: roundTopics[String(r)] ? "normal" : "italic",
                      }}>
                        {roundTopics[String(r)] || "No topic"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggest a topic — still available in readOnly mode */}
            <div>
              {!showSuggest ? (
                <button
                  type="button"
                  onClick={() => { setShowSuggest(true); setSuggestMsg(null); }}
                  style={{
                    background: "none", border: "none", color: C.light,
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    padding: "4px 0", fontFamily: "inherit",
                  }}
                >
                  Suggest a topic to the admin →
                </button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  <input
                    type="text"
                    value={suggestText}
                    onChange={(e) => setSuggestText(e.target.value)}
                    placeholder="Your topic idea…"
                    maxLength={80}
                    style={{ ...inputStyle(), flex: "1 1 180px", fontSize: 13 }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSuggest(); } }}
                  />
                  <button type="button" onClick={handleSuggest} disabled={suggestPending || !suggestText.trim()}
                    style={{ background: C.light, color: "#fff", border: "none", borderRadius: 8,
                      padding: "7px 14px", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                      cursor: suggestPending || !suggestText.trim() ? "default" : "pointer",
                      opacity: suggestPending || !suggestText.trim() ? 0.5 : 1 }}>
                    {suggestPending ? "Sending…" : "Send"}
                  </button>
                  <button type="button" onClick={() => { setShowSuggest(false); setSuggestMsg(null); }}
                    style={{ background: "none", border: "none", color: C.textFaint, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                    Cancel
                  </button>
                  {suggestMsg && (
                    <span style={{ fontSize: 12, color: suggestMsg.ok ? "#2a7a4a" : "#8A2A22", flex: "1 0 100%" }}>
                      {suggestMsg.text}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Save button — only saves class name in readOnly mode */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button type="submit" disabled={pending}
                style={{ background: C.light, color: "#fff", border: "none", borderRadius: 999,
                  padding: "8px 22px", fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                  cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}>
                {pending ? "Saving…" : "Save class name"}
              </button>
              {banner?.kind === "success" && (
                <span style={{ fontSize: 13, color: "#2a7a4a" }}>{banner.text}</span>
              )}
            </div>
          </>
        ) : (
          /* ── Standard editable game settings (solo-teacher mode) ── */
          <>
            {/* ── Row 3: four settings side-by-side (D1: game/review split) ── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "0.7fr 1fr 1fr 1.3fr",
                gap: 12,
              }}
            >
              <Field label="Rounds">
                <input
                  type="number"
                  name="total_rounds"
                  value={totalRounds}
                  onChange={handleRoundsChange}
                  required
                  min={1}
                  max={100}
                  step={1}
                  style={inputStyle()}
                />
              </Field>

              <Field label="Game time">
                <select
                  value={gamePhaseHours}
                  onChange={(e) => setGamePhaseHours(e.target.value)}
                  style={selectStyle()}
                >
                  {GAME_TIME_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Review time">
                <select
                  value={reviewPhaseHours}
                  onChange={(e) => setReviewPhaseHours(e.target.value)}
                  style={selectStyle()}
                >
                  {REVIEW_TIME_OPTIONS.map((opt) => (
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

            {/* D1: total duration hint */}
            <div style={{ fontSize: 11, color: C.textFaint, marginTop: -4 }}>
              Total round: {durationLabel(totalDurationHours) || `${totalDurationHours}h`}
            </div>

            {/* ── Row 3.4: Teacher guidance prompt (session 89) ───── */}
            <div>
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
                Prompt for students
                <span style={{ fontWeight: 400, color: C.textFaint, fontSize: 11 }}>
                  Shown in the comment box while students play — encouragement, guidance, or a fun challenge.
                </span>
                <textarea
                  value={teacherPrompt}
                  onChange={(e) => setTeacherPrompt(e.target.value)}
                  placeholder="e.g. Tell them what caught your eye first!"
                  rows={2}
                  maxLength={200}
                  style={{
                    ...inputStyle(),
                    resize: "vertical",
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                />
              </label>
              {teacherPrompt.trim() && (
                <div style={{ fontSize: 11, color: C.textFaint, marginTop: 2 }}>
                  {teacherPrompt.trim().length}/200
                </div>
              )}
            </div>

            {/* ── Row 3.5: Collapsible topic section (session 88) ──── */}
            <div>
              <button
                type="button"
                onClick={() => setTopicsOpen(!topicsOpen)}
                style={{
                  background: "none",
                  border: "none",
                  color: C.textDim,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: "4px 0",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 10, lineHeight: 1 }}>
                  {topicsOpen ? "▾" : "▸"}
                </span>
                Round topics{" "}
                <span style={{ fontWeight: 400, color: C.textFaint }}>
                  (optional)
                </span>
              </button>

              {topicsOpen && (
                <div style={{ marginTop: 8 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: totalRounds <= 3
                        ? `repeat(${totalRounds}, 1fr)`
                        : totalRounds <= 6
                          ? "repeat(3, 1fr)"
                          : "repeat(4, 1fr)",
                      gap: 8,
                    }}
                  >
                    {Array.from({ length: totalRounds }, (_, i) => i + 1).map((r) => {
                      const locked = r < currentRound;
                      return (
                        <Field key={r} label={`Round ${r}${locked ? " ✓" : ""}`}>
                          <select
                            value={roundTopics[String(r)] || ""}
                            onChange={(e) => handleTopicChange(r, e.target.value)}
                            disabled={locked}
                            style={{
                              ...selectStyle(),
                              ...(locked ? { opacity: 0.55, cursor: "not-allowed", background: "#EDE5D4" } : {}),
                            }}
                          >
                            <option value="">(No topic)</option>
                            {topicOptions.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </Field>
                      );
                    })}
                  </div>

                  {/* ── M1: Topic management (standard mode: add + delete) ── */}
                  {isStandardMode && topicOptionsWithId && topicOptionsWithId.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>
                        Your topics
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {topicOptionsWithId.map((t) => (
                          <span
                            key={t.id}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              background: C.bg,
                              border: `1px solid ${C.panelEdge}`,
                              borderRadius: 20,
                              padding: "3px 10px",
                              fontSize: 12,
                              color: C.text,
                              opacity: deletingTopicId === t.id ? 0.4 : 1,
                            }}
                          >
                            {t.text}
                            <button
                              type="button"
                              onClick={() => handleDeleteTopic(t.id)}
                              disabled={deletingTopicId === t.id}
                              style={{
                                background: "none",
                                border: "none",
                                color: C.textFaint,
                                fontSize: 13,
                                cursor: "pointer",
                                padding: "0 0 0 2px",
                                lineHeight: 1,
                                fontFamily: "inherit",
                              }}
                              title="Delete topic"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Add / suggest a topic ─────────────────────────────── */}
                  {!showSuggest ? (
                    <button
                      type="button"
                      onClick={() => { setShowSuggest(true); setSuggestMsg(null); }}
                      style={{
                        background: "none",
                        border: "none",
                        color: C.light,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: "4px 0",
                        marginTop: 4,
                        fontFamily: "inherit",
                      }}
                    >
                      {addTopicLabel}
                    </button>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      <input
                        type="text"
                        value={suggestText}
                        onChange={(e) => setSuggestText(e.target.value)}
                        placeholder={isStandardMode ? "New topic…" : "Your topic idea…"}
                        maxLength={80}
                        style={{ ...inputStyle(), flex: "1 1 180px", fontSize: 13 }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSuggest();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleSuggest}
                        disabled={suggestPending || !suggestText.trim()}
                        style={{
                          background: C.light,
                          color: "#fff",
                          border: "none",
                          borderRadius: 8,
                          padding: "7px 14px",
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: "inherit",
                          cursor:
                            suggestPending || !suggestText.trim()
                              ? "default"
                              : "pointer",
                          opacity: suggestPending || !suggestText.trim() ? 0.5 : 1,
                        }}
                      >
                        {addTopicButtonLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowSuggest(false); setSuggestMsg(null); }}
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
                      {suggestMsg && (
                        <span
                          style={{
                            fontSize: 12,
                            color: suggestMsg.ok ? "#2a7a4a" : "#8A2A22",
                            flex: "1 0 100%",
                          }}
                        >
                          {suggestMsg.text}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
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
          </>
        )}

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
