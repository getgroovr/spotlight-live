// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/admin/page.tsx   (REPLACES existing file)
//
// Session 96: Cleanup — removed WarmupConfig, GameSchedule types and
//   props. Simplified admin_settings query. Teachers control their own
//   schedules; admin dashboard no longer pushes centralized schedule.
// ─────────────────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { AdminClient, StandardModeLanding } from "./admin-client";
import type { MessageRow, Recipient } from "@/components/MessagePanel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Spotlight — Admin" };

// ── Types shared with admin-client.tsx ───────────────────────────────────
export type StudentRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  email: string | null;
};

export type GameRow = {
  id: string;
  name: string;
  status: string;
  round_count: number;
};

export type ClassRow = {
  id: string;
  name: string;
  capacity: number;
  student_count: number;
  students: StudentRow[];
  game: GameRow | null;
  round_topics: Record<string, string | null> | null;
  is_archived: boolean;
  total_rounds: number | null;
  round_duration_hours: number | null;
  game_phase_hours: number | null;       // D1
  review_phase_hours: number | null;     // D1
  game_starts_at: string | null;
  teacher_name: string;
};

export type StarterRow = {
  id: string;
  media_url: string;
  is_active: boolean;
  description_text: string | null;
};

export type TeacherRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  max_classes: number;
  is_admin: boolean;
  is_archived: boolean;
  rotation: {
    status: "recruiting" | "waiting" | "paused";
    sort_order: number;
  } | null;
  classes: ClassRow[];
  starters: StarterRow[];
};

// Session 82 Chunk C: added requested_capacity
export type ClassRequestRow = {
  id: string;
  teacher_id: string;
  status: "pending" | "approved" | "denied";
  requested_at: string;
  class_name: string | null;
  requested_capacity: number | null;
};

export type TopicRow = {
  id: string;
  topic_text: string;
  status: string;
  suggested_by: string | null;
  suggested_by_name: string | null;
  created_at: string;
};

// Session 90 Chunk J: schedule coordination thread
export type ScheduleThreadMessage = {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  isFromAdmin: boolean;
};

export default async function AdminPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <Frame>
        <p className="text-stone-500 text-center py-12">
          Supabase isn&apos;t configured.
        </p>
      </Frame>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // ── Admin check: is_admin boolean ─────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, is_admin")
    .eq("id", user.id)
    .single();
  if (!profile || !profile.is_admin) {
    return (
      <Frame>
        <p className="text-stone-500 text-center py-12">
          Your account does not have admin privileges.
        </p>
      </Frame>
    );
  }

  // ── Service client for auth admin lookups (student emails) ─────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminClient =
    supabaseUrl && serviceKey
      ? createServiceClient(supabaseUrl, serviceKey)
      : null;

  // ── Fetch all teachers (including archived) ───────────────────────
  const { data: teachers } = await supabase
    .from("profiles")
    .select("id, display_name, username, max_classes, is_admin, is_archived")
    .eq("role", "teacher")
    .order("display_name", { ascending: true });

  // ── Fetch rotation rows ────────────────────────────────────────────────
  const { data: rotationRows } = await supabase
    .from("teacher_rotation")
    .select("teacher_id, status, sort_order")
    .order("sort_order", { ascending: true });

  // ── Fetch all classes (D1: added game_phase_hours, review_phase_hours) ──
  const { data: classes } = await supabase
    .from("classes")
    .select(
      "id, teacher_id, name, capacity, round_topics, is_archived, total_rounds, round_duration_hours, game_phase_hours, review_phase_hours, game_starts_at",
    );

  // ── Fetch active enrollments ──────────────────────────────────────
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id, student_id, class_id, status")
    .eq("status", "active");

  // ── Fetch student profiles for enrolled students ──────────────────
  const enrolledStudentIds = [...new Set((enrollments || []).map((e) => e.student_id))];
  let studentProfiles: { id: string; display_name: string | null; username: string | null }[] = [];
  if (enrolledStudentIds.length > 0) {
    const { data: sp } = await supabase
      .from("profiles")
      .select("id, display_name, username")
      .in("id", enrolledStudentIds);
    studentProfiles = sp || [];
  }

  // ── Resolve student emails via auth admin ─────────────────────────
  const emailMap = new Map<string, string>();
  if (adminClient && enrolledStudentIds.length > 0) {
    for (const sid of enrolledStudentIds) {
      try {
        const {
          data: { user: authUser },
        } = await adminClient.auth.admin.getUserById(sid);
        if (authUser?.email) {
          emailMap.set(sid, authUser.email);
        }
      } catch {
        // Skip — email unavailable
      }
    }
  }

  // ── Fetch games ───────────────────────────────────────────────────
  const { data: games } = await supabase
    .from("games")
    .select("id, class_id, name, status, round_count");

  // ── Fetch starters (warm-up photos) ───────────────────────────────
  const { data: starters } = await supabase
    .from("entries")
    .select("id, student_id, class_id, media_url, is_active, description_text")
    .eq("is_starter", true)
    .eq("status", "live");

  // ── Generate signed URLs for starter photos ───────────────────────
  const signedStarters = await Promise.all(
    (starters || []).map(async (s) => {
      let displayUrl = s.media_url;
      if (s.media_url && !s.media_url.startsWith("http")) {
        const { data: signed } = await supabase.storage
          .from("teacher-deck")
          .createSignedUrl(s.media_url, 3600);
        if (signed?.signedUrl) {
          displayUrl = signed.signedUrl;
        }
      }
      return { ...s, media_url: displayUrl };
    }),
  );

  // ── Fetch admin settings (just need app_mode) ──────────────────────────
  const { data: settings } = await supabase
    .from("admin_settings")
    .select("app_mode")
    .eq("id", 1)
    .single();

  // ── M2: Mode check ──────────────────────────────────────────────────
  const appMode = (settings?.app_mode as "standard" | "multi") || "standard";
  if (appMode === "standard") {
    // Show a simple landing page instead of redirecting —
    // lets admin switch to multi mode from /admin
    return (
      <Frame>
        <StandardModeLanding />
      </Frame>
    );
  }

  // ── Fetch class requests (now includes requested_capacity) ────────
  const { data: classRequests } = await supabase
    .from("class_requests")
    .select("id, teacher_id, status, requested_at, class_name, requested_capacity")
    .order("requested_at", { ascending: true });

  // ── Fetch game topics (session 79) ────────────────────────────────
  const { data: rawTopics } = await supabase
    .from("game_topics")
    .select("id, topic_text, status, suggested_by, created_at")
    .order("topic_text", { ascending: true });

  // Resolve suggested_by to teacher names
  const suggestedByIds = [...new Set(
    (rawTopics || []).map((t) => t.suggested_by).filter(Boolean) as string[],
  )];
  const suggestedByNameMap = new Map<string, string>();
  if (suggestedByIds.length > 0) {
    const { data: suggesters } = await supabase
      .from("profiles")
      .select("id, display_name, username")
      .in("id", suggestedByIds);
    for (const s of suggesters || []) {
      suggestedByNameMap.set(s.id, s.display_name || s.username || "Unknown");
    }
  }

  const topicRows: TopicRow[] = (rawTopics || []).map((t) => ({
    id: t.id,
    topic_text: t.topic_text,
    status: t.status,
    suggested_by: t.suggested_by,
    suggested_by_name: t.suggested_by ? (suggestedByNameMap.get(t.suggested_by) || "Unknown") : null,
    created_at: t.created_at,
  }));

  // ── Build lookup maps ─────────────────────────────────────────────
  const rotationMap = new Map<
    string,
    { status: "recruiting" | "waiting" | "paused"; sort_order: number }
  >();
  (rotationRows || []).forEach((r) => {
    rotationMap.set(r.teacher_id, {
      status: r.status as "recruiting" | "waiting" | "paused",
      sort_order: r.sort_order,
    });
  });

  const studentProfileMap = new Map<string, { display_name: string | null; username: string | null }>();
  studentProfiles.forEach((sp) => {
    studentProfileMap.set(sp.id, { display_name: sp.display_name, username: sp.username });
  });

  const enrollmentsByClass = new Map<string, string[]>();
  (enrollments || []).forEach((e) => {
    const list = enrollmentsByClass.get(e.class_id) || [];
    list.push(e.student_id);
    enrollmentsByClass.set(e.class_id, list);
  });

  const gameByClass = new Map<string, GameRow>();
  (games || []).forEach((g) => {
    gameByClass.set(g.class_id, {
      id: g.id,
      name: g.name,
      status: g.status,
      round_count: g.round_count,
    });
  });

  const startersByTeacher = new Map<string, StarterRow[]>();
  signedStarters.forEach((s) => {
    const list = startersByTeacher.get(s.student_id) || [];
    list.push({
      id: s.id,
      media_url: s.media_url,
      is_active: s.is_active,
      description_text: s.description_text,
    });
    startersByTeacher.set(s.student_id, list);
  });

  // ── Build teacher name map (for classRow.teacher_name) ─────────────
  const teacherNameMap = new Map<string, string>();
  (teachers || []).forEach((t) => {
    teacherNameMap.set(t.id, t.display_name || t.username || "Unnamed");
  });

  // ── MESSAGE DATA (session 77) ──────────────────────────────────────
  let msgMessages: MessageRow[] = [];
  let msgRecipients: Recipient[] = [];
  let msgUnreadCount = 0;

  {
    // Chunk K: exclude archived messages; Chunk J: exclude schedule thread
    const { data: rawMsgs } = await supabase
      .from("messages")
      .select("id, sender_id, recipient_id, body, is_read, created_at")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .or("is_archived.is.null,is_archived.eq.false")
      .is("thread_context", null)
      .order("created_at", { ascending: false })
      .limit(50);

    msgUnreadCount = (rawMsgs || []).filter(
      (m) => m.recipient_id === user.id && !m.is_read,
    ).length;

    const msgPids = new Set<string>();
    for (const m of rawMsgs || []) {
      msgPids.add(m.sender_id);
      msgPids.add(m.recipient_id);
    }
    for (const t of teachers || []) msgPids.add(t.id);
    for (const sid of enrolledStudentIds) msgPids.add(sid);

    const nameMap = new Map<string, string>();
    if (msgPids.size > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, username")
        .in("id", [...msgPids]);
      for (const p of profs || []) {
        nameMap.set(p.id, p.display_name || p.username || "Unknown");
      }
    }
    studentProfiles.forEach((sp) => {
      if (sp.display_name) nameMap.set(sp.id, sp.display_name);
    });

    msgMessages = (rawMsgs || []).map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      senderName: nameMap.get(m.sender_id) || "Unknown",
      recipientId: m.recipient_id,
      recipientName: nameMap.get(m.recipient_id) || "You",
      body: m.body,
      isRead: m.is_read,
      createdAt: m.created_at,
    }));

    for (const t of teachers || []) {
      if (t.id !== user.id) {
        msgRecipients.push({
          id: t.id,
          name: nameMap.get(t.id) || t.display_name || t.username || "Teacher",
          role: "teacher",
        });
      }
    }
    for (const sid of enrolledStudentIds) {
      if (sid !== user.id) {
        const sp = studentProfileMap.get(sid);
        msgRecipients.push({
          id: sid,
          name: nameMap.get(sid) || sp?.display_name || sp?.username || "Student",
          role: "student",
        });
      }
    }
  }

  // ── SCHEDULE THREAD (session 90 Chunk J) ─────────────────────────
  let scheduleThread: ScheduleThreadMessage[] = [];
  {
    const { data: threadMsgs } = await supabase
      .from("messages")
      .select("id, sender_id, recipient_id, body, created_at")
      .eq("thread_context", "schedule")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order("created_at", { ascending: true })
      .limit(100);

    if (threadMsgs && threadMsgs.length > 0) {
      // Deduplicate: admin broadcasts create one row per teacher.
      // For display, show each unique (sender_id, body, created_at) combo once.
      const seen = new Set<string>();
      const deduped: typeof threadMsgs = [];
      for (const m of threadMsgs) {
        const key = `${m.sender_id}|${m.body}|${m.created_at}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(m);
        }
      }

      // Resolve names for thread participants
      const threadPids = new Set<string>();
      for (const m of deduped) {
        threadPids.add(m.sender_id);
      }
      const threadNameMap = new Map<string, string>();
      if (threadPids.size > 0) {
        const { data: tProfs } = await supabase
          .from("profiles")
          .select("id, display_name, username")
          .in("id", [...threadPids]);
        for (const p of tProfs || []) {
          threadNameMap.set(p.id, p.display_name || p.username || "Unknown");
        }
      }

      scheduleThread = deduped.map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        senderName: threadNameMap.get(m.sender_id) || "Unknown",
        body: m.body,
        createdAt: m.created_at,
        isFromAdmin: m.sender_id === user.id,
      }));
    }
  }

  // ── Assemble teacher rows with nested data ────────────────────────
  const teacherRows: TeacherRow[] = (teachers || []).map((t) => {
    const rot = rotationMap.get(t.id);
    const teacherClasses: ClassRow[] = (classes || [])
      .filter((c) => c.teacher_id === t.id)
      .map((c) => {
        const studentIds = enrollmentsByClass.get(c.id) || [];
        const students: StudentRow[] = studentIds.map((sid) => {
          const sp = studentProfileMap.get(sid);
          return {
            id: sid,
            display_name: sp?.display_name || null,
            username: sp?.username || null,
            email: emailMap.get(sid) || null,
          };
        });
        return {
          id: c.id,
          name: c.name,
          capacity: c.capacity,
          student_count: studentIds.length,
          students,
          game: gameByClass.get(c.id) || null,
          round_topics: (c as any).round_topics || null,
          is_archived: (c as any).is_archived ?? false,
          total_rounds: (c as any).total_rounds ?? null,
          round_duration_hours: (c as any).round_duration_hours != null ? Number((c as any).round_duration_hours) : null,
          game_phase_hours: (c as any).game_phase_hours != null ? Number((c as any).game_phase_hours) : null,
          review_phase_hours: (c as any).review_phase_hours != null ? Number((c as any).review_phase_hours) : null,
          game_starts_at: (c as any).game_starts_at ?? null,
          teacher_name: teacherNameMap.get(t.id) || "Unnamed",
        };
      });

    return {
      id: t.id,
      display_name: t.display_name,
      username: t.username,
      max_classes: t.max_classes,
      is_admin: t.is_admin ?? false,
      is_archived: t.is_archived ?? false,
      rotation: rot
        ? { status: rot.status, sort_order: rot.sort_order }
        : null,
      classes: teacherClasses,
      starters: startersByTeacher.get(t.id) || [],
    };
  });

  return (
    <Frame>
      <AdminClient
        teachers={teacherRows}
        topicOptions={(topicRows || []).filter((t) => t.status === "approved").map((t) => t.topic_text)}
        classRequests={(classRequests || []) as ClassRequestRow[]}
        topics={topicRows}
        msgMessages={msgMessages}
        msgRecipients={msgRecipients}
        msgUnreadCount={msgUnreadCount}
        msgUserId={user.id}
        isTeacherAdmin={profile.role === "teacher"}
        appMode={appMode}
        scheduleThread={scheduleThread}
      />
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-amber-50 to-stone-100 p-4 sm:p-6 text-stone-800">
      <div style={{ maxWidth: 660, margin: "0 auto", width: "100%" }}>{children}</div>
    </main>
  );
}
