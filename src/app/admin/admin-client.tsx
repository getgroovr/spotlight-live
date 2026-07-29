// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/admin/admin-client.tsx   (REPLACES existing file)
//
// Session 96: Cleanup — removed warm-up mode controls, mode column,
//   max-classes editing, and centralized game schedule.
// Session 98: Removed rotation queue entirely (TeacherSection,
//   TeacherTable, StandardModeLanding, "Switch to Multi" flow).
//   Multi-teacher coordination now lives at /teacher/multi where
//   teachers self-organize into games — no admin involvement needed.
//
//   TEACHERS tab — managing teachers & class requests:
//     • Class requests (pending approve/deny)
//     • Teacher coordination thread
//     • Teacher profiles (active/inactive, with game counts and class lists)
//     • Messages
//
//   GAMES tab — managing games & topics:
//     • Overview stats
//     • Game topics
//     • Active classes
//     • Archived classes
//
// NOTE: Tailwind grid-cols-N does NOT work in this project's build.
// All multi-column layouts use inline styles.
// ─────────────────────────────────────────────────────────────────────────
"use client";

import React, { useState, useTransition } from "react";
import type { TeacherRow, ClassRow, StarterRow, ClassRequestRow, TopicRow, ScheduleThreadMessage } from "./page";
import MessagePanel, { type MessageRow, type Recipient } from "@/components/MessagePanel";
import {
  togglePhotoActive,
  approveClassRequest,
  denyClassRequest,
  addTopic,
  updateTopicText,
  deleteTopic,
  setTopicStatus,
  archiveClass,
  postScheduleMessage,
} from "./actions";

/* ── shared warm card color ────────────────────────────────────────────── */
const CARD_BG = "#f2e8d5";
const CARD_BORDER = "2px solid #b8a888";
const CARD_STYLE = { backgroundColor: CARD_BG, border: CARD_BORDER } as const;
const CARD_PAD = { padding: "20px 28px" } as const;
const CARD_PAD_TIGHT = { padding: "14px 28px" } as const;

// ═════════════════════════════════════════════════════════════════════════
// Main component
// ═════════════════════════════════════════════════════════════════════════
export function AdminClient({
  teachers,
  topicOptions,
  classRequests,
  topics,
  msgMessages,
  msgRecipients,
  msgUnreadCount,
  msgUserId,
  scheduleThread,
  isTeacherAdmin,
  appMode: _appMode,
}: {
  teachers: TeacherRow[];
  topicOptions: string[];
  classRequests: ClassRequestRow[];
  topics: TopicRow[];
  msgMessages: MessageRow[];
  msgRecipients: Recipient[];
  msgUnreadCount: number;
  msgUserId: string;
  scheduleThread: ScheduleThreadMessage[];
  isTeacherAdmin?: boolean;
  appMode?: string; // kept for backward compat with page.tsx, not used
}) {
  // Overview stats
  const activeTeachers = teachers.filter((t) => !t.is_archived).length;

  const seededTopics = topics.filter((t) => !t.suggested_by);
  const teacherTopics = topics.filter((t) => !!t.suggested_by);

  // All classes across all teachers
  const allClasses = teachers.flatMap((t) => t.classes);
  const activeClasses = allClasses.filter((c) => !c.is_archived);
  const archivedClasses = allClasses.filter((c) => c.is_archived);

  // Pending items for tab badges
  const pendingRequests = classRequests.filter((r) => r.status === "pending").length;
  const pendingTopics = teacherTopics.filter((t) => t.status === "pending").length;

  // ── Tab state ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"teachers" | "games">("teachers");

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

      {/* ─── TAB BAR ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid rgba(120,113,108,0.15)" }}>
        <TabButton
          label="Teachers"
          active={activeTab === "teachers"}
          onClick={() => setActiveTab("teachers")}
          badge={pendingRequests > 0 ? `${pendingRequests} pending` : undefined}
        />
        <TabButton
          label="Games"
          active={activeTab === "games"}
          onClick={() => setActiveTab("games")}
          badge={msgUnreadCount > 0 ? `${msgUnreadCount} unread` : undefined}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TEACHERS TAB                                              */}
      {/* Class requests, coordination thread, topics               */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "teachers" && (
        <>
          {/* ─── CLASS REQUESTS ──────────────────────────────────── */}
          <SectionLabel text="Class requests" />
          <ClassRequestsSection
            classRequests={classRequests}
            teachers={teachers}
          />

          {/* ─── TEACHER COORDINATION ─────────────────────────────── */}
          <SectionLabel text="Teacher coordination" />
          <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
            <div style={CARD_PAD}>
              <ScheduleThread thread={scheduleThread} />
            </div>
          </div>

          {/* ─── TEACHER PROFILES ────────────────────────────────── */}
          <SectionLabel text="Teachers" />
          <TeacherProfilesSection
            teachers={teachers}
          />

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
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* GAMES TAB                                                 */}
      {/* Overview, topics, active + archived classes                */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "games" && (
        <>
          {/* ─── OVERVIEW ────────────────────────────────────────── */}
          <SectionLabel text="Overview" />
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <StatItem label="Active teachers" value={activeTeachers} />
            <StatItem label="Active classes" value={activeClasses.length} />
            {archivedClasses.length > 0 && (
              <StatItem label="Archived" value={archivedClasses.length} color="text-stone-400" />
            )}
          </div>

          {/* ─── GAME TOPICS ─────────────────────────────────────── */}
          <SectionLabel text="Game topics" />
          <TopicsSection seededTopics={seededTopics} teacherTopics={teacherTopics} />

          {/* ─── ACTIVE CLASSES ───────────────────────────────────── */}
          <SectionLabel text="Active classes" />
          <CurrentClassesSection
            activeClasses={activeClasses}
            teachers={teachers}
          />

          {/* ─── ARCHIVED CLASSES ─────────────────────────────────── */}
          {archivedClasses.length > 0 && (
            <>
              <SectionLabel text="Archived classes" />
              <ArchivedClassesSection
                archivedClasses={archivedClasses}
                teachers={teachers}
              />
            </>
          )}
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
// Tab button
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
// Class Requests section — standalone (moved from rotation table)
// ═════════════════════════════════════════════════════════════════════════
function ClassRequestsSection({
  classRequests,
  teachers,
}: {
  classRequests: ClassRequestRow[];
  teachers: TeacherRow[];
}) {
  const [showSection, setShowSection] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [capOverrides, setCapOverrides] = useState<Record<string, number>>({});

  const pendingReqs = classRequests.filter((r) => r.status === "pending");
  const recentResolved = classRequests
    .filter((r) => r.status !== "pending")
    .slice(0, 10);

  const teacherNameMap = new Map<string, string>();
  teachers.forEach((t) => {
    teacherNameMap.set(t.id, t.display_name || t.username || "Unnamed");
  });

  function act(fn: () => Promise<any>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res && !res.ok) setError(res.error);
    });
  }

  if (pendingReqs.length === 0 && recentResolved.length === 0) {
    return (
      <div className="rounded-xl p-6 text-center text-stone-300 text-xs" style={CARD_STYLE}>
        No class requests yet
      </div>
    );
  }

  return (
    <div className={`rounded-xl overflow-hidden ${pending ? "opacity-60 pointer-events-none" : ""}`} style={CARD_STYLE}>
      <button
        onClick={() => setShowSection(!showSection)}
        className="w-full flex items-center justify-between text-left hover:brightness-[0.97] transition" style={CARD_PAD_TIGHT}
      >
        <div className="flex items-center gap-3">
          {pendingReqs.length > 0 ? (
            <span className="text-xs font-medium text-amber-700">
              {pendingReqs.length} pending request{pendingReqs.length !== 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-xs font-medium text-stone-500">
              No pending requests
            </span>
          )}
          {recentResolved.length > 0 && (
            <span className="text-[10px] text-stone-400">
              {recentResolved.length} resolved
            </span>
          )}
        </div>
        <span className="text-stone-300 text-[10px]">{showSection ? "Close" : "See requests"}</span>
      </button>

      {showSection && (
        <div className="border-t border-stone-200 p-4 space-y-3">
          {/* Pending requests */}
          {pendingReqs.map((req) => {
            const teacherName = teacherNameMap.get(req.teacher_id) || "Unknown teacher";
            return (
              <div
                key={req.id}
                className="rounded-lg border border-amber-200 bg-amber-50/50 p-3"
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div>
                    <span className="text-xs font-medium text-stone-700">{teacherName}</span>
                    {req.class_name && (
                      <span className="text-[10px] text-stone-400 ml-2">
                        &ldquo;{req.class_name}&rdquo;
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] font-medium px-2.5 py-0.5 rounded bg-amber-100 text-amber-600 border border-amber-200">
                    pending
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    value={capOverrides[req.id] ?? req.requested_capacity ?? 9}
                    onChange={(e) => setCapOverrides((prev) => ({
                      ...prev,
                      [req.id]: Number(e.target.value),
                    }))}
                    className="rounded bg-stone-100 border border-stone-300 px-2 py-0.5 text-[10px] text-stone-800"
                    title="Class size (override if needed)"
                  >
                    <option value={9} className="bg-white">9 seats</option>
                    <option value={16} className="bg-white">16 seats</option>
                    <option value={25} className="bg-white">25 seats</option>
                  </select>
                  <button
                    onClick={() => {
                      const cap = capOverrides[req.id];
                      const reqCap = req.requested_capacity ?? 9;
                      const override = cap != null && cap !== reqCap ? cap : undefined;
                      act(() => approveClassRequest(req.id, override));
                    }}
                    className="text-[10px] font-medium px-3 py-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition"
                  >Approve</button>
                  <button
                    onClick={() => act(() => denyClassRequest(req.id))}
                    className="text-[10px] font-medium px-3 py-1 rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition"
                  >Deny</button>
                </div>
              </div>
            );
          })}

          {/* Recently resolved */}
          {recentResolved.length > 0 && (
            <>
              <div className="text-[9px] text-stone-300 uppercase tracking-wider pt-2">
                Recently resolved
              </div>
              {recentResolved.map((req) => {
                const teacherName = teacherNameMap.get(req.teacher_id) || "Unknown teacher";
                return (
                  <div
                    key={req.id}
                    className="rounded-lg border border-stone-100 p-2 opacity-60"
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
                  >
                    <div>
                      <span className="text-[11px] text-stone-500">{teacherName}</span>
                      {req.class_name && (
                        <span className="text-[10px] text-stone-300 ml-2">
                          &ldquo;{req.class_name}&rdquo;
                        </span>
                      )}
                    </div>
                    <span className={`text-[9px] font-medium px-2.5 py-0.5 rounded border ${
                      req.status === "approved"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                        : "border-red-200 bg-red-50 text-red-500"
                    }`}>
                      {req.status}
                    </span>
                  </div>
                );
              })}
            </>
          )}

          {error && <div className="text-xs text-red-400 pt-1">{error}</div>}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Teacher Profiles — Oversight tab, teacher-centric view
// ═════════════════════════════════════════════════════════════════════════
function TeacherProfilesSection({
  teachers,
}: {
  teachers: TeacherRow[];
}) {
  const [showSection, setShowSection] = useState(false);

  const activeTeachers = teachers.filter((t) => !t.is_archived);
  const archivedTeachers = teachers.filter((t) => t.is_archived);

  return (
    <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
      <button
        onClick={() => setShowSection(!showSection)}
        className="w-full flex items-center justify-between text-left hover:brightness-[0.97] transition" style={CARD_PAD_TIGHT}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium">
            {activeTeachers.length} active teacher{activeTeachers.length !== 1 ? "s" : ""}
          </span>
          {archivedTeachers.length > 0 && (
            <span className="text-[10px] text-stone-400">
              {archivedTeachers.length} archived
            </span>
          )}
        </div>
        <span className="text-stone-300 text-[10px]">{showSection ? "Close" : "See teachers"}</span>
      </button>

      {showSection && (
        <div className="border-t border-stone-200 p-3 space-y-2">
          {activeTeachers.map((t) => (
            <TeacherProfileRow key={t.id} teacher={t} />
          ))}
          {archivedTeachers.length > 0 && (
            <>
              <div className="text-[10px] text-stone-300 uppercase tracking-wider pt-3 pb-1 px-2">
                Archived ({archivedTeachers.length})
              </div>
              {archivedTeachers.map((t) => (
                <TeacherProfileRow key={t.id} teacher={t} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TeacherProfileRow({
  teacher: t,
}: {
  teacher: TeacherRow;
}) {
  const [open, setOpen] = useState(false);

  const activeClasses = t.classes
    .filter((c) => !c.is_archived)
    .sort((a, b) => {
      const da = a.game_starts_at ? new Date(a.game_starts_at).getTime() : 0;
      const db = b.game_starts_at ? new Date(b.game_starts_at).getTime() : 0;
      return db - da;
    });
  const archivedClasses = t.classes.filter((c) => c.is_archived);
  const name = t.display_name || t.username || "Unnamed";
  const totalStudents = activeClasses.reduce((sum, c) => sum + c.student_count, 0);

  return (
    <div className={`rounded-lg border overflow-hidden ${t.is_archived ? "border-stone-100 opacity-60" : "border-stone-200"}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-stone-50 transition text-xs"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">{name}</span>
          {t.is_admin && (
            <span className="text-[8px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">admin</span>
          )}
          <span className="text-stone-400 flex-shrink-0">
            {activeClasses.length} class{activeClasses.length !== 1 ? "es" : ""}
          </span>
          {totalStudents > 0 && (
            <span className="text-[10px] text-stone-300 flex-shrink-0">
              · {totalStudents} student{totalStudents !== 1 ? "s" : ""}
            </span>
          )}
          {archivedClasses.length > 0 && (
            <span className="text-[10px] text-stone-300 flex-shrink-0">
              + {archivedClasses.length} archived
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {t.starters.length > 0 && (
            <span className="text-[9px] px-2.5 py-0.5 rounded border border-stone-200 bg-stone-50 text-stone-400">
              {t.starters.filter((s) => s.is_active).length} photo{t.starters.filter((s) => s.is_active).length !== 1 ? "s" : ""}
            </span>
          )}
          <span className="text-stone-300 text-[10px]">{open ? "▾" : "▸"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-stone-200 px-4 py-3">
          {/* Profile link */}
          <div style={{ marginBottom: 10 }}>
            <a
              href={`/teachers/${t.id}`}
              className="text-[11px] font-medium text-amber-700 hover:text-amber-800"
              style={{ textDecoration: "none" }}
            >
              View profile →
            </a>
          </div>

          {/* Active classes list */}
          {activeClasses.length > 0 ? (
            <div>
              <div className="text-[9px] text-stone-400 uppercase tracking-wider mb-1.5">Active classes</div>
              <div className="space-y-1">
                {activeClasses.map((c) => (
                  <div
                    key={c.id}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
                    className="text-[11px] py-1 px-2 rounded bg-stone-50"
                  >
                    <span className="font-medium text-stone-600 truncate">{c.name}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-stone-400">{c.student_count} student{c.student_count !== 1 ? "s" : ""}</span>
                      {c.game_starts_at && (
                        <span className="text-[10px] text-stone-300">
                          {new Date(c.game_starts_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-stone-300 italic">No active classes</p>
          )}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Current Classes section — collapsible
// ═════════════════════════════════════════════════════════════════════════
function CurrentClassesSection({
  activeClasses,
  teachers,
}: {
  activeClasses: ClassRow[];
  teachers: TeacherRow[];
}) {
  const [showSection, setShowSection] = useState(false);

  const teacherStartersMap = new Map<string, StarterRow[]>();
  teachers.forEach((t) => {
    const name = t.display_name || t.username || "Unnamed";
    teacherStartersMap.set(name, t.starters);
  });

  if (activeClasses.length === 0) {
    return (
      <div className="rounded-xl p-6 text-center text-stone-300 text-xs" style={CARD_STYLE}>
        No active classes
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
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Archived Classes — separate section, grouped by teacher
// ═════════════════════════════════════════════════════════════════════════
function ArchivedClassesSection({
  archivedClasses,
  teachers,
}: {
  archivedClasses: ClassRow[];
  teachers: TeacherRow[];
}) {
  const [showSection, setShowSection] = useState(false);
  const [openTeacher, setOpenTeacher] = useState<string | null>(null);

  const teacherStartersMap = new Map<string, StarterRow[]>();
  teachers.forEach((t) => {
    const name = t.display_name || t.username || "Unnamed";
    teacherStartersMap.set(name, t.starters);
  });

  // Group archived classes by teacher name
  const byTeacher = new Map<string, ClassRow[]>();
  for (const c of archivedClasses) {
    const list = byTeacher.get(c.teacher_name) || [];
    list.push(c);
    byTeacher.set(c.teacher_name, list);
  }
  const teacherNames = [...byTeacher.keys()].sort();

  return (
    <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
      <button
        onClick={() => setShowSection(!showSection)}
        className="w-full flex items-center justify-between text-left hover:brightness-[0.97] transition" style={CARD_PAD_TIGHT}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium">
            {archivedClasses.length} archived class{archivedClasses.length !== 1 ? "es" : ""}
          </span>
          <span className="text-[10px] text-stone-400">
            {teacherNames.length} teacher{teacherNames.length !== 1 ? "s" : ""}
          </span>
        </div>
        <span className="text-stone-300 text-[10px]">{showSection ? "Close" : "See archived"}</span>
      </button>

      {showSection && (
        <div className="border-t border-stone-200 p-3 space-y-1">
          {teacherNames.map((tName) => {
            const classes = byTeacher.get(tName) || [];
            const isOpen = openTeacher === tName;
            return (
              <div key={tName} className="rounded-lg border border-stone-200 overflow-hidden">
                <button
                  onClick={() => setOpenTeacher(isOpen ? null : tName)}
                  className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-stone-50 transition text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-stone-600">{tName}</span>
                    <span className="text-stone-300">
                      {classes.length} class{classes.length !== 1 ? "es" : ""}
                    </span>
                  </div>
                  <span className="text-stone-300 text-[10px]">{isOpen ? "▾" : "▸"}</span>
                </button>
                {isOpen && (
                  <div className="border-t border-stone-100 p-2 space-y-2">
                    {classes.map((c) => (
                      <ClassCard
                        key={c.id}
                        cls={c}
                        starters={teacherStartersMap.get(c.teacher_name) || []}
                        isArchived={true}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
// Teacher coordination thread — standalone section
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
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
            placeholder="Message all teachers…"
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
          No messages yet. Use this thread to coordinate with teachers.
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
// Shared
// ═════════════════════════════════════════════════════════════════════════
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
