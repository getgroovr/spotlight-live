// ─────────────────────────────────────────────────────────────────────────
// src/app/admin/admin-client.tsx — Session 67 rebuild
//
// Teacher-centric dashboard: selector → detail panel (Classes / Deck / Archive)
// Plus warm-up config and rotation queue at the bottom.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import { useState, useTransition } from "react";
import type { TeacherRow, ClassRow, StarterRow, WarmupConfig } from "./page";
import {
  updateMaxClasses,
  addToRotation,
  removeFromRotation,
  setRotationStatus,
  moveInRotation,
  togglePhotoActive,
  updateWarmupMode,
} from "./actions";

// ═════════════════════════════════════════════════════════════════════════
// Main component
// ═════════════════════════════════════════════════════════════════════════
export function AdminClient({
  teachers,
  warmupConfig,
}: {
  teachers: TeacherRow[];
  warmupConfig: WarmupConfig;
}) {
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(
    teachers.length > 0 ? teachers[0].id : null,
  );
  const [tab, setTab] = useState<"classes" | "deck" | "archive">("classes");

  const selected = teachers.find((t) => t.id === selectedTeacherId) || null;

  // Rotation queue (sorted)
  const inRotation = teachers
    .filter((t) => t.rotation !== null)
    .sort((a, b) => a.rotation!.sort_order - b.rotation!.sort_order);

  return (
    <div className="space-y-6">
      {/* ── Teacher selector + detail ───────────────────────────── */}
      <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        {/* Selector bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-white/5">
          <label className="text-xs text-white/50 flex-shrink-0">Teacher</label>
          <select
            value={selectedTeacherId || ""}
            onChange={(e) => {
              setSelectedTeacherId(e.target.value);
              setTab("classes");
            }}
            className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            {teachers.map((t) => (
              <option key={t.id} value={t.id} className="bg-gray-900 text-white">
                {t.display_name || t.username || "Unnamed"}
                {t.is_admin ? " ★" : ""}
              </option>
            ))}
          </select>
        </div>

        {selected ? (
          <>
            {/* Teacher info header */}
            <TeacherHeader teacher={selected} />

            {/* Tab bar */}
            <div className="flex border-b border-white/10">
              {(["classes", "deck", "archive"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2 text-xs font-medium text-center transition ${
                    tab === t
                      ? "text-fuchsia-300 border-b-2 border-fuchsia-400"
                      : "text-white/40 hover:text-white/70"
                  }`}
                >
                  {t === "classes" ? `Classes (${selected.classes.length})` :
                   t === "deck" ? `Deck (${selected.starters.length})` :
                   "Archive"}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="p-4">
              {tab === "classes" && <ClassesTab classes={selected.classes} />}
              {tab === "deck" && <DeckTab starters={selected.starters} teacherName={selected.display_name || selected.username || "Teacher"} />}
              {tab === "archive" && (
                <p className="text-white/40 text-sm text-center py-6">
                  No archived classes yet.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="p-6 text-center text-white/40 text-sm">
            No teachers found. Run the seed-teachers SQL to create test teachers.
          </div>
        )}
      </section>

      {/* ── Warm-up config ──────────────────────────────────────── */}
      <WarmupConfigPanel config={warmupConfig} teacherCount={teachers.length} />

      {/* ── Rotation queue ──────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-bold mb-3 text-fuchsia-300">
          Rotation queue
        </h2>
        {inRotation.length === 0 ? (
          <p className="text-white/50 text-sm">
            No teachers in the rotation. Use "+ Rotation" on a teacher to add them.
          </p>
        ) : (
          <div className="space-y-2">
            {inRotation.map((t, idx) => (
              <RotationCard
                key={t.id}
                teacher={t}
                isFirst={idx === 0}
                isLast={idx === inRotation.length - 1}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── All teachers list (compact) ─────────────────────────── */}
      <section>
        <h2 className="text-lg font-bold mb-3 text-fuchsia-300">
          All teachers
        </h2>
        <div className="space-y-2">
          {teachers.map((t) => (
            <TeacherRosterCard
              key={t.id}
              teacher={t}
              onSelect={() => {
                setSelectedTeacherId(t.id);
                setTab("classes");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Teacher header (in detail panel)
// ═════════════════════════════════════════════════════════════════════════
function TeacherHeader({ teacher }: { teacher: TeacherRow }) {
  const [pending, startTransition] = useTransition();
  const [editingMax, setEditingMax] = useState(false);
  const [maxVal, setMaxVal] = useState(String(teacher.max_classes));
  const [error, setError] = useState<string | null>(null);

  const name = teacher.display_name || teacher.username || "Unnamed";
  const totalStudents = teacher.classes.reduce((sum, c) => sum + c.student_count, 0);

  function handleSaveMax() {
    const n = parseInt(maxVal, 10);
    if (isNaN(n) || n < 1) { setError("Must be ≥ 1."); return; }
    setError(null);
    startTransition(async () => {
      const res = await updateMaxClasses(teacher.id, n);
      if (!res.ok) setError(res.error);
      else setEditingMax(false);
    });
  }

  function handleAddRotation() {
    setError(null);
    startTransition(async () => {
      const res = await addToRotation(teacher.id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className={`px-4 py-3 border-b border-white/10 ${pending ? "opacity-60 pointer-events-none" : ""}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-bold text-base">{name}</span>
        {teacher.is_admin && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300">
            admin
          </span>
        )}
        {teacher.rotation && <StatusBadge status={teacher.rotation.status} />}

        <span className="text-xs text-white/50 ml-auto">
          {teacher.classes.length}/{teacher.max_classes} classes · {totalStudents} students · {teacher.starters.filter(s => s.is_active).length}/{teacher.starters.length} photos active
        </span>
      </div>

      <div className="flex items-center gap-2 mt-2">
        {/* Max classes editor */}
        {editingMax ? (
          <>
            <span className="text-xs text-white/50">Max classes:</span>
            <input
              type="number" min={1} max={50}
              value={maxVal}
              onChange={(e) => setMaxVal(e.target.value)}
              className="w-14 rounded bg-white/10 border border-white/20 px-2 py-1 text-xs text-white text-center"
            />
            <SmallButton onClick={handleSaveMax} variant="green">Save</SmallButton>
            <SmallButton onClick={() => { setEditingMax(false); setMaxVal(String(teacher.max_classes)); }} variant="default">✕</SmallButton>
          </>
        ) : (
          <SmallButton onClick={() => setEditingMax(true)} variant="default">
            Max classes: {teacher.max_classes}
          </SmallButton>
        )}

        {/* Add to rotation */}
        {!teacher.rotation && (
          <SmallButton onClick={handleAddRotation} variant="green">+ Rotation</SmallButton>
        )}
      </div>

      {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Classes tab
// ═════════════════════════════════════════════════════════════════════════
function ClassesTab({ classes }: { classes: ClassRow[] }) {
  const [openClassId, setOpenClassId] = useState<string | null>(
    classes.length > 0 ? classes[0].id : null,
  );

  if (classes.length === 0) {
    return <p className="text-white/40 text-sm text-center py-4">No classes yet.</p>;
  }

  return (
    <div className="space-y-2">
      {classes.map((c) => {
        const isOpen = openClassId === c.id;
        return (
          <div key={c.id} className="rounded-lg border border-white/10 overflow-hidden">
            <button
              onClick={() => setOpenClassId(isOpen ? null : c.id)}
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/5 transition"
            >
              <div>
                <span className="text-sm font-semibold">{c.name}</span>
                <span className="text-xs text-white/50 ml-2">
                  {c.student_count}/{c.capacity} students
                </span>
              </div>
              <div className="flex items-center gap-2">
                {c.game && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                    c.game.status === "active" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" :
                    c.game.status === "complete" ? "border-blue-500/30 bg-blue-500/10 text-blue-300" :
                    "border-white/20 bg-white/10 text-white/60"
                  }`}>
                    {c.game.status} · {c.game.round_count}R
                  </span>
                )}
                <span className="text-white/30 text-xs">{isOpen ? "▾" : "▸"}</span>
              </div>
            </button>

            {isOpen && (
              <div className="px-3 pb-3 border-t border-white/10">
                {c.game && (
                  <div className="text-xs text-white/50 py-2">
                    Game: {c.game.name} · Status: {c.game.status} · Rounds: {c.game.round_count}
                  </div>
                )}
                {c.students.length === 0 ? (
                  <p className="text-xs text-white/40 py-2">No students enrolled.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mt-1">
                    {c.students.map((s) => (
                      <div key={s.id} className="text-xs text-white/70 bg-white/5 rounded px-2 py-1 truncate">
                        {s.display_name || s.username || s.id.slice(0, 8)}
                      </div>
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
// Deck tab (starter photos with active toggle)
// ═════════════════════════════════════════════════════════════════════════
function DeckTab({ starters, teacherName }: { starters: StarterRow[]; teacherName: string }) {
  if (starters.length === 0) {
    return <p className="text-white/40 text-sm text-center py-4">{teacherName} has no warm-up photos.</p>;
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {starters.map((s) => (
        <PhotoCard key={s.id} starter={s} />
      ))}
    </div>
  );
}

function PhotoCard({ starter }: { starter: StarterRow }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      const res = await togglePhotoActive(starter.id, !starter.is_active);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className={`rounded-lg border overflow-hidden ${
      starter.is_active ? "border-emerald-400/30" : "border-white/10 opacity-50"
    } ${pending ? "opacity-40 pointer-events-none" : ""}`}>
      <div className="aspect-square bg-white/5 relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={starter.media_url}
          alt={starter.description_text || "Warm-up photo"}
          className="w-full h-full object-cover"
        />
      </div>
      <button
        onClick={handleToggle}
        className={`w-full text-[10px] font-medium py-1 transition ${
          starter.is_active
            ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
            : "bg-white/5 text-white/40 hover:bg-white/10"
        }`}
      >
        {starter.is_active ? "Active ✓" : "Inactive"}
      </button>
      {error && <div className="text-[10px] text-red-400 px-1">{error}</div>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Warm-up config panel
// ═════════════════════════════════════════════════════════════════════════
function WarmupConfigPanel({
  config,
  teacherCount,
}: {
  config: WarmupConfig;
  teacherCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const modes = [
    { value: 1, label: "Solo", desc: "1 teacher · 9 photos" },
    { value: 3, label: "Trio", desc: "3 teachers · 3 each" },
    { value: 9, label: "Full", desc: "9 teachers · 1 each" },
  ] as const;

  function handleSelect(count: 1 | 3 | 9) {
    if (count === config.warmup_teacher_count) return;
    setError(null);
    startTransition(async () => {
      const res = await updateWarmupMode(count);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <section>
      <h2 className="text-lg font-bold mb-3 text-fuchsia-300">
        Warm-up mode
      </h2>
      <div className={`flex gap-2 ${pending ? "opacity-60 pointer-events-none" : ""}`}>
        {modes.map((m) => {
          const isActive = config.warmup_teacher_count === m.value;
          const disabled = m.value > teacherCount;
          return (
            <button
              key={m.value}
              onClick={() => handleSelect(m.value)}
              disabled={disabled}
              className={`flex-1 rounded-xl border p-3 text-center transition ${
                isActive
                  ? "border-fuchsia-400/40 bg-fuchsia-400/10"
                  : disabled
                    ? "border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed"
                    : "border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer"
              }`}
            >
              <div className={`text-lg font-bold ${isActive ? "text-fuchsia-300" : "text-white/60"}`}>
                {m.label}
              </div>
              <div className="text-[10px] text-white/40 mt-0.5">{m.desc}</div>
            </button>
          );
        })}
      </div>
      {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Rotation queue card
// ═════════════════════════════════════════════════════════════════════════
function RotationCard({
  teacher,
  isFirst,
  isLast,
}: {
  teacher: TeacherRow;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const rot = teacher.rotation!;

  const isRecruiting = rot.status === "recruiting";
  const isPaused = rot.status === "paused";

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok && "error" in res) setError(res.error as string);
    });
  }

  const name = teacher.display_name || teacher.username || "Unnamed";
  const totalStudents = teacher.classes.reduce((sum, c) => sum + c.student_count, 0);

  return (
    <div
      className={`rounded-xl border p-3 flex items-center gap-3 ${
        isRecruiting
          ? "border-emerald-400/40 bg-emerald-400/10"
          : isPaused
            ? "border-amber-400/30 bg-amber-400/5"
            : "border-white/10 bg-white/5"
      } ${pending ? "opacity-60 pointer-events-none" : ""}`}
    >
      {/* Order arrows */}
      <div className="flex flex-col gap-0.5">
        <button
          onClick={() => act(() => moveInRotation(teacher.id, "up"))}
          disabled={isFirst}
          className="text-white/40 hover:text-white disabled:opacity-20 text-xs leading-none"
        >▲</button>
        <button
          onClick={() => act(() => moveInRotation(teacher.id, "down"))}
          disabled={isLast}
          className="text-white/40 hover:text-white disabled:opacity-20 text-xs leading-none"
        >▼</button>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm truncate">{name}</span>
          <StatusBadge status={rot.status} />
        </div>
        <div className="text-xs text-white/50 mt-0.5">
          {teacher.classes.length}/{teacher.max_classes} classes
          {" · "}{totalStudents} students
          {" · "}{teacher.starters.filter(s => s.is_active).length}/{teacher.starters.length} photos active
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {!isRecruiting && (
          <SmallButton onClick={() => act(() => setRotationStatus(teacher.id, "recruiting"))} variant="green">
            Recruit
          </SmallButton>
        )}
        {isRecruiting && (
          <SmallButton onClick={() => act(() => setRotationStatus(teacher.id, "waiting"))} variant="default">
            Stop
          </SmallButton>
        )}
        {!isPaused && (
          <SmallButton onClick={() => act(() => setRotationStatus(teacher.id, "paused"))} variant="amber">
            Pause
          </SmallButton>
        )}
        {isPaused && (
          <SmallButton onClick={() => act(() => setRotationStatus(teacher.id, "waiting"))} variant="default">
            Unpause
          </SmallButton>
        )}
        <SmallButton onClick={() => act(() => removeFromRotation(teacher.id))} variant="red">
          Remove
        </SmallButton>
      </div>

      {error && <div className="text-xs text-red-400 mt-1 w-full">{error}</div>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Teacher roster card (bottom section)
// ═════════════════════════════════════════════════════════════════════════
function TeacherRosterCard({
  teacher,
  onSelect,
}: {
  teacher: TeacherRow;
  onSelect: () => void;
}) {
  const name = teacher.display_name || teacher.username || "Unnamed";
  const totalStudents = teacher.classes.reduce((sum, c) => sum + c.student_count, 0);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm truncate">{name}</span>
          {teacher.is_admin && (
            <span className="text-[10px] px-1 py-0.5 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300">
              admin
            </span>
          )}
          {teacher.rotation && <StatusBadge status={teacher.rotation.status} />}
        </div>
        <div className="text-xs text-white/50 mt-0.5">
          {teacher.classes.length}/{teacher.max_classes} classes
          {" · "}{totalStudents} students
          {" · "}{teacher.starters.length} photos
        </div>
      </div>
      <SmallButton onClick={onSelect} variant="default">
        Inspect
      </SmallButton>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Shared small components
// ═════════════════════════════════════════════════════════════════════════
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    recruiting: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    waiting: "bg-white/10 text-white/60 border-white/20",
    paused: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  };
  return (
    <span
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
        colors[status] || colors.waiting
      }`}
    >
      {status}
    </span>
  );
}

function SmallButton({
  children,
  onClick,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "green" | "red" | "amber";
}) {
  const base = "text-xs font-medium px-2.5 py-1 rounded-lg border transition";
  const variants: Record<string, string> = {
    default: "border-white/20 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white",
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20",
    red: "border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20",
  };
  return (
    <button onClick={onClick} className={`${base} ${variants[variant]}`}>
      {children}
    </button>
  );
}
