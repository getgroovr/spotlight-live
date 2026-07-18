// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/class-header.tsx   (REPLACES)
//
// Session 94:
//   - Round titles section more prominent (bigger toggle button)
//   - Round 0 (warmup) included in titles and prompts
//   - Per-round prompts section under a toggle (replaces single prompt)
//   - round_prompts JSONB parallel to round_topics
//   - Warmup title is free-text; game round titles use topic dropdown
// ─────────────────────────────────────────────────────────────────────────
"use client";

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
  success: "#2B8A3E",
};

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

export type TopicOption = { id: string; text: string };

type Props = {
  classes: { id: string; name: string }[];
  selectedClass: {
    id: string;
    name: string;
    total_rounds: number;
    game_phase_hours: number;
    review_phase_hours: number;
    game_starts_at: string | null;
    round_topics: Record<string, string | null> | null;
    teacher_prompt: string | null;
    round_prompts?: Record<string, string | null> | null; // Session 94
  };
  statusLine: string;
  topicOptionsWithId: TopicOption[];
  currentRound?: number;
  currentPhase?: "game" | "review";
};

export function ClassHeader({
  classes,
  selectedClass,
  statusLine,
  topicOptionsWithId,
  currentRound = 0,
  currentPhase,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    SaveClassSettingsResult | null,
    FormData
  >(saveClassSettings, null);

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

  // ── CONTROLLED total_rounds ───────────────────────────────────────────
  const [totalRounds, setTotalRounds] = useState(selectedClass.total_rounds);

  // ── Game/review phase durations ───────────────────────────────────────
  const [gamePhaseHours, setGamePhaseHours] = useState(
    String(selectedClass.game_phase_hours),
  );
  const [reviewPhaseHours, setReviewPhaseHours] = useState(
    String(selectedClass.review_phase_hours),
  );
  const totalDurationHours = parseFloat(gamePhaseHours) + parseFloat(reviewPhaseHours);

  // ── Per-round topics state (includes round 0 = warmup) ────────────────
  const [roundTopics, setRoundTopics] = useState<Record<string, string>>(() => {
    const rt: Record<string, string> = {};
    rt["0"] = selectedClass.round_topics?.["0"] || "";
    for (let r = 1; r <= selectedClass.total_rounds; r++) {
      rt[String(r)] = selectedClass.round_topics?.[String(r)] || "";
    }
    return rt;
  });

  // ── Per-round prompts state (includes round 0 = warmup) ───────────────
  const [roundPrompts, setRoundPrompts] = useState<Record<string, string>>(() => {
    const rp: Record<string, string> = {};
    rp["0"] = selectedClass.round_prompts?.["0"] || "";
    for (let r = 1; r <= selectedClass.total_rounds; r++) {
      rp[String(r)] = selectedClass.round_prompts?.[String(r)] || "";
    }
    return rp;
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
    setRoundPrompts((prev) => {
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

  const handlePromptChange = (round: number, value: string) => {
    setRoundPrompts((prev) => ({ ...prev, [String(round)]: value }));
  };

  // ── Collapsible sections ──────────────────────────────────────────────
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);

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
        setSuggestMsg({ ok: true, text: "Topic added!" });
        setSuggestText("");
        setTimeout(() => { setShowSuggest(false); setSuggestMsg(null); }, 2500);
      } else {
        setSuggestMsg({ ok: false, text: result.error });
      }
    });
  };

  // ── Delete topic ──────────────────────────────────────────────────────
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

  // ── Build JSON for hidden fields ──────────────────────────────────────
  // Include round 0 (warmup) in both
  const roundTopicsJson = JSON.stringify(
    Object.fromEntries([
      ["0", roundTopics["0"]?.trim() || null],
      ...Array.from({ length: totalRounds }, (_, i) => {
        const r = String(i + 1);
        const val = roundTopics[r]?.trim() || null;
        return [r, val];
      }),
    ]),
  );

  const roundPromptsJson = JSON.stringify(
    Object.fromEntries([
      ["0", roundPrompts["0"]?.trim() || null],
      ...Array.from({ length: totalRounds }, (_, i) => {
        const r = String(i + 1);
        const val = roundPrompts[r]?.trim() || null;
        return [r, val];
      }),
    ]),
  );

  // Bridge: set teacher_prompt to warmup prompt for backward compat
  const teacherPromptBridge = roundPrompts["0"]?.trim() || "";

  const hasAnyTopic = Object.values(roundTopics).some((v) => v && v.trim());
  const hasAnyPrompt = Object.values(roundPrompts).some((v) => v && v.trim());

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
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <label htmlFor="class-switcher" style={{ fontSize: 13, color: C.textDim, fontWeight: 600 }}>
          Current class:
        </label>
        <select
          id="class-switcher"
          value={selectedClass.id}
          onChange={handleClassChange}
          style={{ ...selectStyle(), flex: "1 1 240px", maxWidth: 380 }}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: C.textFaint, marginLeft: "auto" }}>
          {classes.length} {classes.length === 1 ? "class" : "classes"}
        </span>
      </div>

      <form
        action={formAction}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <input type="hidden" name="class_id" value={selectedClass.id} />
        <input type="hidden" name="total_rounds" value={String(totalRounds)} />
        <input type="hidden" name="round_topics" value={roundTopicsJson} />
        <input type="hidden" name="round_prompts" value={roundPromptsJson} />
        <input type="hidden" name="teacher_prompt" value={teacherPromptBridge} />
        <input type="hidden" name="round_duration_hours" value={String(totalDurationHours)} />
        <input type="hidden" name="game_phase_hours" value={gamePhaseHours} />
        <input type="hidden" name="review_phase_hours" value={reviewPhaseHours} />

        {/* ── Row 2: name + status pill ─────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap",
        }}>
          <label style={{
            flex: "1 1 280px", display: "flex", flexDirection: "column",
            gap: 4, fontSize: 12, color: C.textDim, fontWeight: 600, minWidth: 0,
          }}>
            Class name
            <input
              type="text" name="name" defaultValue={selectedClass.name}
              required minLength={1} maxLength={100}
              style={{ ...inputStyle(), fontSize: 15, fontWeight: 600 }}
            />
          </label>
          <div style={{
            flex: "0 1 auto", fontSize: 13, color: C.textDim,
            padding: "8px 12px", background: C.bg, borderRadius: 8,
            border: `1px solid ${C.panelEdge}55`, whiteSpace: "nowrap",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            {statusLine}
            {currentPhase && currentRound > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 8px",
                borderRadius: 12,
                background: currentPhase === "game" ? "#2a7a4a22" : "#D98A2B22",
                color: currentPhase === "game" ? "#2a7a4a" : "#B06B1A",
                border: `1px solid ${currentPhase === "game" ? "#2a7a4a44" : "#D98A2B44"}`,
                textTransform: "uppercase", letterSpacing: 0.5,
              }}>
                {currentPhase === "game" ? "Game phase" : "Review phase"}
              </span>
            )}
          </div>
        </div>

        {/* ── Row 3: settings grid ──────────────────────────────── */}
        <div style={{
          display: "grid", gridTemplateColumns: "0.7fr 1fr 1fr 1.3fr", gap: 12,
        }}>
          <Field label="Rounds">
            <input
              type="number" name="total_rounds"
              value={totalRounds} onChange={handleRoundsChange}
              required min={1} max={100} step={1}
              style={inputStyle()}
            />
          </Field>
          <Field label="Game time">
            <select value={gamePhaseHours} onChange={(e) => setGamePhaseHours(e.target.value)} style={selectStyle()}>
              {GAME_TIME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Review time">
            <select value={reviewPhaseHours} onChange={(e) => setReviewPhaseHours(e.target.value)} style={selectStyle()}>
              {REVIEW_TIME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Starts at">
            <input
              type="datetime-local" name="game_starts_at"
              value={startLocal} onChange={(e) => setStartLocal(e.target.value)}
              style={inputStyle()}
            />
          </Field>
        </div>
        <div style={{ fontSize: 11, color: C.textFaint, marginTop: -4 }}>
          Total round: {durationLabel(totalDurationHours) || `${totalDurationHours}h`}
        </div>

        {/* ── Row 4: Round titles (prominent toggle) ────────────── */}
        <div>
          <button
            type="button"
            onClick={() => setTopicsOpen(!topicsOpen)}
            style={{
              background: hasAnyTopic ? C.light + "15" : C.bg,
              border: `1px solid ${hasAnyTopic ? C.light + "44" : C.panelEdge}`,
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 14,
              fontWeight: 700,
              color: hasAnyTopic ? C.light : C.textDim,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          >
            <span style={{ fontSize: 12 }}>{topicsOpen ? "▾" : "▸"}</span>
            Round titles
            {hasAnyTopic && (
              <span style={{ fontWeight: 400, fontSize: 11, color: C.success, marginLeft: "auto" }}>
                configured ✓
              </span>
            )}
          </button>

          {topicsOpen && (
            <div style={{ marginTop: 10 }}>
              <div style={{
                display: "grid",
                gridTemplateColumns:
                  totalRounds <= 2 ? `repeat(${totalRounds + 1}, 1fr)` :
                  totalRounds <= 5 ? "repeat(3, 1fr)" :
                  "repeat(4, 1fr)",
                gap: 8,
              }}>
                {/* Warmup (round 0) — free text input */}
                <Field label="Warmup">
                  <input
                    type="text"
                    value={roundTopics["0"] || ""}
                    onChange={(e) => handleTopicChange(0, e.target.value)}
                    placeholder="Warmup title…"
                    maxLength={200}
                    style={{ ...inputStyle(), fontSize: 13 }}
                  />
                </Field>

                {/* Game rounds 1–N — topic dropdown */}
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
                          fontSize: 13,
                          ...(locked ? { opacity: 0.55, cursor: "not-allowed", background: "#EDE5D4" } : {}),
                        }}
                      >
                        <option value="">(No topic)</option>
                        {topicOptionsWithId.map((t) => (
                          <option key={t.id} value={t.text}>{t.text}</option>
                        ))}
                      </select>
                    </Field>
                  );
                })}
              </div>

              {/* Topic management */}
              {topicOptionsWithId.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>
                    Your topics
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {topicOptionsWithId.map((t) => (
                      <span key={t.id} style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        background: C.bg, border: `1px solid ${C.panelEdge}`,
                        borderRadius: 20, padding: "3px 10px", fontSize: 12,
                        color: C.text, opacity: deletingTopicId === t.id ? 0.4 : 1,
                      }}>
                        {t.text}
                        <button
                          type="button" onClick={() => handleDeleteTopic(t.id)}
                          disabled={deletingTopicId === t.id}
                          style={{
                            background: "none", border: "none", color: C.textFaint,
                            fontSize: 13, cursor: "pointer", padding: "0 0 0 2px",
                            lineHeight: 1, fontFamily: "inherit",
                          }}
                          title="Delete topic"
                        >✕</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Add topic */}
              {!showSuggest ? (
                <button
                  type="button"
                  onClick={() => { setShowSuggest(true); setSuggestMsg(null); }}
                  style={{
                    background: "none", border: "none", color: C.light,
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    padding: "4px 0", marginTop: 4, fontFamily: "inherit",
                  }}
                >
                  Add a topic →
                </button>
              ) : (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  marginTop: 6, flexWrap: "wrap",
                }}>
                  <input
                    type="text" value={suggestText}
                    onChange={(e) => setSuggestText(e.target.value)}
                    placeholder="New topic…" maxLength={80}
                    style={{ ...inputStyle(), flex: "1 1 180px", fontSize: 13 }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSuggest(); } }}
                  />
                  <button
                    type="button" onClick={handleSuggest}
                    disabled={suggestPending || !suggestText.trim()}
                    style={{
                      background: C.light, color: "#fff", border: "none",
                      borderRadius: 8, padding: "7px 14px", fontSize: 12,
                      fontWeight: 700, fontFamily: "inherit",
                      cursor: suggestPending || !suggestText.trim() ? "default" : "pointer",
                      opacity: suggestPending || !suggestText.trim() ? 0.5 : 1,
                    }}
                  >
                    {suggestPending ? "Adding…" : "Add"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowSuggest(false); setSuggestMsg(null); }}
                    style={{
                      background: "none", border: "none", color: C.textFaint,
                      fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    Cancel
                  </button>
                  {suggestMsg && (
                    <span style={{
                      fontSize: 12,
                      color: suggestMsg.ok ? "#2a7a4a" : "#8A2A22",
                      flex: "1 0 100%",
                    }}>
                      {suggestMsg.text}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Row 5: Round prompts (under a toggle) ─────────────── */}
        <div>
          <button
            type="button"
            onClick={() => setPromptsOpen(!promptsOpen)}
            style={{
              background: hasAnyPrompt ? C.light + "10" : "transparent",
              border: `1px solid ${C.panelEdge}`,
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 600,
              color: C.textDim,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          >
            <span style={{ fontSize: 12 }}>{promptsOpen ? "▾" : "▸"}</span>
            Round prompts
            <span style={{ fontWeight: 400, color: C.textFaint, fontSize: 11 }}>
              — shown in comment box while students play
            </span>
            {hasAnyPrompt && (
              <span style={{ fontWeight: 400, fontSize: 11, color: C.success, marginLeft: "auto" }}>
                configured ✓
              </span>
            )}
          </button>

          {promptsOpen && (
            <div style={{ marginTop: 10 }}>
              <div style={{
                display: "grid",
                gridTemplateColumns:
                  totalRounds <= 2 ? `repeat(${totalRounds + 1}, 1fr)` :
                  totalRounds <= 5 ? "repeat(3, 1fr)" :
                  "repeat(4, 1fr)",
                gap: 8,
              }}>
                {/* Warmup prompt (round 0) */}
                <Field label="Warmup">
                  <input
                    type="text"
                    value={roundPrompts["0"] || ""}
                    onChange={(e) => handlePromptChange(0, e.target.value)}
                    placeholder="Warmup prompt…"
                    maxLength={200}
                    style={{ ...inputStyle(), fontSize: 13 }}
                  />
                </Field>

                {/* Game round prompts 1–N */}
                {Array.from({ length: totalRounds }, (_, i) => i + 1).map((r) => {
                  const locked = r < currentRound;
                  return (
                    <Field key={r} label={`Round ${r}${locked ? " ✓" : ""}`}>
                      <input
                        type="text"
                        value={roundPrompts[String(r)] || ""}
                        onChange={(e) => handlePromptChange(r, e.target.value)}
                        disabled={locked}
                        placeholder={`Round ${r} prompt…`}
                        maxLength={200}
                        style={{
                          ...inputStyle(),
                          fontSize: 13,
                          ...(locked ? { opacity: 0.55, cursor: "not-allowed", background: "#EDE5D4" } : {}),
                        }}
                      />
                    </Field>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Row 6: save + inline success ──────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="submit" disabled={pending}
            style={{
              background: C.light, color: "#fff", border: "none",
              borderRadius: 999, padding: "8px 22px", fontSize: 14,
              fontWeight: 700, fontFamily: "inherit",
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

        {/* ── Row 7: warning / error bands ──────────────────────── */}
        {banner?.kind === "warning" && (
          <div style={{
            background: "#F8D87A55", border: "1px solid #C9A248",
            borderRadius: 10, padding: "10px 12px", fontSize: 13,
            color: "#6B4A12", lineHeight: 1.45,
          }}>
            <strong style={{ fontWeight: 700 }}>Heads up: </strong>
            {banner.text}
          </div>
        )}
        {banner?.kind === "error" && (
          <div style={{
            background: "#E2554A22", border: "1px solid #C04A3F",
            borderRadius: 10, padding: "10px 12px", fontSize: 13,
            color: "#8A2A22", lineHeight: 1.45,
          }}>
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
    <label style={{
      display: "flex", flexDirection: "column", gap: 4,
      fontSize: 12, color: C.textDim, fontWeight: 600, minWidth: 0,
    }}>
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
