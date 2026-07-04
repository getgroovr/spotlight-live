// ─────────────────────────────────────────────────────────────────────────
// src/app/admin/admin-client.tsx — Session 69 layout (v4)
//
// Session 74: C4 — class request workflow. TeacherTable "Requested"
// column now shows Approve/Deny buttons for pending requests.
//
// NOTE: Tailwind grid-cols-N does NOT work in this project's build.
// All multi-column layouts use inline styles.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState, useTransition } from "react";
import type { TeacherRow, ClassRow, StarterRow, WarmupConfig, ClassRequestRow } from "./page";
import {
  updateMaxClasses,
  addToRotation,
  removeFromRotation,
  setRotationStatus,
  moveInRotation,
  togglePhotoActive,
  updateWarmupMode,
  approveClassRequest,
  denyClassRequest,
} from "./actions";

// ═════════════════════════════════════════════════════════════════════════
// Main component
// ═════════════════════════════════════════════════════════════════════════
export function AdminClient({
  teachers,
  warmupConfig,
  classRequests,
}: {
  teachers: TeacherRow[];
  warmupConfig: WarmupConfig;
  classRequests: ClassRequestRow[];
}) {
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [tab, setTab] = useState<"deck" | "classes" | "students">("deck");

  const selected = teachers.find((t) => t.id === selectedTeacherId) || null;

  const inRotation = teachers
    .filter((t) => t.rotation !== null)
    .sort((a, b) => a.rotation!.sort_order - b.rotation!.sort_order);

  const notInRotation = teachers.filter((t) => t.rotation === null);

  const recruiting = inRotation.find((t) => t.rotation?.status === "recruiting");
  const nextUp = inRotation.find(
    (t) => t.rotation?.status === "waiting" && t.id !== recruiting?.id,
  );

  const totalTeachers = teachers.length;
  const totalStudents = teachers.reduce(
    (sum, t) => sum + t.classes.reduce((s, c) => s + c.student_count, 0),
    0,
  );
  const totalClasses = teachers.reduce((sum, t) => sum + t.classes.length, 0);
  const modeLabels: Record<number, string> = { 1: "Solo", 3: "Trio", 9: "Full" };

  return (
    <div className="space-y-4">
      {/* ─── HEADER ─────────────────────────────────────────────── */}
      <h1 className="text-2xl font-bold bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
        Admin
      </h1>

      {/* ─── 1. OVERVIEW ────────────────────────────────────────── */}
      <SectionLabel text="Overview" />
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <StatItem label="Teachers" value={totalTeachers} />
        <StatItem label="Students" value={totalStudents} />
        <StatItem label="Classes" value={totalClasses} />
        <StatItem label="Mode" value={modeLabels[warmupConfig.warmup_teacher_count]} />
      </div>

      {/* ─── 2. MESSAGES ────────────────────────────────────────── */}
      <SectionLabel text="Messages" />
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-white/25 mb-1">From teachers</div>
          <p className="text-white/20 text-[11px]">No messages yet</p>
        </div>
        <div style={{ flex: 1 }} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-white/25 mb-1">From students</div>
          <p className="text-white/20 text-[11px]">No messages yet</p>
        </div>
      </div>

      {/* ─── 3. WARM-UP CONTROL ─────────────────────────────────── */}
      <SectionLabel text="Warm-up control" />
      <WarmupBlock
        config={warmupConfig}
        teachers={teachers}
        inRotation={inRotation}
        notInRotation={notInRotation}
        recruiting={recruiting || null}
        nextUp={nextUp || null}
      />

      {/* ─── 4. ALL TEACHERS ────────────────────────────────────── */}
      <SectionLabel text="All teachers" />
      <TeacherTable
        teachers={teachers}
        classRequests={classRequests}
        selectedId={selectedTeacherId}
        onSelect={(id) => { setSelectedTeacherId(id); setTab("deck"); }}
      />

      {/* ─── 5. CURRENT CLASSES ─────────────────────────────────── */}
      <SectionLabel text="Current classes" />
      <div>
        <select
          value={selectedTeacherId || ""}
          onChange={(e) => { setSelectedTeacherId(e.target.value || null); setTab("deck"); }}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mb-3"
        >
          <option value="" className="bg-gray-900">Select a teacher…</option>
          {teachers.map((t) => {
            const name = t.display_name || t.username || "Unnamed";
            return (
              <option key={t.id} value={t.id} className="bg-gray-900">
                {name}{t.is_admin ? " ★" : ""} — {t.classes.length} class{t.classes.length !== 1 ? "es" : ""}
              </option>
            );
          })}
        </select>
        {selected ? (
          <TeacherDetailPanel teacher={selected} tab={tab} onTabChange={setTab} />
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-white/25 text-xs">
            Choose a teacher above to see their classes, deck, and students
          </div>
        )}
      </div>

      {/* ─── 6. ARCHIVE ─────────────────────────────────────────── */}
      <SectionLabel text="Archive" />
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-white/25 text-xs">
        Completed games and past classes will appear here
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Stat item
// ═════════════════════════════════════════════════════════════════════════
function StatItem({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
      <span className="text-[10px] text-white/35">{label}</span>
      <span className={`font-bold text-sm ${color || "text-white"}`}>{value}</span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Section label
// ═════════════════════════════════════════════════════════════════════════
function SectionLabel({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-[10px] uppercase tracking-wider text-white/30 font-medium">{text}</span>
      <div className="flex-1 border-t border-white/10" />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Warm-up block
// ═════════════════════════════════════════════════════════════════════════
function WarmupBlock({
  config,
  teachers,
  inRotation,
  notInRotation,
  recruiting,
  nextUp,
}: {
  config: WarmupConfig;
  teachers: TeacherRow[];
  inRotation: TeacherRow[];
  notInRotation: TeacherRow[];
  recruiting: TeacherRow | null;
  nextUp: TeacherRow | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const modeLabels: Record<number, string> = { 1: "Solo (1)", 3: "Trio (3)", 9: "Full (9)" };
  const isLive = !!recruiting;

  function handleModeChange(val: string) {
    const count = parseInt(val, 10) as 1 | 3 | 9;
    if (count === config.warmup_teacher_count) return;
    setError(null);
    startTransition(async () => {
      const res = await updateWarmupMode(count);
      if (!res.ok) setError(res.error);
    });
  }

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok && "error" in res) setError(res.error as string);
    });
  }

  function handleToggleWarmup() {
    if (isLive && recruiting) {
      // Stop: set recruiting teacher back to waiting
      act(() => setRotationStatus(recruiting.id, "waiting"));
    } else {
      // Start: set first waiting teacher in queue to recruiting
      const firstWaiting = inRotation.find((t) => t.rotation?.status === "waiting");
      if (firstWaiting) {
        act(() => setRotationStatus(firstWaiting.id, "recruiting"));
      } else {
        setError("No teachers in queue to start warm-up.");
      }
    }
  }

  return (
    <div className={`rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3 ${pending ? "opacity-60 pointer-events-none" : ""}`}>
      {/* Top row: mode + toggle + status */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }} className="text-xs">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="text-white/50">Mode</span>
          <select
            value={config.warmup_teacher_count}
            onChange={(e) => handleModeChange(e.target.value)}
            className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white"
          >
            {[1, 3, 9].map((v) => (
              <option key={v} value={v} disabled={v > teachers.length} className="bg-gray-900">
                {modeLabels[v]}
              </option>
            ))}
          </select>
        </div>

        {/* Start / Stop warm-up toggle */}
        <button
          onClick={handleToggleWarmup}
          className={`text-[10px] font-medium px-3 py-1 rounded-md border transition ${
            isLive
              ? "border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/20"
              : "border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
          }`}
        >
          {isLive ? "Stop warm-up" : "Start warm-up"}
        </button>

        <div>
          <span className="text-white/40">Recruiting: </span>
          {recruiting ? (
            <span className="font-medium text-emerald-300">{recruiting.display_name || recruiting.username}</span>
          ) : (
            <span className="text-white/25">—</span>
          )}
        </div>
        <div>
          <span className="text-white/40">Next: </span>
          {nextUp ? (
            <span className="font-medium text-amber-300">{nextUp.display_name || nextUp.username}</span>
          ) : (
            <span className="text-white/25">—</span>
          )}
        </div>
      </div>

      {/* Two side-by-side columns */}
      <div style={{ display: "flex", gap: 12 }}>
        {/* LEFT: wanting classes */}
        <div style={{ flex: 1 }} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span className="text-[10px] uppercase tracking-wider text-emerald-400/50">Wanting classes</span>
          </div>
          <div className="text-[9px] uppercase tracking-wider text-white/20 mb-1 pl-5">Teacher</div>
          {inRotation.length === 0 ? (
            <p className="text-white/20 text-[11px]">None</p>
          ) : (
            <div className="space-y-0.5">
              {inRotation.map((t, idx) => {
                const name = t.display_name || t.username || "Unnamed";
                const isRec = t.rotation?.status === "recruiting";
                return (
                  <div key={t.id} className={`flex items-center gap-1 text-xs px-1 py-0.5 rounded ${isRec ? "bg-emerald-500/10" : ""}`}>
                    <div className="flex flex-col leading-none flex-shrink-0">
                      <button
                        onClick={() => act(() => moveInRotation(t.id, "up"))}
                        disabled={idx === 0}
                        className="text-white/25 hover:text-white disabled:opacity-20 text-[9px]"
                      >▲</button>
                      <button
                        onClick={() => act(() => moveInRotation(t.id, "down"))}
                        disabled={idx === inRotation.length - 1}
                        className="text-white/25 hover:text-white disabled:opacity-20 text-[9px]"
                      >▼</button>
                    </div>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isRec ? "bg-emerald-400" : "bg-amber-400/50"}`} />
                    <span className="text-white/70 truncate">{name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT: not wanting classes */}
        <div style={{ flex: 1 }} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
          <div style={{ marginBottom: 6 }}>
            <span className="text-[10px] uppercase tracking-wider text-white/25">Not wanting classes</span>
          </div>
          <div className="text-[9px] uppercase tracking-wider text-white/20 mb-1">Teacher</div>
          {notInRotation.length === 0 ? (
            <p className="text-white/20 text-[11px]">None</p>
          ) : (
            <div className="space-y-0.5">
              {notInRotation.map((t) => {
                const name = t.display_name || t.username || "Unnamed";
                return (
                  <div key={t.id} className="flex items-center gap-1.5 text-xs px-1 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/15 flex-shrink-0" />
                    <span className="text-white/40 truncate">{name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {error && <div className="text-xs text-red-400">{error}</div>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Teacher table — wider columns
// ═════════════════════════════════════════════════════════════════════════
function TeacherTable({
  teachers,
  classRequests,
  selectedId,
  onSelect,
}: {
  teachers: TeacherRow[];
  classRequests: ClassRequestRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok && "error" in res) setError(res.error as string);
    });
  }

  // Index pending requests by teacher_id
  const pendingByTeacher = new Map<string, ClassRequestRow[]>();
  for (const r of classRequests) {
    if (r.status === "pending") {
      const arr = pendingByTeacher.get(r.teacher_id) || [];
      arr.push(r);
      pendingByTeacher.set(r.teacher_id, arr);
    }
  }

  if (teachers.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-white/40 text-xs">
        No teachers found. Run seed-teachers SQL.
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden ${pending ? "opacity-60 pointer-events-none" : ""}`}>
      <table className="w-full text-xs" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col />
          <col style={{ width: 80 }} />
          <col style={{ width: 85 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 110 }} />
        </colgroup>
        <thead>
          <tr className="border-b border-white/10 text-[9px] uppercase tracking-wider text-white/25">
            <th className="text-left font-medium px-3 py-2">Teacher</th>
            <th className="text-center font-medium py-2">Classes</th>
            <th className="text-center font-medium py-2">Archived</th>
            <th className="text-center font-medium py-2">Requested</th>
            <th className="text-center font-medium py-2">Queue</th>
          </tr>
        </thead>
        <tbody>
          {teachers.map((t) => {
            const name = t.display_name || t.username || "Unnamed";
            const isSelected = t.id === selectedId;
            const inQueue = t.rotation !== null;
            const teacherPending = pendingByTeacher.get(t.id) || [];

            return (
              <tr
                key={t.id}
                className={`border-b border-white/5 last:border-0 ${isSelected ? "bg-fuchsia-500/10" : ""}`}
              >
                <td className="px-3 py-1.5">
                  <button
                    onClick={() => onSelect(t.id)}
                    className="flex items-center gap-1.5 text-left"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      t.rotation?.status === "recruiting" ? "bg-emerald-400"
                        : inQueue ? "bg-amber-400"
                        : "bg-white/15"
                    }`} />
                    <span className="text-white/80">{name}</span>
                    {t.is_admin && (
                      <span className="text-[8px] px-1 rounded bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20">
                        admin
                      </span>
                    )}
                  </button>
                </td>
                <td className="text-center text-white/40 py-1.5">{t.classes.length}/{t.max_classes}</td>
                <td className="text-center text-white/20 py-1.5">0</td>
                <td className="text-center py-1.5">
                  {teacherPending.length > 0 ? (
                    <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                      <button
                        onClick={() => act(() => approveClassRequest(teacherPending[0].id))}
                        className="text-[9px] px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition"
                      >Approve</button>
                      <button
                        onClick={() => act(() => denyClassRequest(teacherPending[0].id))}
                        className="text-[9px] px-1.5 py-0.5 rounded border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition"
                      >Deny</button>
                    </div>
                  ) : (
                    <span className="text-white/20">—</span>
                  )}
                </td>
                <td className="text-center py-1.5">
                  {inQueue ? (
                    <button
                      onClick={() => act(() => removeFromRotation(t.id))}
                      className="text-[10px] px-2 py-0.5 rounded border border-amber-500/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition"
                    >Pause</button>
                  ) : (
                    <button
                      onClick={() => act(() => addToRotation(t.id))}
                      className="text-[10px] px-2 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition"
                    >Add to queue</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error && <div className="text-xs text-red-400 px-3 py-1.5">{error}</div>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Teacher detail panel
// ═════════════════════════════════════════════════════════════════════════
function TeacherDetailPanel({
  teacher,
  tab,
  onTabChange,
}: {
  teacher: TeacherRow;
  tab: "deck" | "classes" | "students";
  onTabChange: (t: "deck" | "classes" | "students") => void;
}) {
  const [pending, startTransition] = useTransition();
  const [editingMax, setEditingMax] = useState(false);
  const [maxVal, setMaxVal] = useState(String(teacher.max_classes));
  const [error, setError] = useState<string | null>(null);

  const name = teacher.display_name || teacher.username || "Unnamed";
  const totalStudents = teacher.classes.reduce((s, c) => s + c.student_count, 0);
  const activePhotos = teacher.starters.filter((s) => s.is_active).length;

  function handleSaveMax() {
    const n = parseInt(maxVal, 10);
    if (isNaN(n) || n < 1) { setError("Must be at least 1."); return; }
    setError(null);
    startTransition(async () => {
      const res = await updateMaxClasses(teacher.id, n);
      if (!res.ok) setError(res.error);
      else setEditingMax(false);
    });
  }

  return (
    <div className={`rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden ${pending ? "opacity-60 pointer-events-none" : ""}`}>
      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm">{name}</span>
          {teacher.is_admin && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20">admin</span>
          )}
          {teacher.rotation && <StatusBadge status={teacher.rotation.status} />}
        </div>
        <div className="text-[11px] text-white/40 mt-0.5">
          {teacher.classes.length}/{teacher.max_classes} classes · {totalStudents} students · {activePhotos}/{teacher.starters.length} photos active
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {editingMax ? (
            <>
              <span className="text-[11px] text-white/40">Max classes:</span>
              <input
                type="number" min={1} max={50} value={maxVal}
                onChange={(e) => setMaxVal(e.target.value)}
                className="w-12 rounded bg-white/10 border border-white/20 px-1.5 py-0.5 text-xs text-white text-center"
              />
              <Pill onClick={handleSaveMax} variant="green">Save</Pill>
              <Pill onClick={() => { setEditingMax(false); setMaxVal(String(teacher.max_classes)); }} variant="default">Cancel</Pill>
            </>
          ) : (
            <Pill onClick={() => setEditingMax(true)} variant="default">Max classes: {teacher.max_classes}</Pill>
          )}
        </div>
        {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
      </div>

      <div className="flex border-b border-white/10">
        {(["deck", "classes", "students"] as const).map((t) => {
          const label =
            t === "deck" ? `Deck (${teacher.starters.length})`
            : t === "classes" ? `Classes (${teacher.classes.length})`
            : `Students (${totalStudents})`;
          return (
            <button
              key={t}
              onClick={() => onTabChange(t)}
              className={`flex-1 py-2 text-[11px] font-medium text-center transition ${
                tab === t ? "text-fuchsia-300 border-b-2 border-fuchsia-400" : "text-white/30 hover:text-white/60"
              }`}
            >{label}</button>
          );
        })}
      </div>

      <div className="p-3">
        {tab === "deck" && <DeckTab starters={teacher.starters} teacherName={name} />}
        {tab === "classes" && <ClassesTab classes={teacher.classes} />}
        {tab === "students" && <StudentsTab classes={teacher.classes} />}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Deck tab
// ═════════════════════════════════════════════════════════════════════════
function DeckTab({ starters, teacherName }: { starters: StarterRow[]; teacherName: string }) {
  if (starters.length === 0) {
    return <p className="text-white/30 text-xs text-center py-4">{teacherName} has no warm-up photos.</p>;
  }

  const active = starters.filter((s) => s.is_active).length;
  const inactive = starters.length - active;

  return (
    <div>
      <div className="space-y-2 mb-2">
        {starters.map((s) => (
          <PhotoCard key={s.id} starter={s} />
        ))}
      </div>
      <div className="text-[10px] text-white/30">
        {active} active{inactive > 0 ? ` · ${inactive} inactive` : ""}
      </div>
    </div>
  );
}

function PhotoCard({ starter }: { starter: StarterRow }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className={`rounded-lg border overflow-hidden ${
      starter.is_active ? "border-emerald-400/30" : "border-white/10 opacity-40"
    } ${pending ? "opacity-30 pointer-events-none" : ""}`}>
      <div style={{ display: "flex", gap: 0 }}>
        {/* Thumbnail on left */}
        <div style={{ width: 72, height: 72, flexShrink: 0, position: "relative", background: "rgba(255,255,255,0.03)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={starter.media_url}
            alt={starter.description_text || "Warm-up photo"}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          {starter.is_active && (
            <div style={{ position: "absolute", top: 2, right: 2, width: 14, height: 14, borderRadius: "50%", background: "rgba(16,185,129,0.8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 7, color: "white", fontWeight: "bold" }}>✓</span>
            </div>
          )}
        </div>
        {/* Description + status on right */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "6px 8px" }}>
          {starter.description_text ? (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const, margin: 0 }}>
              {starter.description_text}
            </p>
          ) : (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", margin: 0 }}>No description</p>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
            <button
              onClick={() => { startTransition(async () => { await togglePhotoActive(starter.id, !starter.is_active); }); }}
              className={`text-[9px] font-medium px-2 py-0.5 rounded transition ${
                starter.is_active
                  ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                  : "bg-white/5 text-white/30 hover:bg-white/10"
              }`}
            >{starter.is_active ? "Active" : "Inactive"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Classes tab
// ═════════════════════════════════════════════════════════════════════════
function ClassesTab({ classes }: { classes: ClassRow[] }) {
  const [openId, setOpenId] = useState<string | null>(
    classes.length > 0 ? classes[0].id : null,
  );

  if (classes.length === 0) {
    return <p className="text-white/30 text-xs text-center py-4">No classes.</p>;
  }

  return (
    <div className="space-y-1.5">
      {classes.map((c) => {
        const isOpen = openId === c.id;
        return (
          <div key={c.id} className="rounded-lg border border-white/10 overflow-hidden">
            <button
              onClick={() => setOpenId(isOpen ? null : c.id)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-left hover:bg-white/5 transition text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium truncate">{c.name}</span>
                <span className="text-white/30 flex-shrink-0">{c.student_count}/{c.capacity}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {c.game && (
                  <span className={`text-[9px] font-medium px-1 py-0.5 rounded border ${
                    c.game.status === "active" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : c.game.status === "complete" ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
                    : "border-white/20 bg-white/5 text-white/50"
                  }`}>{c.game.status} · {c.game.round_count}R</span>
                )}
                <span className="text-white/20 text-[10px]">{isOpen ? "▾" : "▸"}</span>
              </div>
            </button>
            {isOpen && (
              <div className="px-2.5 pb-2 border-t border-white/10">
                {c.game && (
                  <div className="text-[10px] text-white/40 py-1.5">
                    {c.game.name} · {c.game.status} · {c.game.round_count} rounds
                  </div>
                )}
                {c.students.length === 0 ? (
                  <p className="text-[10px] text-white/30 py-1.5">No students enrolled.</p>
                ) : (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.students.map((s) => (
                      <span key={s.id} className="text-[10px] text-white/60 bg-white/5 rounded px-1.5 py-0.5">
                        {s.display_name || s.username || s.id.slice(0, 6)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Students tab
// ═════════════════════════════════════════════════════════════════════════
function StudentsTab({ classes }: { classes: ClassRow[] }) {
  const allStudents = classes.flatMap((c) =>
    c.students.map((s) => ({ ...s, className: c.name })),
  );

  if (allStudents.length === 0) {
    return <p className="text-white/30 text-xs text-center py-4">No students.</p>;
  }

  return (
    <div className="space-y-1">
      {allStudents.map((s) => (
        <div key={s.id} className="flex items-center justify-between text-xs px-1 py-1 border-b border-white/5 last:border-0">
          <span className="text-white/70">{s.display_name || s.username || s.id.slice(0, 8)}</span>
          <span className="text-[10px] text-white/30">{s.className}</span>
        </div>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Shared
// ═════════════════════════════════════════════════════════════════════════
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    recruiting: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
    waiting: "bg-white/5 text-white/40 border-white/15",
    paused: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  };
  return (
    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded border ${styles[status] || styles.waiting}`}>
      {status}
    </span>
  );
}

function Pill({
  children, onClick, variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "green" | "red" | "amber";
}) {
  const styles: Record<string, string> = {
    default: "border-white/15 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
    green: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20",
    red: "border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/20",
    amber: "border-amber-500/25 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20",
  };
  return (
    <button
      onClick={onClick}
      className={`text-[10px] font-medium px-2 py-0.5 rounded-md border transition ${styles[variant]}`}
    >{children}</button>
  );
}
