// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/admin/page.tsx   (REPLACES existing file)
//
// Session 69 layout (v4).
// Session 74: C4 — class request workflow.
// Session 75: Starter photo approval.
// Session 77: C5 — Messaging.
// Session 79: Chunk 3 — Game topics + round_topics.
// Session 80: Game schedule.
// Session 81: Chunk 1.5 + Chunk 2 overhaul.
// Session 82: Chunk C — ClassRequestRow adds requested_capacity.
//             Chunk E — query fetches requested_capacity for class requests.
// Session 84: Chunk D1 — game_phase_hours + review_phase_hours on
//             admin_settings, classes, and GameSchedule type.
// ─────────────────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { AdminClient } from "./admin-client";
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
  willing_trio: boolean;
  willing_nine: boolean;
  classes: ClassRow[];
  starters: StarterRow[];
};

export type WarmupConfig = {
  warmup_teacher_count: 1 | 3 | 9;
};

export type GameSchedule = {
  game_total_rounds: number | null;
  game_round_duration_hours: number | null;
  game_phase_hours: number | null;       // D1
  review_phase_hours: number | null;     // D1
  game_starts_at: string | null;
  game_round_topics: Record<string, string | null> | null;
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

export default async function AdminPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <Frame>
        <p className="text-white/70 text-center py-12">
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
        <p className="text-white/70 text-center py-12">
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

  // ── Fetch rotation rows (now includes mode prefs) ─────────────────
  const { data: rotationRows } = await supabase
    .from("teacher_rotation")
    .select("teacher_id, status, sort_order, willing_trio, willing_nine")
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

  // ── Fetch admin settings (D1: added game_phase_hours, review_phase_hours) ──
  const { data: settings } = await supabase
    .from("admin_settings")
    .select("warmup_teacher_count, game_total_rounds, game_round_duration_hours, game_phase_hours, review_phase_hours, game_starts_at, game_round_topics")
    .eq("id", 1)
    .single();

  const warmupConfig: WarmupConfig = {
    warmup_teacher_count: (settings?.warmup_teacher_count as 1 | 3 | 9) || 1,
  };

  const gameSchedule: GameSchedule = {
    game_total_rounds: settings?.game_total_rounds ?? null,
    game_round_duration_hours: settings?.game_round_duration_hours != null ? Number(settings.game_round_duration_hours) : null,
    game_phase_hours: settings?.game_phase_hours != null ? Number(settings.game_phase_hours) : null,
    review_phase_hours: settings?.review_phase_hours != null ? Number(settings.review_phase_hours) : null,
    game_starts_at: settings?.game_starts_at ?? null,
    game_round_topics: settings?.game_round_topics as Record<string, string | null> | null ?? null,
  };

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
    { status: "recruiting" | "waiting" | "paused"; sort_order: number; willing_trio: boolean; willing_nine: boolean }
  >();
  (rotationRows || []).forEach((r) => {
    rotationMap.set(r.teacher_id, {
      status: r.status as "recruiting" | "waiting" | "paused",
      sort_order: r.sort_order,
      willing_trio: r.willing_trio ?? false,
      willing_nine: r.willing_nine ?? false,
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
    const { data: rawMsgs } = await supabase
      .from("messages")
      .select("id, sender_id, recipient_id, body, is_read, created_at")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
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
      willing_trio: rot?.willing_trio ?? false,
      willing_nine: rot?.willing_nine ?? false,
      classes: teacherClasses,
      starters: startersByTeacher.get(t.id) || [],
    };
  });

  // ── Mode preference tallies ───────────────────────────────────────
  const willingTrioCount = teacherRows.filter((t) => t.willing_trio).length;
  const willingNineCount = teacherRows.filter((t) => t.willing_nine).length;

  return (
    <Frame>
      <AdminClient
        teachers={teacherRows}
        warmupConfig={warmupConfig}
        gameSchedule={gameSchedule}
        topicOptions={(topicRows || []).filter((t) => t.status === "approved").map((t) => t.topic_text)}
        classRequests={(classRequests || []) as ClassRequestRow[]}
        topics={topicRows}
        msgMessages={msgMessages}
        msgRecipients={msgRecipients}
        msgUnreadCount={msgUnreadCount}
        msgUserId={user.id}
        willingTrioCount={willingTrioCount}
        willingNineCount={willingNineCount}
      />
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-blue-950 p-4 sm:p-6 text-white">
      <div style={{ maxWidth: 660, margin: "0 auto", width: "100%" }}>{children}</div>
    </main>
  );
}
