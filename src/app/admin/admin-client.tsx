// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/admin/admin-client.tsx   (REPLACES existing file)
//
// Session 91: Aesthetic + functional fixes:
//   1. "Total round duration" text: visible (was white-on-beige).
//   2. Card backgrounds: warmer amber tone, matching Messages button.
//   3. Padding: text no longer touches frame edges anywhere.
//   4. "1 message" badge is now clickable to toggle thread.
//   5. Schedule: teacher picks Round time (total) + Review time.
//      Play time = Round time − Review time (computed, displayed).
//   6. "Game time" → "Play time" rename throughout.
//   7. Two-tab layout (Recruitment | Oversight) from Chunk R1.
//
// NOTE: Tailwind grid-cols-N does NOT work in this project's build.
// All multi-column layouts use inline styles.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import React, { useState, useTransition } from "react";
import type { TeacherRow, ClassRow, StarterRow, WarmupConfig, GameSchedule, ClassRequestRow, TopicRow, ScheduleThreadMessage } from "./page";
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
  updateAppMode,
  postScheduleMessage,
} from "./actions";

/* ── shared warm card color ────────────────────────────────────────────── */
const CARD_BG = "#f2e8d5";
// Inline-style card look: Tailwind border-2/border-stone-300/bg-amber-600 are
// not in this project's build (they silently drop), so anything visual that
// MUST render lives here as an inline style.
const CARD_BORDER = "2px solid #b8a888";     // warm stone, visible against beige
const CARD_STYLE = { backgroundColor: CARD_BG, border: CARD_BORDER } as const;
const CARD_PAD = { padding: "20px 28px" } as const;          // roomy content padding
const CARD_PAD_TIGHT = { padding: "14px 28px" } as const;    // for header rows / collapsible triggers

// ═════════════════════════════════════════════════════════════════════════
// Standard mode landing — shown at /admin when app_mode = 'standard'
// ═════════════════════════════════════════════════════════════════════════
export function StandardModeLanding() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  function handleSwitch() {
    setError(null);
    startTransition(async () => {
      const res = await updateAppMode("multi");
      if (!res.ok) setError(res.error);
      // On success the page will re-render with the full admin dashboard
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-stone-800">Admin</h1>

      <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
        <div style={CARD_PAD}>
          <p className="text-sm text-stone-600 mb-3">
            You&apos;re currently running in <strong>Standard mode</strong> — a single-teacher setup
            where you manage classes, topics, and game scheduling directly from your teacher dashboard.
          </p>
          <p className="text-sm text-stone-600 mb-4">
            <strong>Multi mode</strong> unlocks the full admin dashboard for coordinating multiple teachers.
            It adds a teacher rotation queue, warm-up matchmaking (solo, trio, or full 9-teacher),
            centralized game scheduling pushed to all classes, teacher topic approval workflows,
            class request management, and inter-teacher messaging.
          </p>

          {!confirmed ? (
            <button
              onClick={() => setConfirmed(true)}
              className="text-xs font-bold px-5 py-2 rounded-full bg-amber-600 text-white hover:bg-amber-500 transition"
            >
              Switch to Multi mode
            </button>
          ) : (
            <div className="p-4 rounded-lg border border-amber-200 bg-amber-50">
              <p className="text-[11px] text-amber-700 mb-3">
                This will activate the full admin dashboard with rotation queue, game scheduling,
                and multi-teacher coordination. You can switch back to Standard from the dashboard.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleSwitch}
                  disabled={pending}
                  className="text-xs font-medium px-4 py-1.5 rounded border border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-200 transition disabled:opacity-40"
                >
                  {pending ? "Switching…" : "Confirm — activate Multi mode"}
                </button>
                <button
                  onClick={() => setConfirmed(false)}
                  className="text-xs font-medium px-4 py-1.5 rounded border border-stone-200 bg-stone-50 text-stone-500 hover:bg-stone-100 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && <div className="text-xs text-red-500 mt-3">{error}</div>}
        </div>
      </div>

      <div className="text-center">
        <a
          href="/teacher/students"
          className="text-xs text-stone-400 hover:text-stone-600 transition underline"
        >
          ← Back to teacher dashboard
        </a>
      </div>
    </div>
  );
}

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
  appMode,
scheduleThread,
  isTeacherAdmin,
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
  appMode: "standard" | "multi";
  scheduleThread: ScheduleThreadMessage[];
  isTeacherAdmin?: boolean;
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

  // ── R1: Tab state ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"recruitment" | "oversight">("oversight");

  return (
    <div className="space-y-4">
      {/* ─── HEADER ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 0 }}>
        <h1 className="text-2xl font-bold text-stone-800">
          Admin
        </h1>
        {isTeacherAdmin && (
          <a
            href="/teacher/students"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 700,
              color: "#3A2A18",
              background: "#F3E4C4",
              border: "1px solid #C9A877",
              borderRadius: 20,
              textDecoration: "none",
              letterSpacing: 0.3,
            }}
          >
            Your classes
          </a>
        )}
      </div>

      {/* ─── R1: TAB BAR ─────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid rgba(120,113,108,0.15)" }}>
        <TabButton
          label="Recruitment"
          active={activeTab === "recruitment"}
          onClick={() => setActiveTab("recruitment")}
          badge={inRotation > 0 ? `${inRotation} in queue` : undefined}
        />
        <TabButton
          label="Oversight"
          active={activeTab === "oversight"}
          onClick={() => setActiveTab("oversight")}
          badge={msgUnreadCount > 0 ? `${msgUnreadCount} unread` : undefined}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* RECRUITMENT TAB                                           */}
      {/* Warmup control, teacher rotation queue                    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "recruitment" && (
        <>
          {/* ─── WARM-UP CONTROL ─────────────────────────────────── */}
          <SectionLabel text="Warm-up control" />
          <WarmupBlock config={warmupConfig} teachers={teachers} />

          {/* ─── TEACHER ROTATION QUEUE ──────────────────────────── */}
          <SectionLabel text="Teacher rotation queue" />
          <TeacherSection
            teachers={teachers}
            classRequests={classRequests}
          />
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* OVERSIGHT TAB                                             */}
      {/* Overview, mode, messages, schedule, topics, classes        */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "oversight" && (
        <>
          {/* ─── OVERVIEW ────────────────────────────────────────── */}
          <SectionLabel text="Overview" />
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <StatItem label="Active teachers" value={activeTeachers} />
            {inactiveTeachers > 0 && (
              <StatItem label="Inactive teachers" value={inactiveTeachers} color="text-stone-400" />
            )}
            <StatItem label="App mode" value={appMode === "multi" ? "Multi" : "Standard"} color="text-violet-600" />
            <StatItem label="Warmup mode" value={modeLabels[warmupConfig.warmup_teacher_count]} />
            <StatItem label="In rotation" value={inRotation} color="text-violet-600" />
          </div>

          {/* ─── APP MODE SELECTOR (M2) ──────────────────────────── */}
          <AppModeSelector currentMode={appMode} />

          {/* ─── MESSAGES ────────────────────────────────────────── */}
          <SectionLabel text="Messages" />
          <div>
            <MessagePanel
              messages={msgMessages}
              recipients={msgRecipients}
              unreadCount={msgUnreadCount}
              currentUserId={msgUserId}
              theme="light"
            />
          </div>

          {/* ─── GAME SCHEDULE ────────────────────────────────────── */}
          <SectionLabel text="Game schedule" />
          <GameScheduleSection
            schedule={gameSchedule}
            topicOptions={topicOptions}
            scheduleThread={scheduleThread}
          />

          {/* ─── GAME TOPICS ─────────────────────────────────────── */}
          <SectionLabel text="Game topics" />
          <TopicsSection seededTopics={seededTopics} teacherTopics={teacherTopics} />

          {/* ─── CURRENT CLASSES ──────────────────────────────────── */}
          <SectionLabel text="Current classes" />
          <CurrentClassesSection
            activeClasses={activeClasses}
            archivedClasses={archivedClasses}
            teachers={teachers}
          />
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Stat item
// ═════════════════════════════════════════════════════════════════════════
function StatItem({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
      <span className="text-[10px] text-stone-400">{label}</span>
      <span className={`font-bold text-sm ${color || "text-stone-800"}`}>{value}</span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Section label
// ═════════════════════════════════════════════════════════════════════════
function SectionLabel({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-[10px] uppercase tracking-wider text-stone-400 font-medium">{text}</span>
      <div className="flex-1 border-t border-stone-200" />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Tab button — R1
// ═════════════════════════════════════════════════════════════════════════
function TabButton({
  label,
  active,
  onClick,
  badge,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 20px",
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        color: active ? "#92400e" : "#78716c",
        borderBottom: active ? "2px solid #d97706" : "2px solid transparent",
        marginBottom: -2,
        background: "none",
        cursor: "pointer",
        transition: "color 0.15s, border-color 0.15s",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {label}
      {badge && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            padding: "1px 6px",
            borderRadius: 9,
            background: active ? "rgba(217,119,6,0.12)" : "rgba(120,113,108,0.08)",
            color: active ? "#92400e" : "#a8a29e",
          }}
        >
          {badge}
        </span>
      )}
    </button>
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
    <div className={`rounded-xl overflow-hidden ${pending ? "opacity-60 pointer-events-none" : ""}`} style={CARD_STYLE}>
      <div className="flex items-center gap-3" style={{ ...CARD_PAD_TIGHT, borderBottom: "1px solid rgba(120,113,108,0.2)" }}>
        <span className={`w-2 h-2 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-stone-300"}`} />
        <span className="text-xs font-medium">{isLive ? "Live" : "Off"}</span>
        {recruiting && (
          <span className="text-xs text-stone-400">
            {recruiting.display_name || recruiting.username} is recruiting
          </span>
        )}
      </div>
      <div style={CARD_PAD}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-stone-400">Mode</span>
          <select
            value={config.warmup_teacher_count}
            onChange={(e) => handleModeChange(e.target.value)}
            className="border border-stone-300 rounded-md px-2 py-0.5 text-xs text-stone-800" style={{ backgroundColor: '#f3efe8' }}
          >
            {[1, 3, 9].map((n) => (
              <option key={n} value={n} className="bg-white">{modeLabels[n]}</option>
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
    <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
      <button
        onClick={() => setShowSection(!showSection)}
        className="w-full flex items-center justify-between text-left hover:brightness-[0.97] transition" style={CARD_PAD_TIGHT}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium">
            {teachers.length} teacher{teachers.length !== 1 ? "s" : ""}
          </span>
          <span className="text-[10px] text-stone-400">
            {inRotation.length} in rotation
          </span>
        </div>
        <span className="text-stone-300 text-[10px]">{showSection ? "Close teachers" : "See teachers"}</span>
      </button>

      {showSection && (
        <div className="border-t border-stone-200">
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
          <tr className="border-b border-stone-200 text-stone-400">
            <th className="text-center font-medium py-2 px-2" style={{ width: 28 }}>#</th>
            <th className="text-left font-medium py-2 px-3">Name</th>
            <th className="text-center font-medium py-2 px-2" title="Active classes / Max allowed">Active / Max</th>
            <th className="text-center font-medium py-2 px-2">Mode</th>
            <th className="text-center font-medium py-2 px-2">Request</th>
            <th className="text-center font-medium py-2 px-2">Actions</th>
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
                      <div className="border-t border-stone-200 text-[9px] text-stone-300 uppercase tracking-wider pt-1">
                        Not in rotation
                      </div>
                    </td>
                  </tr>
                )}
                <tr className="border-b border-stone-100 last:border-0">
                  <td className="text-center text-stone-300 py-1.5 px-2">
                    {inQueue ? idx + 1 : "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        isRecruiting ? "bg-emerald-500"
                          : inQueue ? "bg-amber-500"
                          : "bg-stone-300"
                      }`} />
                      <span className="text-stone-700">{name}</span>
                      {t.is_admin && (
                        <span className="text-[8px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                          admin
                        </span>
                      )}
                      {inQueue && <StatusBadge status={t.rotation!.status} />}
                    </div>
                  </td>
                  {/* Classes: active / max */}
                  <td className="text-center py-1.5 px-2">
                    {editingMaxId === t.id ? (
                      <div style={{ display: "flex", gap: 3, alignItems: "center", justifyContent: "center" }}>
                        <input
                          type="number" min={1} max={50} value={maxVal}
                          onChange={(e) => setMaxVal(e.target.value)}
                          className="w-10 rounded bg-stone-100 border border-stone-300 px-1 py-0.5 text-xs text-stone-800 text-center"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveMax(t.id); if (e.key === "Escape") setEditingMaxId(null); }}
                        />
                        <Pill onClick={() => handleSaveMax(t.id)} variant="green">✓</Pill>
                        <Pill onClick={() => setEditingMaxId(null)} variant="default">✕</Pill>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingMaxId(t.id); setMaxVal(String(t.max_classes)); }}
                        className="text-stone-400 hover:text-stone-600 transition"
                        title={`${activeClassCount} active class${activeClassCount !== 1 ? "es" : ""} / ${t.max_classes} max — click to edit max`}
                      >
                        {activeClassCount} / {t.max_classes}
                      </button>
                    )}
                  </td>
                  <td className="text-center py-1.5 px-2">
                    <div style={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap" }}>
                      <span className="text-[9px] px-2 py-0.5 rounded bg-stone-50 text-stone-400 border border-stone-200">S</span>
                      {t.willing_trio && (
                        <span className="text-[9px] px-2 py-0.5 rounded bg-violet-100 text-violet-600 border border-violet-200">T</span>
                      )}
                      {t.willing_nine && (
                        <span className="text-[9px] px-2 py-0.5 rounded bg-violet-100 text-violet-600 border border-violet-200">9</span>
                      )}
                    </div>
                  </td>
                  {/* Request */}
                  <td className="text-center py-1.5 px-2">
                    {teacherPending.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
                        {teacherPending[0].class_name && (
                          <span className="text-[9px] text-stone-500 italic truncate" style={{ maxWidth: 110 }}>
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
                            className="rounded bg-stone-100 border border-stone-300 px-2 py-0.5 text-[9px] text-stone-800"
                            title="Class size (override if needed)"
                          >
                            <option value={9} className="bg-white">9</option>
                            <option value={16} className="bg-white">16</option>
                            <option value={25} className="bg-white">25</option>
                          </select>
                          <span className="text-[8px] text-stone-300">seats</span>
                        </div>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                          <button
                            onClick={() => {
                              const cap = capOverrides[teacherPending[0].id];
                              const reqCap = teacherPending[0].requested_capacity ?? 9;
                              const override = cap != null && cap !== reqCap ? cap : undefined;
                              act(() => approveClassRequest(teacherPending[0].id, override));
                            }}
                            className="text-[9px] px-2.5 py-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition"
                          >Approve</button>
                          <button
                            onClick={() => act(() => denyClassRequest(teacherPending[0].id))}
                            className="text-[9px] px-2.5 py-1 rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition"
                          >Deny</button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </td>
                  <td className="text-center py-1.5 px-2">
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
      {error && <div className="text-xs text-red-400 px-4 py-2">{error}</div>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Current Classes section — collapsible
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
      <div className="rounded-xl p-6 text-center text-stone-300 text-xs" style={CARD_STYLE}>
        No classes yet
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
      <button
        onClick={() => setShowSection(!showSection)}
        className="w-full flex items-center justify-between text-left hover:brightness-[0.97] transition" style={CARD_PAD_TIGHT}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium">
            {activeClasses.length} active class{activeClasses.length !== 1 ? "es" : ""}
          </span>
          {archivedClasses.length > 0 && (
            <span className="text-[10px] text-stone-400">
              {archivedClasses.length} archived
            </span>
          )}
        </div>
        <span className="text-stone-300 text-[10px]">{showSection ? "Close classes" : "See classes"}</span>
      </button>

      {showSection && (
        <div className="border-t border-stone-200 p-3 space-y-2">
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
              <div className="text-[10px] text-stone-300 uppercase tracking-wider pt-3 pb-1 px-2">
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
// Duration label helper
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
    return `${formatDuration(c.game_phase_hours)} play + ${formatDuration(c.review_phase_hours)} review`;
  }
  if (c.round_duration_hours != null) {
    return `${formatDuration(c.round_duration_hours)} per round`;
  }
  return "";
}

// ═════════════════════════════════════════════════════════════════════════
// Class card
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
      isArchived ? "border-stone-100 opacity-60" : "border-stone-200"
    } ${pending ? "opacity-30 pointer-events-none" : ""}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-stone-50 transition text-xs"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">{c.name}</span>
          <span className="text-stone-400 flex-shrink-0">{c.student_count}/{c.capacity}</span>
          <span className="text-[10px] text-stone-400 flex-shrink-0">— {c.teacher_name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isArchived && (
            <span className="text-[9px] font-medium px-2.5 py-0.5 rounded border border-stone-200 bg-stone-50 text-stone-400">
              archived
            </span>
          )}
          {c.game && (
            <span className={`text-[9px] font-medium px-2.5 py-0.5 rounded border ${
              c.game.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-600"
              : c.game.status === "complete" ? "border-blue-200 bg-blue-50 text-blue-600"
              : "border-stone-300 bg-stone-50 text-stone-500"
            }`}>{c.game.status} · {c.game.round_count}R</span>
          )}
          {topicEntries.length > 0 && (
            <span className="text-[9px] px-2.5 py-0.5 rounded border border-violet-200 bg-violet-50 text-violet-600">
              {topicEntries.length} topic{topicEntries.length !== 1 ? "s" : ""}
            </span>
          )}
          {!isArchived && pendingPhotos > 0 && (
            <span className="text-[9px] px-2.5 py-0.5 rounded bg-amber-100 text-amber-600 border border-amber-200">
              {pendingPhotos} pending
            </span>
          )}
          <span className="text-stone-300 text-[10px]">{open ? "Close details" : "See details"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-stone-200 px-4 pb-4">
          {/* Game info */}
          <div className="text-[10px] text-stone-400 py-3" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {c.total_rounds != null && <span>{c.total_rounds} rounds</span>}
            {durationDisplay && <span>{durationDisplay}</span>}
            {c.game_starts_at && (
              <span>Starts {new Date(c.game_starts_at).toLocaleString()}</span>
            )}
            {c.game && <span>{c.game.name} · {c.game.status}</span>}
          </div>

          {/* Round topics */}
          {topicEntries.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] text-stone-400 mb-1">Round topics</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {topicEntries.map(([round, topic]) => (
                  <span key={round} className="text-[10px] bg-violet-50 text-violet-600 border border-violet-200 rounded px-2.5 py-0.5">
                    R{round}: {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Students */}
          <div className="mb-3">
            <div className="text-[10px] text-stone-400 mb-1">
              Students ({c.students.length})
            </div>
            {c.students.length === 0 ? (
              <p className="text-[10px] text-stone-300">No students enrolled.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "2px 12px" }}>
                {c.students.map((s) => (
                  <div key={s.id} className="text-[11px] truncate">
                    <span className="text-stone-500">
                      {s.display_name || s.username || s.id.slice(0, 8)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Deck photos — only for active classes */}
          {!isArchived && starters.length > 0 && (
            <div className="mb-3">
              <button
                onClick={() => setShowDeck(!showDeck)}
                className="text-[10px] text-stone-400 hover:text-stone-500 transition"
              >
                Deck: {activePhotos} approved{pendingPhotos > 0 ? `, ${pendingPhotos} pending` : ""}
                <span className="ml-1 text-stone-300">{showDeck ? "▾" : "▸"}</span>
              </button>
              {showDeck && (
                <div className="space-y-2 mt-2">
                  {starters.filter((s) => !s.is_active).length > 0 && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] uppercase tracking-wider text-amber-600 font-medium">
                          Pending ({starters.filter((s) => !s.is_active).length})
                        </span>
                        <div className="flex-1 border-t border-amber-200" />
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
                          <div className="flex-1 border-t border-emerald-200" />
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

          {/* Footer: archive + download */}
          <div className="pt-2 border-t border-stone-100 flex justify-end gap-2">
            <button
              onClick={() => downloadClassSpreadsheet(c)}
              className="text-[10px] font-medium px-3 py-1 rounded-md border transition border-stone-200 bg-stone-50 text-stone-400 hover:bg-stone-100 hover:text-stone-500"
            >
              Download spreadsheet
            </button>
            {!isArchived && (
              <button
                onClick={handleArchive}
                disabled={pending}
                className={`text-[10px] font-medium px-3 py-1 rounded-md border transition border-stone-200 bg-stone-50 text-stone-400 hover:bg-stone-100 hover:text-stone-500 ${pending ? "opacity-30" : ""}`}
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
// PhotoCard
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
        ? "border-amber-200 bg-amber-500/[0.03]"
        : "border-emerald-400/30"
    } ${pending ? "opacity-30 pointer-events-none" : ""}`}>
      <div style={{ display: "flex", gap: 0 }}>
        <div style={{ width: 72, height: 72, flexShrink: 0, position: "relative", background: "rgba(245,240,235,0.5)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={starter.media_url}
            alt={starter.description_text || "Warm-up photo"}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          <div style={{
            position: "absolute", top: 2, right: 2, width: 14, height: 14,
            borderRadius: "50%",
            background: isPendingApproval ? "rgba(245,158,11,0.9)" : "rgba(16,185,129,0.9)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 7, color: "white", fontWeight: "bold" }}>
              {isPendingApproval ? "?" : "✓"}
            </span>
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "8px 10px" }}>
          {starter.description_text ? (
            <p style={{ fontSize: 11, color: "rgba(90,80,70,0.7)", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, margin: 0 }}>
              {starter.description_text}
            </p>
          ) : (
            <p style={{ fontSize: 11, color: "rgba(160,150,140,0.5)", margin: 0 }}>No description</p>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 4 }}>
            {isPendingApproval ? (
              <>
                <button
                  onClick={handleApprove}
                  className="text-[9px] font-medium px-3 py-1 rounded transition bg-emerald-100 text-emerald-600 hover:bg-emerald-100 border border-emerald-200"
                >Approve</button>
                <button
                  onClick={() => { setShowRejectInput(!showRejectInput); setError(null); }}
                  className="text-[9px] font-medium px-3 py-1 rounded transition bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                >{showRejectInput ? "Cancel" : "Reject"}</button>
              </>
            ) : (
              <>
                <span className="text-[9px] font-medium px-3 py-1 rounded bg-emerald-100 text-emerald-600">
                  Active ✓
                </span>
                <button
                  onClick={handleDeactivate}
                  className="text-[9px] font-medium px-3 py-1 rounded transition bg-stone-50 text-stone-400 hover:bg-stone-100 hover:text-stone-500"
                >Deactivate</button>
              </>
            )}
          </div>
        </div>
      </div>

      {showRejectInput && (
        <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.05)" }}>
          <textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Tell the teacher why this photo can't be used…"
            rows={2}
            maxLength={500}
            className="w-full rounded border border-red-200 bg-stone-50 px-2 py-1.5 text-xs text-stone-800 outline-none focus:border-red-400 placeholder:text-stone-300"
            autoFocus
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 4 }}>
            <button
              onClick={() => { setShowRejectInput(false); setRejectNote(""); setError(null); }}
              className="text-[9px] px-3 py-1 rounded border border-stone-200 text-stone-400 hover:bg-stone-50"
            >Cancel</button>
            <button
              onClick={handleRejectSubmit}
              className="text-[9px] font-medium px-3 py-1 rounded bg-red-100 text-red-600 border border-red-200 hover:bg-red-100"
            >Send rejection note</button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: "4px 10px", borderTop: "1px solid rgba(239,68,68,0.15)" }}>
          <p className="text-[10px] text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Game topics
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

  return (
    <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
      <button
        onClick={() => setShowSection(!showSection)}
        className="w-full flex items-center justify-between text-left hover:brightness-[0.97] transition" style={CARD_PAD_TIGHT}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium">
            {seededTopics.length} starter topic{seededTopics.length !== 1 ? "s" : ""}
          </span>
          {teacherTopics.length > 0 && (
            <span className="text-[10px] text-stone-400">
              + {teacherTopics.length} teacher-created
              {pendingTeacherTopics.length > 0 && (
                <span className="text-amber-600 ml-1">({pendingTeacherTopics.length} pending)</span>
              )}
            </span>
          )}
        </div>
        <span className="text-stone-300 text-[10px]">{showSection ? "Close topics" : "See topics"}</span>
      </button>

      {showSection && (
        <div style={{ ...CARD_PAD, borderTop: "1px solid rgba(120,113,108,0.2)" }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-wider text-stone-400 font-medium">Starter topics</span>
            <div className="flex-1 border-t border-stone-100" />
          </div>
          {seededTopics.length === 0 ? (
            <p className="text-[10px] text-stone-400 mb-3">No starter topics.</p>
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
                <span className="text-[10px] uppercase tracking-wider text-stone-400 font-medium">Teacher-created</span>
                <div className="flex-1 border-t border-stone-100" />
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
              className="flex-1 rounded bg-stone-100 border border-stone-300 px-2 py-1 text-xs text-stone-800 outline-none focus:border-amber-500"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") { setEditing(false); setEditVal(topic.topic_text); } }}
            />
            <Pill onClick={handleSave} variant="green">Save</Pill>
            <Pill onClick={() => { setEditing(false); setEditVal(topic.topic_text); setError(null); }} variant="default">Cancel</Pill>
          </>
        ) : (
          <>
            <span className={`flex-1 text-xs ${isPending ? "text-amber-600/50" : "text-stone-600"}`}>{topic.topic_text}</span>
            {isPending && (
              <span className="text-[8px] px-2 py-0.5 rounded bg-amber-100 text-amber-600 border border-amber-200">
                pending
              </span>
            )}
            {topic.suggested_by_name && (
              <span className="text-[9px] text-stone-300">by {topic.suggested_by_name}</span>
            )}
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
          className="flex-1 rounded bg-stone-100 border border-stone-300 px-2 py-1 text-xs text-stone-800 outline-none focus:border-amber-500 placeholder:text-stone-300"
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
        />
        <Pill onClick={handleAdd} variant="green">Add</Pill>
      </div>
      {error && <p className="text-[10px] text-red-400 mt-0.5 ml-1">{error}</p>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Game schedule section — Session 91 redesign
//
// Teacher picks:
//   "Round time" — total duration of one round (e.g. 1 day)
//   "Review time" — portion of round reserved for teacher review
// App computes:
//   "Play time" — Round time minus Review time
//
// Data mapping:
//   round_duration_hours = total round time (what teacher picks)
//   review_phase_hours   = review time (what teacher picks)
//   game_phase_hours     = round_duration_hours - review_phase_hours (computed)
// ═════════════════════════════════════════════════════════════════════════

const ROUND_TIME_OPTIONS: { value: string; label: string }[] = [
  { value: "0.5", label: "30 min" },
  { value: "1", label: "1 hour" },
  { value: "1.5", label: "90 min" },
  { value: "2", label: "2 hours" },
  { value: "5", label: "5 hours" },
  { value: "24", label: "1 day" },
  { value: "48", label: "2 days" },
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
  scheduleThread,
}: {
  schedule: GameSchedule;
  topicOptions: string[];
  scheduleThread: ScheduleThreadMessage[];
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const [totalRounds, setTotalRounds] = useState(schedule.game_total_rounds ?? 3);

  // Session 91: Round time = total round duration.
  // Fall back to sum of phases, then to old round_duration_hours.
  const [roundTimeHours, setRoundTimeHours] = useState(() => {
    if (schedule.game_phase_hours != null && schedule.review_phase_hours != null) {
      return String(schedule.game_phase_hours + schedule.review_phase_hours);
    }
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

  // Compute play time = round time - review time
  const roundTimeNum = parseFloat(roundTimeHours);
  const reviewNum = parseFloat(reviewPhaseHours);
  const playTimeHours = roundTimeNum - reviewNum;
  const playTimeValid = playTimeHours > 0;

  // Filter review options to only show values less than round time
  const filteredReviewOptions = REVIEW_TIME_OPTIONS.filter(
    (opt) => parseFloat(opt.value) < roundTimeNum
  );

  // If current review selection is now invalid, reset it
  if (reviewNum >= roundTimeNum && filteredReviewOptions.length > 0) {
    // Will handle in effect — for now just flag
  }

  function handleSave() {
    if (!playTimeValid) {
      setResult("Review time must be less than round time.");
      return;
    }
    setResult(null);
    const fd = new FormData();
    fd.set("total_rounds", String(totalRounds));
    fd.set("round_duration_hours", roundTimeHours);
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
    <div className={`rounded-xl overflow-hidden ${pending ? "opacity-60 pointer-events-none" : ""}`} style={CARD_STYLE}>
      <div style={CARD_PAD}>
        <p className="text-[10px] text-stone-500 mb-4">
          These settings apply to all active classes in multi-teacher mode.
          Saving pushes to every active class.
        </p>

        {/* 4 columns — Rounds, Round time, Review time, Starts at */}
        <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1fr 1fr 1.5fr", gap: 12, marginBottom: 8 }}>
          <div>
            <label className="text-[10px] text-stone-500 font-medium block mb-1">Rounds</label>
            <input
              type="number"
              value={totalRounds}
              onChange={(e) => handleRoundsChange(e.target.value)}
              min={1}
              max={100}
              className="w-full rounded bg-stone-100 border border-stone-300 px-2 py-1.5 text-xs text-stone-800 outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="text-[10px] text-stone-500 font-medium block mb-1">Round time</label>
            <select
              value={roundTimeHours}
              onChange={(e) => {
                setRoundTimeHours(e.target.value);
                // Auto-fix review if it would exceed new round time
                const newRound = parseFloat(e.target.value);
                if (parseFloat(reviewPhaseHours) >= newRound) {
                  setReviewPhaseHours("0");
                }
              }}
              className="w-full rounded bg-stone-100 border border-stone-300 px-2 py-1.5 text-xs text-stone-800 outline-none focus:border-amber-500"
            >
              {ROUND_TIME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-white">{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-stone-500 font-medium block mb-1">Review time</label>
            <select
              value={reviewPhaseHours}
              onChange={(e) => setReviewPhaseHours(e.target.value)}
              className="w-full rounded bg-stone-100 border border-stone-300 px-2 py-1.5 text-xs text-stone-800 outline-none focus:border-amber-500"
            >
              {filteredReviewOptions.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-white">{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-stone-500 font-medium block mb-1">Starts at</label>
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className="w-full rounded bg-stone-100 border border-stone-300 px-2 py-1.5 text-xs text-stone-800 outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Computed play time + total round duration */}
        <p className="text-[10px] text-stone-600 mb-4">
          Total round duration: {formatDuration(roundTimeNum) || `${roundTimeNum}h`}
          {reviewNum > 0 && playTimeValid && (
            <span className="text-stone-500">
              {" "}— play time: {formatDuration(playTimeHours) || `${playTimeHours}h`},
              review: {formatDuration(reviewNum) || `${reviewNum}h`}
            </span>
          )}
          {!playTimeValid && (
            <span className="text-red-500 ml-2">
              Review time must be less than round time.
            </span>
          )}
        </p>

        {topicOptions.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label className="text-[10px] text-stone-500 font-medium block mb-1">
              Round topics
              <span className="text-stone-300 font-normal ml-1">(optional)</span>
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
                  <span className="text-[9px] text-stone-300 block mb-0.5">R{r}</span>
                  <select
                    value={roundTopics[String(r)] || ""}
                    onChange={(e) => setRoundTopics((prev) => ({ ...prev, [String(r)]: e.target.value }))}
                    className="w-full rounded bg-stone-100 border border-stone-300 px-1.5 py-1 text-[11px] text-stone-800 outline-none focus:border-amber-500"
                  >
                    <option value="" className="bg-white">(No topic)</option>
                    {topicOptions.map((t) => (
                      <option key={t} value={t} className="bg-white">{t}</option>
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
            disabled={pending || !playTimeValid}
            className="transition disabled:opacity-40"
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: "8px 20px",
              borderRadius: 9999,
              background: "#d97706",
              color: "#ffffff",
              border: "none",
              cursor: pending || !playTimeValid ? "default" : "pointer",
            }}
          >
            {pending ? "Saving…" : "Save & push to all classes"}
          </button>
          {result && (
            <span className={`text-[11px] font-medium ${isError ? "text-red-400" : "text-emerald-600"}`}>
              {result}
            </span>
          )}
        </div>

        {/* ── Schedule coordination thread ───────────────── */}
        <ScheduleThread thread={scheduleThread} />
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Schedule coordination thread — Chunk J
// Session 91: "1 message" badge is now clickable to toggle thread.
// ═════════════════════════════════════════════════════════════════════════
function ScheduleThread({ thread }: { thread: ScheduleThreadMessage[] }) {
  const [showThread, setShowThread] = useState(false);
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [sendResult, setSendResult] = useState<string | null>(null);

  function handleSend() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSendResult(null);
    startTransition(async () => {
      const res = await postScheduleMessage(trimmed);
      if (res.ok) {
        setBody("");
        setComposing(false);
        setSendResult("Sent to all teachers");
        setTimeout(() => setSendResult(null), 3000);
      } else {
        setSendResult(res.error);
      }
    });
  }

  const hasMessages = thread.length > 0;

  return (
    <div style={{ borderTop: "1px solid rgba(120,113,108,0.15)", marginTop: 16, paddingTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="text-[10px] uppercase tracking-wider text-stone-400 font-medium">
            Teacher coordination
          </span>
          {hasMessages && (
            <button
              onClick={() => setShowThread(!showThread)}
              className="text-[9px] px-2.5 py-0.5 rounded bg-stone-100 text-stone-500 border border-stone-200 hover:bg-stone-200 transition cursor-pointer"
            >
              {thread.length} message{thread.length !== 1 ? "s" : ""}
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {hasMessages && (
            <button
              onClick={() => setShowThread(!showThread)}
              className="text-[10px] text-stone-400 hover:text-stone-600 transition"
            >
              {showThread ? "Hide thread" : "View thread"}
            </button>
          )}
          <button
            onClick={() => { setComposing(!composing); setSendResult(null); }}
            className="text-[10px] font-medium px-3 py-1 rounded-md border transition border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100"
          >
            {composing ? "Cancel" : "Message teachers"}
          </button>
        </div>
      </div>

      {/* Thread messages */}
      {showThread && hasMessages && (
        <div style={{ marginTop: 10, maxHeight: 260, overflowY: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {thread.map((m) => (
              <div
                key={m.id}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(120,113,108,0.12)",
                  background: m.isFromAdmin ? "rgba(217,138,43,0.06)" : "rgba(120,113,108,0.04)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: m.isFromAdmin ? "#92400e" : "#57534e" }}>
                    {m.isFromAdmin ? "You (Admin)" : m.senderName}
                  </span>
                  <span style={{ fontSize: 9, color: "#a8a29e" }}>
                    {formatThreadDate(m.createdAt)}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: "#44403c", lineHeight: 1.4, margin: 0, wordBreak: "break-word" }}>
                  {m.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compose area */}
      {composing && (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={body}
            onChange={(e) => { if (e.target.value.length <= 500) setBody(e.target.value); }}
            rows={2}
            placeholder="Message all teachers in rotation…"
            className="w-full rounded bg-stone-100 border border-stone-300 px-3 py-2 text-xs text-stone-800 outline-none focus:border-amber-500 placeholder:text-stone-300"
            style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
            autoFocus
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <span className="text-[9px] text-stone-300">{body.length}/500</span>
            <button
              onClick={handleSend}
              disabled={pending || !body.trim()}
              className="text-[10px] font-bold px-4 py-1 rounded-full bg-amber-600 text-white hover:bg-amber-500 transition disabled:opacity-40"
            >
              {pending ? "Sending…" : "Send to all teachers"}
            </button>
          </div>
        </div>
      )}

      {sendResult && (
        <div style={{ marginTop: 4 }}>
          <span className={`text-[10px] font-medium ${sendResult.startsWith("Sent") ? "text-emerald-600" : "text-red-400"}`}>
            {sendResult}
          </span>
        </div>
      )}

      {!hasMessages && !composing && (
        <p className="text-[10px] text-stone-400 mt-2">
          No schedule messages yet. When you save a schedule, teachers are automatically notified.
        </p>
      )}
    </div>
  );
}

function formatThreadDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

// ═════════════════════════════════════════════════════════════════════════
// App mode selector — M2
// ═════════════════════════════════════════════════════════════════════════
function AppModeSelector({ currentMode }: { currentMode: "standard" | "multi" }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmStandard, setConfirmStandard] = useState(false);

  function handleChange(val: string) {
    if (val === currentMode) return;
    if (val === "standard") {
      setConfirmStandard(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateAppMode(val as "standard" | "multi");
      if (!res.ok) setError(res.error);
    });
  }

  function handleConfirmStandard() {
    setError(null);
    setConfirmStandard(false);
    startTransition(async () => {
      const res = await updateAppMode("standard");
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className={`rounded-xl overflow-hidden ${pending ? "opacity-60 pointer-events-none" : ""}`} style={CARD_STYLE}>
      <div style={CARD_PAD}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-stone-400">App mode</span>
          <select
            value={currentMode}
            onChange={(e) => handleChange(e.target.value)}
            className="border border-stone-300 rounded-md px-2 py-1 text-xs text-stone-800" style={{ backgroundColor: '#f3efe8' }}
          >
            <option value="multi" className="bg-white">Multi (marketplace)</option>
            <option value="standard" className="bg-white">Standard (organizational)</option>
          </select>
          <span className="text-[10px] text-stone-400">
            {currentMode === "multi"
              ? "Full admin dashboard, rotation queue, warmup matchmaking"
              : "Solo game only, teacher creates classes directly"}
          </span>
        </div>
        {confirmStandard && (
          <div className="mt-3 p-4 rounded-lg border border-amber-200 bg-amber-50">
            <p className="text-[11px] text-amber-700 mb-2">
              Switching to Standard mode will redirect /admin to the teacher dashboard.
              To switch back, you&apos;ll need to update the database directly.
            </p>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={handleConfirmStandard}
                className="text-[10px] font-medium px-4 py-1.5 rounded border border-amber-200 bg-amber-100 text-amber-700 hover:bg-amber-200 transition"
              >Switch to Standard</button>
              <button
                onClick={() => setConfirmStandard(false)}
                className="text-[10px] font-medium px-4 py-1.5 rounded border border-stone-200 bg-stone-50 text-stone-500 hover:bg-stone-100 transition"
              >Cancel</button>
            </div>
          </div>
        )}
        {error && <div className="text-xs text-red-500 mt-2">{error}</div>}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Shared
// ═════════════════════════════════════════════════════════════════════════
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    recruiting: "bg-emerald-100 text-emerald-600 border-emerald-200",
    waiting: "bg-stone-50 text-stone-400 border-stone-200",
    paused: "bg-amber-100 text-amber-600 border-amber-200",
  };
  return (
    <span className={`text-[9px] font-medium px-2.5 py-0.5 rounded border ${styles[status] || styles.waiting}`}>
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
    default: "border-stone-200 bg-stone-50 text-stone-500 hover:bg-stone-100 hover:text-stone-800",
    green: "border-emerald-500/25 bg-emerald-50 text-emerald-600 hover:bg-emerald-100",
    red: "border-red-200 bg-red-50 text-red-600 hover:bg-red-100",
    amber: "border-amber-500/25 bg-amber-50 text-amber-600 hover:bg-amber-100",
  };
  return (
    <button
      onClick={onClick}
      className={`text-[10px] font-medium px-3 py-1 rounded-md border transition ${styles[variant]}`}
    >{children}</button>
  );
}
