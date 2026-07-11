// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/admin/admin-client.tsx   (REPLACES existing file)
//
// Session 81 — Chunk 2 overhaul.
// Session 82 — Chunk C: Class request shows capacity + admin override.
//              Chunk E: Admin dashboard polish:
//   1. Overview: Active teachers, Inactive teachers, Mode, In rotation.
//   2. Current Classes: collapsible section.
//   3. Current Classes cards: round topics shown in collapsed header.
//   4. Archived classes: removed Unarchive button, added Download
//      spreadsheet button, hidden "pending" badge.
//   5. Teachers table: Classes column label clarified (active / max).
//   6. Topics: admin can approve/deny teacher-submitted topics.
//   7. Class detail: download spreadsheet (CSV with student data).
//
// Session 84 — Chunk D1: Game schedule split into game_phase_hours +
//   review_phase_hours. GameScheduleSection shows two duration pickers.
//   ClassCard detail shows game/review split. round_duration_hours is
//   computed as the sum for backward compat.
//
// NOTE: Tailwind grid-cols-N does NOT work in this project's build.
// All multi-column layouts use inline styles.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import React, { useState, useTransition } from "react";
import type { TeacherRow, ClassRow, StarterRow, WarmupConfig, GameSchedule, ClassRequestRow, TopicRow } from "./page";
import MessagePanel, { type MessageRow, type Recipient } from "@/components/MessagePanel";
import {
  updateMaxClasses,
  addToRotation,
  removeFromRotation,
  setRotationStatus,
  moveInRotation,
  togglePhotoActive,
  updateWarmupMode,
  saveGameSchedule,
  approveClassRequest,
  denyClassRequest,
  addTopic,
  updateTopicText,
  deleteTopic,
  setTopicStatus,
  archiveClass,
} from "./actions";

// ═════════════════════════════════════════════════════════════════════════
// Main component
// ═════════════════════════════════════════════════════════════════════════
export function AdminClient({
  teachers,
  warmupConfig,
  gameSchedule,
  topicOptions,
  classRequests,
  topics,
  msgMessages,
  msgRecipients,
  msgUnreadCount,
  msgUserId,
  willingTrioCount,
  willingNineCount,
}: {
  teachers: TeacherRow[];
  warmupConfig: WarmupConfig;
  gameSchedule: GameSchedule;
  topicOptions: string[];
  classRequests: ClassRequestRow[];
  topics: TopicRow[];
  msgMessages: MessageRow[];
  msgRecipients: Recipient[];
  msgUnreadCount: number;
  msgUserId: string;
  willingTrioCount: number;
  willingNineCount: number;
}) {
  const modeLabels: Record<number, string> = { 1: "Solo", 3: "Trio", 9: "Full" };

  // Chunk E: overview stats
  const activeTeachers = teachers.filter((t) => !t.is_archived).length;
  const inactiveTeachers = teachers.filter((t) => t.is_archived).length;
  const inRotation = teachers.filter((t) => t.rotation !== null).length;

  const seededTopics = topics.filter((t) => !t.suggested_by);
  const teacherTopics = topics.filter((t) => !!t.suggested_by);

  // Collect all classes across all teachers
  const allClasses = teachers.flatMap((t) => t.classes);
  const activeClasses = allClasses.filter((c) => !c.is_archived);
  const archivedClasses = allClasses.filter((c) => c.is_archived);

  return (
    <div className="space-y-4">
      {/* ─── HEADER ─────────────────────────────────────────────── */}
      <h1 className="text-2xl font-bold bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
        Admin
      </h1>

      {/* ─── 1. OVERVIEW (Chunk E: revised stats) ──────────────── */}
      <SectionLabel text="Overview" />
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <StatItem label="Active teachers" value={activeTeachers} />
        {inactiveTeachers > 0 && (
          <StatItem label="Inactive teachers" value={inactiveTeachers} color="text-white/40" />
        )}
        <StatItem label="Mode" value={modeLabels[warmupConfig.warmup_teacher_count]} />
        <StatItem label="In rotation" value={inRotation} color="text-violet-300" />
      </div>

      {/* ─── 2. MESSAGES ────────────────────────────────────────── */}
      <SectionLabel text="Messages" />
      <div>
        <MessagePanel
          messages={msgMessages}
          recipients={msgRecipients}
          unreadCount={msgUnreadCount}
          currentUserId={msgUserId}
          theme="dark"
        />
      </div>

      {/* ─── 3. WARM-UP CONTROL ─────────────────────────────────── */}
      <SectionLabel text="Warm-up control" />
      <WarmupBlock config={warmupConfig} teachers={teachers} />

      {/* ─── 3a. GAME SCHEDULE (D1: game/review split) ──────────── */}
      {warmupConfig.warmup_teacher_count > 1 && (
        <>
          <SectionLabel text="Game schedule" />
          <GameScheduleSection
            schedule={gameSchedule}
            topicOptions={topicOptions}
          />
        </>
      )}

      {/* ─── 3b. GAME TOPICS (session 79 + Chunk E: approve/deny) ─ */}
      <SectionLabel text="Game topics" />
      <TopicsSection seededTopics={seededTopics} teacherTopics={teacherTopics} />

      {/* ─── 4. TEACHERS (collapsible, merged table) ─────────────── */}
      <SectionLabel text="Teachers" />
      <TeacherSection
        teachers={teachers}
        classRequests={classRequests}
      />

      {/* ─── 5. CURRENT CLASSES (Chunk E: collapsible) ──────────── */}
      <SectionLabel text="Current classes" />
      <CurrentClassesSection
        activeClasses={activeClasses}
        archivedClasses={archivedClasses}
        teachers={teachers}
      />
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
}: {
  config: WarmupConfig;
  teachers: TeacherRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const modeLabels: Record<number, string> = { 1: "Solo (1)", 3: "Trio (3)", 9: "Full (9)" };
  const recruiting = teachers.find((t) => t.rotation?.status === "recruiting");
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

  return (
    <div className={`rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden ${pending ? "opacity-60 pointer-events-none" : ""}`}>
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10">
        <span className={`w-2 h-2 rounded-full ${isLive ? "bg-emerald-400 animate-pulse" : "bg-white/20"}`} />
        <span className="text-xs font-medium">{isLive ? "Live" : "Off"}</span>
        {recruiting && (
          <span className="text-xs text-white/40">
            {recruiting.display_name || recruiting.username} is recruiting
          </span>
        )}
      </div>
      <div className="px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-white/30">Mode</span>
          <select
            value={config.warmup_teacher_count}
            onChange={(e) => handleModeChange(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white"
          >
            {[1, 3, 9].map((n) => (
              <option key={n} value={n} className="bg-gray-900">{modeLabels[n]}</option>
            ))}
          </select>
        </div>
        {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Teachers section — collapsible, merged table with rotation ↑↓
// ═════════════════════════════════════════════════════════════════════════
function TeacherSection({
  teachers,
  classRequests,
}: {
  teachers: TeacherRow[];
  classRequests: ClassRequestRow[];
}) {
  const [showSection, setShowSection] = useState(false);

  const inRotation = teachers
    .filter((t) => t.rotation !== null)
    .sort((a, b) => a.rotation!.sort_order - b.rotation!.sort_order);
  const notInRotation = teachers.filter((t) => t.rotation === null);
  const sorted = [...inRotation, ...notInRotation];

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <button
        onClick={() => setShowSection(!showSection)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium">
            {teachers.length} teacher{teachers.length !== 1 ? "s" : ""}
          </span>
          <span className="text-[10px] text-white/40">
            {inRotation.length} in rotation
          </span>
        </div>
        <span className="text-white/20 text-[10px]">{showSection ? "Close teachers" : "See teachers"}</span>
      </button>

      {showSection && (
        <div className="border-t border-white/10">
          <TeacherTable
            teachers={sorted}
            classRequests={classRequests}
            inRotationCount={inRotation.length}
          />
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Teacher table
// Chunk E: Classes column header → "Active / Max" for clarity
// Chunk C: Request column shows capacity + override
// ═════════════════════════════════════════════════════════════════════════
function TeacherTable({
  teachers,
  classRequests,
  inRotationCount,
}: {
  teachers: TeacherRow[];
  classRequests: ClassRequestRow[];
  inRotationCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingMaxId, setEditingMaxId] = useState<string | null>(null);
  const [maxVal, setMaxVal] = useState("");
  const [capOverrides, setCapOverrides] = useState<Record<string, number>>({});

  function act(fn: () => Promise<any>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res && !res.ok) setError(res.error);
    });
  }

  function handleSaveMax(teacherId: string) {
    const n = parseInt(maxVal, 10);
    if (isNaN(n) || n < 1) { setError("Must be at least 1."); return; }
    act(async () => {
      const res = await updateMaxClasses(teacherId, n);
      if (res.ok) setEditingMaxId(null);
      return res;
    });
  }

  const pendingByTeacher = new Map<string, ClassRequestRow[]>();
  classRequests.filter((r) => r.status === "pending").forEach((r) => {
    const list = pendingByTeacher.get(r.teacher_id) || [];
    list.push(r);
    pendingByTeacher.set(r.teacher_id, list);
  });

  return (
    <div className={`text-xs ${pending ? "opacity-60 pointer-events-none" : ""}`}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr className="border-b border-white/10 text-white/40">
            <th className="text-center font-medium py-2 px-1" style={{ width: 28 }}>#</th>
            <th className="text-left font-medium py-2 px-2">Name</th>
            <th className="text-center font-medium py-2 px-1" title="Active classes / Max allowed">Active / Max</th>
            <th className="text-center font-medium py-2 px-1">Mode</th>
            <th className="text-center font-medium py-2 px-1">Request</th>
            <th className="text-center font-medium py-2 px-1">Actions</th>
          </tr>
        </thead>
        <tbody>
          {teachers.map((t, idx) => {
            const name = t.display_name || t.username || "Unnamed";
            const inQueue = t.rotation !== null;
            const isRecruiting = t.rotation?.status === "recruiting";
            const teacherPending = pendingByTeacher.get(t.id) || [];
            const showSeparator = idx === inRotationCount && inRotationCount > 0;
            const activeClassCount = t.classes.filter((c) => !c.is_archived).length;

            return (
              <React.Fragment key={t.id}>
                {showSeparator && (
                  <tr>
                    <td colSpan={6} className="px-3 py-1">
                      <div className="border-t border-white/10 text-[9px] text-white/20 uppercase tracking-wider pt-1">
                        Not in rotation
                      </div>
                    </td>
                  </tr>
                )}
                <tr className="border-b border-white/5 last:border-0">
                  <td className="text-center text-white/25 py-1.5 px-1">
                    {inQueue ? idx + 1 : "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        isRecruiting ? "bg-emerald-400"
                          : inQueue ? "bg-amber-400"
                          : "bg-white/15"
                      }`} />
                      <span className="text-white/80">{name}</span>
                      {t.is_admin && (
                        <span className="text-[8px] px-1 rounded bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20">
                          admin
                        </span>
                      )}
                      {inQueue && <StatusBadge status={t.rotation!.status} />}
                    </div>
                  </td>
                  {/* Classes: active / max (Chunk E: clarified) */}
                  <td className="text-center py-1.5 px-1">
                    {editingMaxId === t.id ? (
                      <div style={{ display: "flex", gap: 3, alignItems: "center", justifyContent: "center" }}>
                        <input
                          type="number" min={1} max={50} value={maxVal}
                          onChange={(e) => setMaxVal(e.target.value)}
                          className="w-10 rounded bg-white/10 border border-white/20 px-1 py-0.5 text-xs text-white text-center"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveMax(t.id); if (e.key === "Escape") setEditingMaxId(null); }}
                        />
                        <Pill onClick={() => handleSaveMax(t.id)} variant="green">✓</Pill>
                        <Pill onClick={() => setEditingMaxId(null)} variant="default">✕</Pill>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingMaxId(t.id); setMaxVal(String(t.max_classes)); }}
                        className="text-white/40 hover:text-white/70 transition"
                        title={`${activeClassCount} active class${activeClassCount !== 1 ? "es" : ""} / ${t.max_classes} max — click to edit max`}
                      >
                        {activeClassCount} / {t.max_classes}
                      </button>
                    )}
                  </td>
                  <td className="text-center py-1.5 px-1">
                    <div style={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap" }}>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-white/5 text-white/30 border border-white/10">S</span>
                      {t.willing_trio && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/20">T</span>
                      )}
                      {t.willing_nine && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/20">9</span>
                      )}
                    </div>
                  </td>
                  {/* Request — Chunk C: capacity + override */}
                  <td className="text-center py-1.5 px-1">
                    {teacherPending.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
                        {teacherPending[0].class_name && (
                          <span className="text-[9px] text-white/50 italic truncate" style={{ maxWidth: 110 }}>
                            &ldquo;{teacherPending[0].class_name}&rdquo;
                          </span>
                        )}
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <select
                            value={capOverrides[teacherPending[0].id] ?? teacherPending[0].requested_capacity ?? 9}
                            onChange={(e) => setCapOverrides((prev) => ({
                              ...prev,
                              [teacherPending[0].id]: Number(e.target.value),
                            }))}
                            className="rounded bg-white/10 border border-white/20 px-1 py-0.5 text-[9px] text-white"
                            title="Class size (override if needed)"
                          >
                            <option value={9} className="bg-gray-900">9</option>
                            <option value={16} className="bg-gray-900">16</option>
                            <option value={25} className="bg-gray-900">25</option>
                          </select>
                          <span className="text-[8px] text-white/20">seats</span>
                        </div>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                          <button
                            onClick={() => {
                              const cap = capOverrides[teacherPending[0].id];
                              const reqCap = teacherPending[0].requested_capacity ?? 9;
                              const override = cap != null && cap !== reqCap ? cap : undefined;
                              act(() => approveClassRequest(teacherPending[0].id, override));
                            }}
                            className="text-[9px] px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition"
                          >Approve</button>
                          <button
                            onClick={() => act(() => denyClassRequest(teacherPending[0].id))}
                            className="text-[9px] px-1.5 py-0.5 rounded border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition"
                          >Deny</button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-white/20">—</span>
                    )}
                  </td>
                  <td className="text-center py-1.5 px-1">
                    <div style={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap" }}>
                      {inQueue ? (
                        <>
                          <Pill onClick={() => act(() => moveInRotation(t.id, "up"))} variant="default">↑</Pill>
                          <Pill onClick={() => act(() => moveInRotation(t.id, "down"))} variant="default">↓</Pill>
                          {isRecruiting ? (
                            <Pill onClick={() => act(() => setRotationStatus(t.id, "waiting"))} variant="amber">Pause</Pill>
                          ) : (
                            <Pill onClick={() => act(() => setRotationStatus(t.id, "recruiting"))} variant="green">Recruit</Pill>
                          )}
                          <Pill onClick={() => act(() => removeFromRotation(t.id))} variant="red">✕</Pill>
                        </>
                      ) : (
                        <Pill onClick={() => act(() => addToRotation(t.id))} variant="green">Add</Pill>
                      )}
                    </div>
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      {error && <div className="text-xs text-red-400 px-3 py-1.5">{error}</div>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Current Classes section — Chunk E: collapsible
// ═════════════════════════════════════════════════════════════════════════
function CurrentClassesSection({
  activeClasses,
  archivedClasses,
  teachers,
}: {
  activeClasses: ClassRow[];
  archivedClasses: ClassRow[];
  teachers: TeacherRow[];
}) {
  const [showSection, setShowSection] = useState(false);

  const teacherStartersMap = new Map<string, StarterRow[]>();
  teachers.forEach((t) => {
    const name = t.display_name || t.username || "Unnamed";
    teacherStartersMap.set(name, t.starters);
  });

  if (activeClasses.length === 0 && archivedClasses.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-white/25 text-xs">
        No classes yet
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <button
        onClick={() => setShowSection(!showSection)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium">
            {activeClasses.length} active class{activeClasses.length !== 1 ? "es" : ""}
          </span>
          {archivedClasses.length > 0 && (
            <span className="text-[10px] text-white/40">
              {archivedClasses.length} archived
            </span>
          )}
        </div>
        <span className="text-white/20 text-[10px]">{showSection ? "Close classes" : "See classes"}</span>
      </button>

      {showSection && (
        <div className="border-t border-white/10 p-2 space-y-2">
          {activeClasses.map((c) => (
            <ClassCard
              key={c.id}
              cls={c}
              starters={teacherStartersMap.get(c.teacher_name) || []}
              isArchived={false}
            />
          ))}
          {archivedClasses.length > 0 && (
            <>
              <div className="text-[10px] text-white/25 uppercase tracking-wider pt-3 pb-1 px-1">
                Archived ({archivedClasses.length})
              </div>
              {archivedClasses.map((c) => (
                <ClassCard
                  key={c.id}
                  cls={c}
                  starters={teacherStartersMap.get(c.teacher_name) || []}
                  isArchived={true}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// CSV download helper
// ═════════════════════════════════════════════════════════════════════════
function downloadClassSpreadsheet(c: ClassRow) {
  const rows: string[][] = [];
  rows.push(["Class Name", "Teacher", "Capacity", "Students Enrolled"]);
  rows.push([c.name, c.teacher_name, String(c.capacity), String(c.student_count)]);
  rows.push([]);

  // Round topics
  const topicEntries = c.round_topics
    ? Object.entries(c.round_topics).filter(([, v]) => v != null).sort(([a], [b]) => Number(a) - Number(b))
    : [];
  if (topicEntries.length > 0) {
    rows.push(["Round", "Topic"]);
    topicEntries.forEach(([round, topic]) => {
      rows.push([`Round ${round}`, topic || ""]);
    });
    rows.push([]);
  }

  // Game info
  if (c.game) {
    rows.push(["Game", "Status", "Rounds"]);
    rows.push([c.game.name, c.game.status, String(c.game.round_count)]);
    rows.push([]);
  }

  // Students
  rows.push(["Student Name", "Username", "Email"]);
  c.students.forEach((s) => {
    rows.push([
      s.display_name || "",
      s.username || "",
      s.email || "",
    ]);
  });

  const csvContent = rows.map((row) =>
    row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")
  ).join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${c.name.replace(/[^a-zA-Z0-9]/g, "_")}_roster.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ═════════════════════════════════════════════════════════════════════════
// Duration label helper — D1: shows game + review split when available
// ═════════════════════════════════════════════════════════════════════════
function formatDuration(hours: number | null): string {
  if (hours == null) return "";
  if (hours === 0) return "none";
  const labels: Record<string, string> = {
    "0.25": "15 min", "0.5": "30 min", "1": "1 hr", "1.5": "90 min",
    "2": "2 hr", "5": "5 hr", "22": "22 hr", "24": "1 day",
    "46": "46 hr", "48": "2 days", "144": "6 days", "168": "1 week",
  };
  return labels[String(hours)] || `${hours}h`;
}

function formatRoundDuration(c: ClassRow): string {
  if (c.game_phase_hours != null && c.review_phase_hours != null) {
    return `${formatDuration(c.game_phase_hours)} game + ${formatDuration(c.review_phase_hours)} review`;
  }
  if (c.round_duration_hours != null) {
    return `${formatDuration(c.round_duration_hours)} per round`;
  }
  return "";
}

// ═════════════════════════════════════════════════════════════════════════
// Class card — Chunk E updates + D1: game/review duration display
// ═════════════════════════════════════════════════════════════════════════
function ClassCard({
  cls: c,
  starters,
  isArchived,
}: {
  cls: ClassRow;
  starters: StarterRow[];
  isArchived: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showDeck, setShowDeck] = useState(false);
  const [pending, startTransition] = useTransition();

  const topicEntries = c.round_topics
    ? Object.entries(c.round_topics).filter(([, v]) => v != null).sort(([a], [b]) => Number(a) - Number(b))
    : [];

  const durationDisplay = formatRoundDuration(c);

  const pendingPhotos = starters.filter((s) => !s.is_active).length;
  const activePhotos = starters.filter((s) => s.is_active).length;

  function handleArchive() {
    startTransition(async () => {
      await archiveClass(c.id);
    });
  }

  return (
    <div className={`rounded-lg border overflow-hidden ${
      isArchived ? "border-white/5 opacity-60" : "border-white/10"
    } ${pending ? "opacity-30 pointer-events-none" : ""}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/5 transition text-xs"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">{c.name}</span>
          <span className="text-white/30 flex-shrink-0">{c.student_count}/{c.capacity}</span>
          <span className="text-[10px] text-white/30 flex-shrink-0">— {c.teacher_name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isArchived && (
            <span className="text-[9px] font-medium px-1 py-0.5 rounded border border-white/15 bg-white/5 text-white/40">
              archived
            </span>
          )}
          {c.game && (
            <span className={`text-[9px] font-medium px-1 py-0.5 rounded border ${
              c.game.status === "active" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : c.game.status === "complete" ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
              : "border-white/20 bg-white/5 text-white/50"
            }`}>{c.game.status} · {c.game.round_count}R</span>
          )}
          {topicEntries.length > 0 && (
            <span className="text-[9px] px-1 py-0.5 rounded border border-violet-500/20 bg-violet-500/10 text-violet-300">
              {topicEntries.length} topic{topicEntries.length !== 1 ? "s" : ""}
            </span>
          )}
          {/* Chunk E: hide pending badge on archived classes */}
          {!isArchived && pendingPhotos > 0 && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/20">
              {pendingPhotos} pending
            </span>
          )}
          <span className="text-white/20 text-[10px]">{open ? "Close details" : "See details"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-white/10 px-3 pb-3">
          {/* Game info — D1: shows game/review split */}
          <div className="text-[10px] text-white/40 py-2" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {c.total_rounds != null && <span>{c.total_rounds} rounds</span>}
            {durationDisplay && <span>{durationDisplay}</span>}
            {c.game_starts_at && (
              <span>Starts {new Date(c.game_starts_at).toLocaleString()}</span>
            )}
            {c.game && <span>{c.game.name} · {c.game.status}</span>}
          </div>

          {/* Round topics */}
          {topicEntries.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] text-white/30 mb-1">Round topics</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {topicEntries.map(([round, topic]) => (
                  <span key={round} className="text-[10px] bg-violet-500/10 text-violet-300 border border-violet-500/15 rounded px-1.5 py-0.5">
                    R{round}: {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Students with emails */}
          <div className="mb-2">
            <div className="text-[10px] text-white/30 mb-1">
              Students ({c.students.length})
            </div>
            {c.students.length === 0 ? (
              <p className="text-[10px] text-white/20">No students enrolled.</p>
            ) : (
              <div className="space-y-0.5">
                {c.students.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-[11px]">
                    <span className="text-white/60">
                      {s.display_name || s.username || s.id.slice(0, 8)}
                    </span>
                    {s.email && (
                      <span className="text-white/25">{s.email}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Deck photos — only for active classes */}
          {!isArchived && starters.length > 0 && (
            <div className="mb-2">
              <button
                onClick={() => setShowDeck(!showDeck)}
                className="text-[10px] text-white/40 hover:text-white/60 transition"
              >
                Deck: {activePhotos} approved{pendingPhotos > 0 ? `, ${pendingPhotos} pending` : ""}
                <span className="ml-1 text-white/20">{showDeck ? "▾" : "▸"}</span>
              </button>
              {showDeck && (
                <div className="space-y-2 mt-2">
                  {starters.filter((s) => !s.is_active).length > 0 && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] uppercase tracking-wider text-amber-300 font-medium">
                          Pending ({starters.filter((s) => !s.is_active).length})
                        </span>
                        <div className="flex-1 border-t border-amber-500/20" />
                      </div>
                      {starters.filter((s) => !s.is_active).map((s) => (
                        <PhotoCard key={s.id} starter={s} />
                      ))}
                    </>
                  )}
                  {starters.filter((s) => s.is_active).length > 0 && (
                    <>
                      {starters.filter((s) => !s.is_active).length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] uppercase tracking-wider text-emerald-300/60 font-medium">
                            Approved ({starters.filter((s) => s.is_active).length})
                          </span>
                          <div className="flex-1 border-t border-emerald-500/15" />
                        </div>
                      )}
                      {starters.filter((s) => s.is_active).map((s) => (
                        <PhotoCard key={s.id} starter={s} />
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Footer: archive (active only) + download */}
          <div className="pt-2 border-t border-white/5 flex justify-end gap-2">
            <button
              onClick={() => downloadClassSpreadsheet(c)}
              className="text-[10px] font-medium px-2 py-0.5 rounded-md border transition border-white/15 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
            >
              Download spreadsheet
            </button>
            {!isArchived && (
              <button
                onClick={handleArchive}
                disabled={pending}
                className={`text-[10px] font-medium px-2 py-0.5 rounded-md border transition border-white/15 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60 ${pending ? "opacity-30" : ""}`}
              >
                Archive
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// PhotoCard — unchanged from session 75
// ═════════════════════════════════════════════════════════════════════════
function PhotoCard({ starter }: { starter: StarterRow }) {
  const [pending, startTransition] = useTransition();
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isPendingApproval = !starter.is_active;

  function handleApprove() {
    setError(null);
    setShowRejectInput(false);
    startTransition(async () => {
      const res = await togglePhotoActive(starter.id, true);
      if (!res.ok) setError(res.error);
    });
  }

  function handleRejectSubmit() {
    const note = rejectNote.trim();
    if (note.length === 0) {
      setError("Write a note so the teacher knows why.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await togglePhotoActive(starter.id, false, note);
      if (!res.ok) setError(res.error);
      else { setShowRejectInput(false); setRejectNote(""); }
    });
  }

  function handleDeactivate() {
    setError(null);
    startTransition(async () => {
      const res = await togglePhotoActive(starter.id, false);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className={`rounded-lg border overflow-hidden ${
      isPendingApproval
        ? "border-amber-500/30 bg-amber-500/[0.03]"
        : "border-emerald-400/30"
    } ${pending ? "opacity-30 pointer-events-none" : ""}`}>
      <div style={{ display: "flex", gap: 0 }}>
        <div style={{ width: 72, height: 72, flexShrink: 0, position: "relative", background: "rgba(255,255,255,0.03)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={starter.media_url}
            alt={starter.description_text || "Warm-up photo"}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          <div style={{
            position: "absolute", top: 2, right: 2, width: 14, height: 14,
            borderRadius: "50%",
            background: isPendingApproval ? "rgba(245,158,11,0.85)" : "rgba(16,185,129,0.8)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 7, color: "white", fontWeight: "bold" }}>
              {isPendingApproval ? "?" : "✓"}
            </span>
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "6px 8px" }}>
          {starter.description_text ? (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, margin: 0 }}>
              {starter.description_text}
            </p>
          ) : (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", margin: 0 }}>No description</p>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 4 }}>
            {isPendingApproval ? (
              <>
                <button
                  onClick={handleApprove}
                  className="text-[9px] font-medium px-2 py-0.5 rounded transition bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/20"
                >Approve</button>
                <button
                  onClick={() => { setShowRejectInput(!showRejectInput); setError(null); }}
                  className="text-[9px] font-medium px-2 py-0.5 rounded transition bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/20"
                >{showRejectInput ? "Cancel" : "Reject"}</button>
              </>
            ) : (
              <>
                <span className="text-[9px] font-medium px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                  Active ✓
                </span>
                <button
                  onClick={handleDeactivate}
                  className="text-[9px] font-medium px-2 py-0.5 rounded transition bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/50"
                >Deactivate</button>
              </>
            )}
          </div>
        </div>
      </div>

      {showRejectInput && (
        <div style={{ padding: "6px 8px", borderTop: "1px solid rgba(239,68,68,0.15)", background: "rgba(239,68,68,0.03)" }}>
          <textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Tell the teacher why this photo can't be used…"
            rows={2}
            maxLength={500}
            className="w-full rounded border border-red-500/20 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-red-400 placeholder:text-white/20"
            autoFocus
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 4 }}>
            <button
              onClick={() => { setShowRejectInput(false); setRejectNote(""); setError(null); }}
              className="text-[9px] px-2 py-0.5 rounded border border-white/10 text-white/40 hover:bg-white/5"
            >Cancel</button>
            <button
              onClick={handleRejectSubmit}
              className="text-[9px] font-medium px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/20 hover:bg-red-500/25"
            >Send rejection note</button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: "4px 8px", borderTop: "1px solid rgba(239,68,68,0.1)" }}>
          <p className="text-[10px] text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Game topics — Chunk E: approve/deny for teacher-submitted topics
// ═════════════════════════════════════════════════════════════════════════
function TopicsSection({
  seededTopics,
  teacherTopics,
}: {
  seededTopics: TopicRow[];
  teacherTopics: TopicRow[];
}) {
  const [showSection, setShowSection] = useState(false);

  const pendingTeacherTopics = teacherTopics.filter((t) => t.status === "pending");
  const approvedTeacherTopics = teacherTopics.filter((t) => t.status === "approved");

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <button
        onClick={() => setShowSection(!showSection)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium">
            {seededTopics.length} starter topic{seededTopics.length !== 1 ? "s" : ""}
          </span>
          {teacherTopics.length > 0 && (
            <span className="text-[10px] text-white/40">
              + {teacherTopics.length} teacher-created
              {pendingTeacherTopics.length > 0 && (
                <span className="text-amber-300 ml-1">({pendingTeacherTopics.length} pending)</span>
              )}
            </span>
          )}
        </div>
        <span className="text-white/20 text-[10px]">{showSection ? "Close topics" : "See topics"}</span>
      </button>

      {showSection && (
        <div className="border-t border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-wider text-white/30 font-medium">Starter topics</span>
            <div className="flex-1 border-t border-white/5" />
          </div>
          {seededTopics.length === 0 ? (
            <p className="text-[10px] text-white/30 mb-3">No starter topics.</p>
          ) : (
            <div className="space-y-1 mb-3">
              {seededTopics.map((t) => (
                <TopicRowItem key={t.id} topic={t} editable showApproval={false} />
              ))}
            </div>
          )}

          <AddTopicInput />

          {teacherTopics.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-2 mt-4">
                <span className="text-[10px] uppercase tracking-wider text-white/30 font-medium">Teacher-created</span>
                <div className="flex-1 border-t border-white/5" />
              </div>
              <div className="space-y-1">
                {teacherTopics.map((t) => (
                  <TopicRowItem key={t.id} topic={t} editable={false} showApproval={true} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TopicRowItem({ topic, editable, showApproval }: { topic: TopicRow; editable: boolean; showApproval: boolean }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(topic.topic_text);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const trimmed = editVal.trim();
    if (trimmed.length === 0) { setError("Cannot be empty."); return; }
    if (trimmed === topic.topic_text) { setEditing(false); return; }
    setError(null);
    startTransition(async () => {
      const res = await updateTopicText(topic.id, trimmed);
      if (!res.ok) setError(res.error);
      else setEditing(false);
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteTopic(topic.id);
      if (!res.ok) setError(res.error);
    });
  }

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const res = await setTopicStatus(topic.id, "approved");
      if (!res.ok) setError(res.error);
    });
  }

  function handleDeny() {
    setError(null);
    startTransition(async () => {
      const res = await deleteTopic(topic.id);
      if (!res.ok) setError(res.error);
    });
  }

  const isPending = topic.status === "pending";

  return (
    <div className={`${pending ? "opacity-30 pointer-events-none" : ""}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 28 }}>
        {editing ? (
          <>
            <input
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              maxLength={100}
              className="flex-1 rounded bg-white/10 border border-white/20 px-2 py-1 text-xs text-white outline-none focus:border-fuchsia-400"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") { setEditing(false); setEditVal(topic.topic_text); } }}
            />
            <Pill onClick={handleSave} variant="green">Save</Pill>
            <Pill onClick={() => { setEditing(false); setEditVal(topic.topic_text); setError(null); }} variant="default">Cancel</Pill>
          </>
        ) : (
          <>
            <span className={`flex-1 text-xs ${isPending ? "text-amber-200/70" : "text-white/70"}`}>{topic.topic_text}</span>
            {isPending && (
              <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/20">
                pending
              </span>
            )}
            {topic.suggested_by_name && (
              <span className="text-[9px] text-white/25">by {topic.suggested_by_name}</span>
            )}
            {/* Chunk E: approve/deny for teacher topics */}
            {showApproval && isPending && (
              <>
                <Pill onClick={handleApprove} variant="green">Approve</Pill>
                <Pill onClick={handleDeny} variant="red">Deny</Pill>
              </>
            )}
            {editable && (
              <Pill onClick={() => setEditing(true)} variant="default">Edit</Pill>
            )}
            <Pill onClick={handleDelete} variant="red">Delete</Pill>
          </>
        )}
      </div>
      {error && <p className="text-[10px] text-red-400 mt-0.5 ml-1">{error}</p>}
    </div>
  );
}

function AddTopicInput() {
  const [pending, startTransition] = useTransition();
  const [val, setVal] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    const trimmed = val.trim();
    if (trimmed.length === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await addTopic(trimmed);
      if (!res.ok) setError(res.error);
      else setVal("");
    });
  }

  return (
    <div className={`${pending ? "opacity-30 pointer-events-none" : ""}`}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="Add a starter topic…"
          maxLength={100}
          className="flex-1 rounded bg-white/10 border border-white/20 px-2 py-1 text-xs text-white outline-none focus:border-fuchsia-400 placeholder:text-white/20"
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
        />
        <Pill onClick={handleAdd} variant="green">Add</Pill>
      </div>
      {error && <p className="text-[10px] text-red-400 mt-0.5 ml-1">{error}</p>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Game schedule section — D1: game_phase_hours + review_phase_hours
//
// Replaces the single "Round duration" dropdown with two pickers:
//   "Game time" — how long students can submit
//   "Review time" — how long teacher has to review after submissions close
// round_duration_hours is computed as the sum for backward compat.
// ═════════════════════════════════════════════════════════════════════════

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

function GameScheduleSection({
  schedule,
  topicOptions,
}: {
  schedule: GameSchedule;
  topicOptions: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const [totalRounds, setTotalRounds] = useState(schedule.game_total_rounds ?? 3);

  // D1: separate game/review state. Fall back to old round_duration_hours
  // if the new fields haven't been set yet.
  const [gamePhaseHours, setGamePhaseHours] = useState(() => {
    if (schedule.game_phase_hours != null) return String(schedule.game_phase_hours);
    if (schedule.game_round_duration_hours != null) return String(schedule.game_round_duration_hours);
    return "24";
  });
  const [reviewPhaseHours, setReviewPhaseHours] = useState(() => {
    if (schedule.review_phase_hours != null) return String(schedule.review_phase_hours);
    return "0";
  });

  const [startLocal, setStartLocal] = useState(() => {
    if (!schedule.game_starts_at) return "";
    const d = new Date(schedule.game_starts_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  const [roundTopics, setRoundTopics] = useState<Record<string, string>>(() => {
    const rt: Record<string, string> = {};
    const rounds = schedule.game_total_rounds ?? 3;
    for (let r = 1; r <= rounds; r++) {
      rt[String(r)] = schedule.game_round_topics?.[String(r)] || "";
    }
    return rt;
  });

  const handleRoundsChange = (val: string) => {
    const n = parseInt(val, 10);
    const clamped = Number.isFinite(n) ? Math.max(1, Math.min(100, n)) : 1;
    setTotalRounds(clamped);
    setRoundTopics((prev) => {
      const next = { ...prev };
      for (let r = 1; r <= clamped; r++) {
        if (!(String(r) in next)) next[String(r)] = "";
      }
      return next;
    });
  };

  const roundTopicsJson = JSON.stringify(
    Object.fromEntries(
      Array.from({ length: totalRounds }, (_, i) => {
        const r = String(i + 1);
        const val = roundTopics[r]?.trim() || null;
        return [r, val];
      }),
    ),
  );

  // D1: compute total for display
  const totalHours = parseFloat(gamePhaseHours) + parseFloat(reviewPhaseHours);
  const totalLabel = formatDuration(totalHours) || `${totalHours}h total`;

  function handleSave() {
    setResult(null);
    const fd = new FormData();
    fd.set("total_rounds", String(totalRounds));
    fd.set("game_phase_hours", gamePhaseHours);
    fd.set("review_phase_hours", reviewPhaseHours);
    fd.set("game_starts_at", startLocal);
    fd.set("round_topics", roundTopicsJson);
    startTransition(async () => {
      const res = await saveGameSchedule(fd);
      if (res.ok) {
        setResult("Saved and pushed to all classes.");
        setTimeout(() => setResult(null), 4000);
      } else {
        setResult(res.error);
      }
    });
  }

  const isError = result && !result.startsWith("Saved");

  return (
    <div className={`rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden ${pending ? "opacity-60 pointer-events-none" : ""}`}>
      <div className="px-4 py-3">
        <p className="text-[10px] text-white/30 mb-3">
          These settings apply to all active classes in multi-teacher mode.
          Saving pushes to every active class.
        </p>

        {/* D1: 4 columns — Rounds, Game time, Review time, Starts at */}
        <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1fr 1fr 1.5fr", gap: 10, marginBottom: 12 }}>
          <div>
            <label className="text-[10px] text-white/40 font-medium block mb-1">Rounds</label>
            <input
              type="number"
              value={totalRounds}
              onChange={(e) => handleRoundsChange(e.target.value)}
              min={1}
              max={100}
              className="w-full rounded bg-white/10 border border-white/20 px-2 py-1.5 text-xs text-white outline-none focus:border-fuchsia-400"
            />
          </div>
          <div>
            <label className="text-[10px] text-white/40 font-medium block mb-1">Game time</label>
            <select
              value={gamePhaseHours}
              onChange={(e) => setGamePhaseHours(e.target.value)}
              className="w-full rounded bg-white/10 border border-white/20 px-2 py-1.5 text-xs text-white outline-none focus:border-fuchsia-400"
            >
              {GAME_TIME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-gray-900">{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-white/40 font-medium block mb-1">Review time</label>
            <select
              value={reviewPhaseHours}
              onChange={(e) => setReviewPhaseHours(e.target.value)}
              className="w-full rounded bg-white/10 border border-white/20 px-2 py-1.5 text-xs text-white outline-none focus:border-fuchsia-400"
            >
              {REVIEW_TIME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-gray-900">{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-white/40 font-medium block mb-1">Starts at</label>
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className="w-full rounded bg-white/10 border border-white/20 px-2 py-1.5 text-xs text-white outline-none focus:border-fuchsia-400"
            />
          </div>
        </div>

        {/* D1: total round duration hint */}
        <p className="text-[10px] text-white/25 mb-3" style={{ marginTop: -4 }}>
          Total round duration: {totalLabel}
        </p>

        {topicOptions.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label className="text-[10px] text-white/40 font-medium block mb-1">
              Round topics
              <span className="text-white/20 font-normal ml-1">(optional)</span>
            </label>
            <div style={{
              display: "grid",
              gridTemplateColumns: totalRounds <= 3
                ? `repeat(${totalRounds}, 1fr)`
                : totalRounds <= 6
                  ? "repeat(3, 1fr)"
                  : "repeat(4, 1fr)",
              gap: 6,
            }}>
              {Array.from({ length: totalRounds }, (_, i) => i + 1).map((r) => (
                <div key={r}>
                  <span className="text-[9px] text-white/25 block mb-0.5">R{r}</span>
                  <select
                    value={roundTopics[String(r)] || ""}
                    onChange={(e) => setRoundTopics((prev) => ({ ...prev, [String(r)]: e.target.value }))}
                    className="w-full rounded bg-white/10 border border-white/20 px-1.5 py-1 text-[11px] text-white outline-none focus:border-fuchsia-400"
                  >
                    <option value="" className="bg-gray-900">(No topic)</option>
                    {topicOptions.map((t) => (
                      <option key={t} value={t} className="bg-gray-900">{t}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={pending}
            className="text-xs font-bold px-4 py-1.5 rounded-full bg-fuchsia-600 text-white hover:bg-fuchsia-500 transition disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save & push to all classes"}
          </button>
          {result && (
            <span className={`text-[11px] font-medium ${isError ? "text-red-400" : "text-emerald-300"}`}>
              {result}
            </span>
          )}
        </div>
      </div>
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
