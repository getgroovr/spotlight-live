// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/page.tsx   (REPLACES existing file)
//
// Session 94:
//   - ClassRow gains level and round_prompts fields
//   - round_prompts passed to ClassHeader
//   - Students grouped by class under collapsible cards with level badges
//   - Enrollment counts fetched for all active classes
//   - Selected class expanded with students; others show compact summary
// ─────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  computeCurrentRound,
  computeCurrentPhase,
  isGameOver,
  type ClassTiming,
} from "@/lib/round-timing";
import { ClassHeader, type TopicOption } from "./class-header";
import {
  PendingQueue,
  type PendingEntryData,
  type PendingFavoriteCommentData,
} from "./pending-queue";
import { RequestClassSection } from "./request-class";
import MessagePanel, { type MessageRow, type Recipient } from "@/components/MessagePanel";
import { ArchiveClassButton } from "./archive-class-button";
import { DeleteClassButton } from "./delete-class-button";


const MEDIA_BUCKET = "media";

export const dynamic = "force-dynamic";

const C = {
  bg: "#FBF6EC",
  panel: "#F3E4C4",
  panelEdge: "#C9A877",
  light: "#D98A2B",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
};
const F = "'Outfit',sans-serif";

type ClassRow = {
  id: string;
  name: string;
  total_rounds: number | null;
  round_duration_hours: number | string | null;
  game_phase_hours: number | string | null;
  review_phase_hours: number | string | null;
  game_starts_at: string | null;
  created_at: string | null;
  round_topics: Record<string, string | null> | null;
  is_archived: boolean;
  teacher_prompt: string | null;
  level: string | null;                                    // Session 94
  round_prompts: Record<string, string | null> | null;     // Session 94
};

type StudentCard = {
  id: string;
  displayName: string;
  realName: string | null;
  commentCount: number;
  profileComplete: boolean;
  completedAt: string | null;
  round: number | null;
  photoUrl: string | null;
};

type PageData =
  | { error: "no-session" | "config" }
  | {
      zeroClasses: true;
      hasPendingRequest: boolean;
      msgMessages: MessageRow[];
      msgRecipients: Recipient[];
      msgUnreadCount: number;
      msgUserId: string;
    }
  | {
      zeroClasses?: false;
      classes: ClassRow[];
      selectedClass: ClassRow;
      students: StudentCard[];
      pendingEntries: PendingEntryData[];
      pendingFavoriteComments: PendingFavoriteCommentData[];
      hasPendingRequest: boolean;
      topicOptions: string[];
      topicOptionsWithId: TopicOption[];
      currentRound: number;
      currentPhase: "game" | "review" | null;
      msgMessages: MessageRow[];
      msgRecipients: Recipient[];
      msgUnreadCount: number;
      msgUserId: string;
      msgClassId: string;
      archivedEnrollmentCounts: Record<string, number>;
      activeClassCounts: Record<string, number>;            // Session 94
    };

async function getPageData(classParam: string | undefined): Promise<PageData> {
  const supabase = await createClient();
  if (!supabase) return { error: "config" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "no-session" };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { error: "config" };
  const admin = createServiceClient(supabaseUrl, serviceKey);

  const { data: classRows } = await admin
    .from("classes")
    .select(
      "id, name, total_rounds, round_duration_hours, game_phase_hours, review_phase_hours, game_starts_at, created_at, round_topics, is_archived, teacher_prompt, level, round_prompts",
    )
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });

  // ── Session 78: fetch approved game topics ────────────────────────────
  const { data: topicRows } = await admin
    .from("game_topics")
    .select("id, topic_text")
    .eq("status", "approved")
    .order("topic_text", { ascending: true });
  const topicOptions = (topicRows || []).map((r: { id: string; topic_text: string }) => r.topic_text);
  const topicOptionsWithId: TopicOption[] = (topicRows || []).map(
    (r: { id: string; topic_text: string }) => ({ id: r.id, text: r.topic_text }),
  );

  const classes = (classRows || []) as ClassRow[];

  // ── Zero-class teacher → show create form ─────────────────────────────
  if (classes.length === 0) {
    const { data: pendingReqs } = await admin
      .from("class_requests")
      .select("id")
      .eq("teacher_id", user.id)
      .eq("status", "pending")
      .limit(1);
    const hasPendingRequest = (pendingReqs?.length || 0) > 0;

    const { data: adminRows } = await admin
      .from("profiles")
      .select("id, display_name, username, role, is_admin")
      .eq("is_admin", true);

    const msgRecipients: Recipient[] = [];
    for (const a of adminRows || []) {
      if (a.id !== user.id) {
        msgRecipients.push({
          id: a.id,
          name: a.display_name || a.username || "Admin",
          role: "admin",
        });
      }
    }

    const { data: rawMsgs } = await admin
      .from("messages")
      .select("id, sender_id, recipient_id, body, is_read, created_at")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(50);

    const msgUnreadCount = (rawMsgs || []).filter(
      (m) => m.recipient_id === user.id && !m.is_read,
    ).length;

    const nameMap = new Map<string, string>();
    for (const a of adminRows || []) {
      nameMap.set(a.id, a.display_name || a.username || "Admin");
    }

    const msgMessages: MessageRow[] = (rawMsgs || []).map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      senderName: nameMap.get(m.sender_id) || "You",
      recipientId: m.recipient_id,
      recipientName: nameMap.get(m.recipient_id) || "You",
      body: m.body,
      isRead: m.is_read,
      createdAt: m.created_at,
    }));

    return {
      zeroClasses: true,
      hasPendingRequest,
      msgMessages,
      msgRecipients,
      msgUnreadCount,
      msgUserId: user.id,
    };
  }

  // ── Auto-archive completed games ──────────────────────────────────────
  const now = new Date();
  for (const cls of classes) {
    if (cls.is_archived) continue;
    if (!cls.game_starts_at) continue;
    const timing: ClassTiming = {
      total_rounds: cls.total_rounds,
      game_starts_at: cls.game_starts_at,
      round_duration_hours:
        cls.round_duration_hours === null
          ? null
          : Number(cls.round_duration_hours),
    };
    if (isGameOver(timing, now)) {
      await admin
        .from("classes")
        .update({ is_archived: true, archived_at: now.toISOString() })
        .eq("id", cls.id);
      cls.is_archived = true;
    }
  }

  const activeAfterArchive = classes.filter((c) => !c.is_archived);

  let selectedClass = activeAfterArchive[0] || classes[0];
  if (classParam) {
    const match = classes.find((c) => c.id === classParam);
    if (match) {
      if (match.is_archived && activeAfterArchive.length > 0) {
        selectedClass = activeAfterArchive[0];
      } else {
        selectedClass = match;
      }
    }
  }

  // ── Compute current round for topic locking ───────────────────────────
  let currentRound = 0;
  if (selectedClass.game_starts_at) {
    const start = new Date(selectedClass.game_starts_at);
    if (start <= now) {
      const selTiming: ClassTiming = {
        total_rounds: selectedClass.total_rounds,
        game_starts_at: selectedClass.game_starts_at,
        round_duration_hours:
          selectedClass.round_duration_hours === null
            ? null
            : Number(selectedClass.round_duration_hours),
      };
      if (isGameOver(selTiming, now)) {
        currentRound = (selectedClass.total_rounds ?? 0) + 1;
      } else {
        currentRound = computeCurrentRound(selTiming, now);
      }
    }
  }

  // ── Compute current phase (game / review) ─────────────────────────────
  let currentPhase: "game" | "review" | null = null;
  if (selectedClass.game_starts_at && currentRound > 0) {
    const phaseTiming: ClassTiming = {
      total_rounds: selectedClass.total_rounds,
      game_starts_at: selectedClass.game_starts_at,
      round_duration_hours:
        selectedClass.round_duration_hours === null
          ? null
          : Number(selectedClass.round_duration_hours),
      game_phase_hours:
        selectedClass.game_phase_hours === null
          ? null
          : Number(selectedClass.game_phase_hours),
      review_phase_hours:
        selectedClass.review_phase_hours === null
          ? null
          : Number(selectedClass.review_phase_hours),
    };
    currentPhase = computeCurrentPhase(phaseTiming, now);
  }

  // ── Enrollments + students for selected class ─────────────────────────
  const { data: enrollments } = await admin
    .from("enrollments")
    .select(
      "student_id, class_id, round, enrolled_at, students(id, name, screen_name, email, photo_url)",
    )
    .eq("class_id", selectedClass.id)
    .order("enrolled_at", { ascending: false });

  const emailToName = new Map<string, string>();
  for (const e of enrollments || []) {
    const s = e.students as any;
    if (s?.email) {
      emailToName.set(
        s.email.toLowerCase(),
        s.screen_name || s.name || s.email,
      );
    }
  }

  const students: StudentCard[] = await Promise.all(
    (enrollments || []).map(async (e: any) => {
      const s = e.students;
      const { data: session } = await admin
        .from("game_sessions")
        .select("comments, favorite_comment, completed_at")
        .eq("student_id", s.id)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const commentCount = session?.comments
        ? Object.keys(session.comments).length
        : 0;
      const profileComplete = !!(
        s.name &&
        s.screen_name &&
        session?.favorite_comment
      );

      let photoUrl: string | null = null;
      if (s.photo_url) {
        if ((s.photo_url as string).startsWith("http://") || (s.photo_url as string).startsWith("https://")) {
          photoUrl = s.photo_url as string;
        } else {
          try {
            const { data, error } = await admin.storage
              .from(MEDIA_BUCKET)
              .createSignedUrl(s.photo_url, 3600);
            if (error) console.error(`[teacher] photo sign failed for ${s.photo_url}:`, error.message);
            photoUrl = data?.signedUrl ?? null;
          } catch (e) {
            console.error(`[teacher] photo sign threw for ${s.photo_url}:`, e);
          }
        }
      }

      return {
        id: s.id,
        displayName: s.screen_name || s.name || s.email,
        realName: s.name || null,
        commentCount,
        profileComplete,
        completedAt: session?.completed_at || null,
        round: e.round,
        photoUrl,
      };
    }),
  );

  // ── Pending entries ───────────────────────────────────────────────────
  const { data: pendingRows } = await admin
    .from("entries")
    .select(
      "id, media_url, description_text, round_number, uploaded_at, student_id",
    )
    .eq("class_id", selectedClass.id)
    .eq("status", "pending")
    .eq("is_starter", false)
    .order("round_number", { ascending: true })
    .order("uploaded_at", { ascending: true });

  const uidEmailCache = new Map<string, string>();
  const pendingEntries: PendingEntryData[] = [];

  for (const pe of pendingRows || []) {
    let email = uidEmailCache.get(pe.student_id);
    if (email === undefined) {
      try {
        const {
          data: { user: authUser },
        } = await admin.auth.admin.getUserById(pe.student_id);
        email = authUser?.email?.toLowerCase() || "";
      } catch {
        email = "";
      }
      uidEmailCache.set(pe.student_id, email);
    }

    let thumbnailUrl: string | null = null;
    if (pe.media_url) {
      if (pe.media_url.startsWith("http://") || pe.media_url.startsWith("https://")) {
        thumbnailUrl = pe.media_url;
      } else {
        try {
          const { data, error } = await admin.storage
            .from(MEDIA_BUCKET)
            .createSignedUrl(pe.media_url, 3600);
          if (error) console.error(`[teacher] entry sign failed for ${pe.media_url}:`, error.message);
          thumbnailUrl = data?.signedUrl ?? null;
        } catch (e) {
          console.error(`[teacher] entry sign threw for ${pe.media_url}:`, e);
        }
      }
    }

    pendingEntries.push({
      id: pe.id,
      thumbnailUrl,
      descriptionText: pe.description_text || "",
      roundNumber: pe.round_number,
      studentName: emailToName.get(email) || email || "Unknown student",
    });
  }

  // ── Pending favorite comments ─────────────────────────────────────────
  const { data: pendingFcRows } = await admin
    .from("game_sessions")
    .select(
      "id, student_id, round, favorite_comment, comments, favorites",
    )
    .eq("class_id", selectedClass.id)
    .eq("favorite_comment_status", "pending")
    .gt("round", 0);

  const pendingFavoriteComments: PendingFavoriteCommentData[] = [];

  for (const gs of pendingFcRows || []) {
    const { data: studentRow } = await admin
      .from("students")
      .select("screen_name, name, email")
      .eq("id", gs.student_id)
      .maybeSingle();
    const studentName =
      studentRow?.screen_name ||
      studentRow?.name ||
      studentRow?.email ||
      "Unknown student";

    const favorites = (gs.favorites || {}) as Record<string, boolean>;
    const comments = (gs.comments || {}) as Record<string, string>;
    const favEntryId = Object.keys(favorites).find((k) => favorites[k]);
    const commentOnPic = favEntryId ? comments[favEntryId] || "" : "";

    let favThumbnailUrl: string | null = null;
    if (favEntryId) {
      const { data: favEntry } = await admin
        .from("entries")
        .select("media_url, is_starter")
        .eq("id", favEntryId)
        .maybeSingle();
      if (favEntry?.media_url) {
        if (favEntry.media_url.startsWith("http://") || favEntry.media_url.startsWith("https://")) {
          favThumbnailUrl = favEntry.media_url;
        } else if (favEntry.is_starter) {
          const { data: pub } = admin.storage
            .from("teacher-deck")
            .getPublicUrl(favEntry.media_url);
          favThumbnailUrl = pub?.publicUrl ?? null;
        } else {
          try {
            const { data, error } = await admin.storage
              .from(MEDIA_BUCKET)
              .createSignedUrl(favEntry.media_url, 3600);
            if (error) console.error(`[teacher] fav sign failed for ${favEntry.media_url}:`, error.message);
            favThumbnailUrl = data?.signedUrl ?? null;
          } catch (e) {
            console.error(`[teacher] fav sign threw for ${favEntry.media_url}:`, e);
          }
        }
      }
    }

    pendingFavoriteComments.push({
      sessionId: gs.id,
      studentName,
      favoritedEntryThumbnailUrl: favThumbnailUrl,
      commentOnPic,
      whyFavorite: gs.favorite_comment || "",
      roundNumber: gs.round || 0,
    });
  }

  // ── Class request status ──────────────────────────────────────────────
  const { data: pendingReqs } = await admin
    .from("class_requests")
    .select("id")
    .eq("teacher_id", user.id)
    .eq("status", "pending")
    .limit(1);
  const hasPendingRequest = (pendingReqs?.length || 0) > 0;

  // ── MESSAGE DATA ──────────────────────────────────────────────────────
  let msgMessages: MessageRow[] = [];
  let msgRecipients: Recipient[] = [];
  let msgUnreadCount = 0;
  const msgUserId = user.id;
  const msgClassId = selectedClass.id;

  const { data: rawMsgs } = await admin
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

  const { data: adminRows } = await admin
    .from("profiles")
    .select("id, display_name")
    .eq("is_admin", true);
  for (const a of adminRows || []) msgPids.add(a.id);

  for (const s of students) msgPids.add(s.id);

  const nameMap = new Map<string, { name: string; role: string; isAdmin: boolean }>();
  if (msgPids.size > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, display_name, username, role, is_admin")
      .in("id", [...msgPids]);
    for (const p of profs || []) {
      nameMap.set(p.id, {
        name: p.display_name || p.username || "Unknown",
        role: p.role || "student",
        isAdmin: p.is_admin ?? false,
      });
    }
  }

  for (const s of students) {
    const existing = nameMap.get(s.id);
    if (!existing || existing.name === "Unknown") {
      nameMap.set(s.id, { name: s.displayName, role: "student", isAdmin: false });
    }
  }

  msgMessages = (rawMsgs || []).map((m) => ({
    id: m.id,
    senderId: m.sender_id,
    senderName: nameMap.get(m.sender_id)?.name || "Unknown",
    recipientId: m.recipient_id,
    recipientName: nameMap.get(m.recipient_id)?.name || "You",
    body: m.body,
    isRead: m.is_read,
    createdAt: m.created_at,
  }));

  for (const a of adminRows || []) {
    if (a.id !== user.id) {
      msgRecipients.push({
        id: a.id,
        name: nameMap.get(a.id)?.name || a.display_name || "Admin",
        role: "admin",
      });
    }
  }
  for (const s of students) {
    msgRecipients.push({ id: s.id, name: s.displayName, role: "student" });
  }

  // ── Archived enrollment counts ────────────────────────────────────────
  const archivedIds = classes.filter((c) => c.is_archived).map((c) => c.id);
  const archivedEnrollmentCounts: Record<string, number> = {};
  for (const aId of archivedIds) {
    const { count } = await admin
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("class_id", aId);
    archivedEnrollmentCounts[aId] = count ?? 0;
  }

  // ── Session 94: active class enrollment counts ────────────────────────
  const activeClassCounts: Record<string, number> = {};
  for (const cls of activeAfterArchive) {
    if (cls.id === selectedClass.id) {
      activeClassCounts[cls.id] = students.length;
    } else {
      const { count } = await admin
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("class_id", cls.id);
      activeClassCounts[cls.id] = count ?? 0;
    }
  }

  return {
    classes,
    selectedClass,
    students,
    pendingEntries,
    pendingFavoriteComments,
    hasPendingRequest,
    topicOptions,
    topicOptionsWithId,
    currentRound,
    currentPhase,
    msgMessages,
    msgRecipients,
    msgUnreadCount,
    msgUserId,
    msgClassId,
    archivedEnrollmentCounts,
    activeClassCounts,
  };
}

function buildStatusLine(cls: ClassRow): string {
  if (!cls.game_starts_at) return "Not yet scheduled.";

  const timing: ClassTiming = {
    total_rounds: cls.total_rounds,
    game_starts_at: cls.game_starts_at,
    round_duration_hours:
      cls.round_duration_hours === null
        ? null
        : Number(cls.round_duration_hours),
  };

  const now = new Date();
  const start = new Date(cls.game_starts_at);

  if (start > now) {
    return `Scheduled to start ${start.toLocaleString()}.`;
  }

  if (isGameOver(timing, now)) {
    return `Game complete — ${cls.total_rounds ?? 0} rounds finished.`;
  }

  const current = computeCurrentRound(timing, now);
  const elapsedMs = now.getTime() - start.getTime();
  const days = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor(elapsedMs / (1000 * 60 * 60));
  const minutes = Math.floor(elapsedMs / (1000 * 60));
  const ago =
    days >= 1
      ? `${days}d ago`
      : hours >= 1
        ? `${hours}h ago`
        : `${minutes}m ago`;

  return `Game started ${ago} — round ${current} of ${cls.total_rounds ?? "?"}`;
}

const LEVEL_LABELS: Record<string, string> = {
  beginner: "Beginning",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

function TopNav() {
  return (
    <nav
      style={{
        display: "flex",
        gap: 24,
        marginBottom: 16,
        fontSize: 14,
        borderBottom: `1px solid ${C.panelEdge}55`,
        paddingBottom: 0,
      }}
    >
      <span
        style={{
          fontWeight: 700,
          color: C.light,
          borderBottom: `2px solid ${C.light}`,
          paddingBottom: 6,
          marginBottom: -1,
        }}
      >
        Class
      </span>
      <Link
        href="/teacher/deck"
        style={{
          color: C.textDim,
          textDecoration: "none",
          paddingBottom: 6,
          marginBottom: -1,
          fontWeight: 500,
        }}
      >
        Deck
      </Link>
    </nav>
  );
}

export default async function TeacherStudents({
  searchParams,
}: {
  searchParams: Promise<{ class?: string | string[] }>;
}) {
  const params = await searchParams;
  const classParam =
    typeof params.class === "string" ? params.class : undefined;

  const data = await getPageData(classParam);

  if ("error" in data && data.error === "no-session") {
    redirect("/teacher/deck");
  }

  if ("error" in data) {
    return (
      <div
        style={{
          background: C.bg,
          minHeight: "100vh",
          padding: "4rem 1rem",
          fontFamily: F,
          color: C.text,
          textAlign: "center",
          colorScheme: "light",
        }}
      >
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>Something&apos;s off</h1>
        <p style={{ color: C.textDim }}>Server not configured.</p>
      </div>
    );
  }

  // ── Zero-class teacher → show create form ─────────────────────────────
  if ("zeroClasses" in data && data.zeroClasses) {
    return (
      <div
        style={{
          background: C.bg,
          minHeight: "100vh",
          padding: "1.5rem 1rem 4rem",
          fontFamily: F,
          color: C.text,
          colorScheme: "light",
        }}
      >
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <TopNav />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>
              Your classes
            </h1>
            <MessagePanel
              messages={data.msgMessages}
              recipients={data.msgRecipients}
              unreadCount={data.msgUnreadCount}
              currentUserId={data.msgUserId}
              classId=""
              theme="warm"
              canSendToAll={false}
              allStudentsClassId=""
            />
          </div>
          <RequestClassSection
            hasPending={data.hasPendingRequest}
            isProminent
          />
        </div>
      </div>
    );
  }

  const {
    classes,
    selectedClass,
    students,
    pendingEntries,
    pendingFavoriteComments,
    hasPendingRequest,
    topicOptionsWithId,
    currentRound,
    currentPhase,
    msgMessages,
    msgRecipients,
    msgUnreadCount,
    msgUserId,
    msgClassId,
    archivedEnrollmentCounts,
    activeClassCounts,
  } = data;
  const statusLine = buildStatusLine(selectedClass);

  const activeClasses = classes.filter((c) => !c.is_archived);
  const archivedClasses = classes.filter((c) => c.is_archived);

  const dropdownClasses = activeClasses.some((c) => c.id === selectedClass.id)
    ? activeClasses
    : [selectedClass, ...activeClasses];

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        padding: "1.5rem 1rem 4rem",
        fontFamily: F,
        color: C.text,
        colorScheme: "light",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>

      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <TopNav />

        {/* Title row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>
            Your classes
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MessagePanel
              messages={msgMessages}
              recipients={msgRecipients}
              unreadCount={msgUnreadCount}
              currentUserId={msgUserId}
              classId={msgClassId}
              theme="warm"
              canSendToAll={students.length > 0}
              allStudentsClassId={msgClassId}
            />
            <RequestClassSection
              hasPending={hasPendingRequest}
            />
          </div>
        </div>

        {/* ── SECTION 1: Class settings header ── */}
        <ClassHeader
          key={selectedClass.id}
          classes={dropdownClasses.map((c) => ({ id: c.id, name: c.name }))}
          selectedClass={{
            id: selectedClass.id,
            name: selectedClass.name,
            total_rounds: selectedClass.total_rounds ?? 5,
            game_phase_hours:
              selectedClass.game_phase_hours != null
                ? Number(selectedClass.game_phase_hours)
                : selectedClass.round_duration_hours != null
                  ? Number(selectedClass.round_duration_hours)
                  : 24,
            review_phase_hours:
              selectedClass.review_phase_hours != null
                ? Number(selectedClass.review_phase_hours)
                : 0,
            game_starts_at: selectedClass.game_starts_at,
            round_topics: (selectedClass.round_topics as Record<string, string | null>) ?? null,
            teacher_prompt: selectedClass.teacher_prompt ?? null,
            round_prompts: (selectedClass.round_prompts as Record<string, string | null>) ?? null,
          }}
          statusLine={statusLine}
          topicOptionsWithId={topicOptionsWithId}
          currentRound={currentRound}
          currentPhase={currentPhase ?? undefined}
        />

        {/* Archive / export bar */}
        {!selectedClass.is_archived && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 8 }}>
            <a
              href={`/teacher/students/export?class=${selectedClass.id}`}
              style={{
                fontSize: 12, color: C.light, textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Download class spreadsheet
            </a>
            <ArchiveClassButton classId={selectedClass.id} action="archive" />
          </div>
        )}

        {/* ── SECTION 2: Pending queue ── */}
        <div style={{ marginTop: 20 }}>
          <PendingQueue
            entries={pendingEntries}
            favoriteComments={pendingFavoriteComments}
          />
        </div>

        {/* ── SECTION 3: Classes with students (grouped by class) ── */}
        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
          {activeClasses.map((cls) => {
            const isSelected = cls.id === selectedClass.id;
            const count = activeClassCounts[cls.id] ?? 0;
            const levelLabel = LEVEL_LABELS[cls.level || "beginner"] || "Beginning";
            const clsStatus = buildStatusLine(cls);

            return (
              <div
                key={cls.id}
                style={{
                  border: `1px solid ${isSelected ? C.light + "66" : C.panelEdge}`,
                  borderRadius: 14,
                  overflow: "hidden",
                  background: isSelected ? "#fff" : C.panel,
                  transition: "all 0.15s ease",
                }}
              >
                {/* ── Class summary bar ── */}
                {isSelected ? (
                  <div
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "12px 16px",
                    }}
                  >
                    <span style={{ fontSize: 12, color: C.light, lineHeight: 1, flexShrink: 0 }}>▾</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.text, flex: 1, minWidth: 0 }}>
                      {cls.name}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                      background: C.light + "18", color: C.light,
                    }}>
                      {levelLabel}
                    </span>
                    <span style={{ fontSize: 12, color: C.textFaint, whiteSpace: "nowrap" }}>
                      {count} student{count !== 1 ? "s" : ""}
                    </span>
                  </div>
                ) : (
                  <a
                    href={`/teacher/students?class=${cls.id}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "12px 16px",
                      textDecoration: "none", color: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: 12, color: C.textDim, lineHeight: 1, flexShrink: 0 }}>▸</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.text, flex: 1, minWidth: 0 }}>
                      {cls.name}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                      background: C.panelEdge + "33", color: C.textDim,
                    }}>
                      {levelLabel}
                    </span>
                    <span style={{ fontSize: 12, color: C.textFaint, whiteSpace: "nowrap" }}>
                      {count} student{count !== 1 ? "s" : ""} · {clsStatus}
                    </span>
                  </a>
                )}

                {/* ── Expanded: student grid (selected class only) ── */}
                {isSelected && (
                  <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.panelEdge}44` }}>
                    {students.length === 0 ? (
                      <div
                        style={{
                          background: C.panel,
                          border: `1px dashed ${C.panelEdge}`,
                          borderRadius: 16,
                          padding: "32px 24px",
                          textAlign: "center",
                          color: C.textDim,
                          fontSize: 14,
                          lineHeight: 1.6,
                          marginTop: 14,
                        }}
                      >
                        No students yet. When someone plays the game and joins, they&apos;ll
                        appear here.
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, 1fr)",
                          gap: 14,
                          paddingTop: 14,
                        }}
                      >
                        {students.map((s) => (
                          <Link
                            key={s.id}
                            href={`/teacher/students/${s.id}`}
                            style={{ textDecoration: "none", color: "inherit" }}
                          >
                            <div
                              style={{
                                background: C.panel,
                                border: `1px solid ${C.panelEdge}`,
                                borderRadius: 16,
                                padding: 16,
                                height: "100%",
                                display: "flex",
                                flexDirection: "column",
                                gap: 12,
                                transition: "transform 0.15s ease",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 12,
                                }}
                              >
                                {s.photoUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={s.photoUrl}
                                    alt=""
                                    style={{
                                      width: 52,
                                      height: 52,
                                      borderRadius: "50%",
                                      objectFit: "cover",
                                      border: `2px solid ${C.light}`,
                                    }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: 52,
                                      height: 52,
                                      borderRadius: "50%",
                                      background: C.panelEdge,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: 22,
                                      color: "#fff",
                                      flexShrink: 0,
                                    }}
                                  >
                                    {s.displayName[0]?.toUpperCase()}
                                  </div>
                                )}
                                <div style={{ minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontSize: 16,
                                      fontWeight: 700,
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    }}
                                  >
                                    {s.displayName}
                                  </div>
                                  {s.realName && s.realName !== s.displayName && (
                                    <div
                                      style={{
                                        fontSize: 12,
                                        color: C.textFaint,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                      }}
                                    >
                                      {s.realName}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  flexWrap: "wrap",
                                  fontSize: 12,
                                }}
                              >
                                <span
                                  style={{
                                    background: C.light + "22",
                                    color: C.text,
                                    borderRadius: 20,
                                    padding: "3px 10px",
                                  }}
                                >
                                  {s.commentCount} comments
                                </span>
                                {!s.profileComplete && (
                                  <span
                                    style={{
                                      background: "#E2554A22",
                                      color: "#A23",
                                      borderRadius: 20,
                                      padding: "3px 10px",
                                    }}
                                  >
                                    profile not finished
                                  </span>
                                )}
                              </div>

                              {s.completedAt && (
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: C.textFaint,
                                    marginTop: "auto",
                                  }}
                                >
                                  {s.round === 0 ? "Warm-up" : `Round ${s.round}`} ·{" "}
                                  {new Date(s.completedAt).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── ARCHIVED CLASSES ── */}
        {archivedClasses.length > 0 && (
          <details style={{ marginTop: 32 }}>
            <summary style={{
              cursor: "pointer",
              fontSize: 13, fontWeight: 700, letterSpacing: 1,
              textTransform: "uppercase", color: C.textFaint,
              marginBottom: 12,
            }}>
              Archived classes ({archivedClasses.length})
            </summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {archivedClasses.map((ac) => (
                <div key={ac.id} style={{
                  background: C.panel, border: `1px solid ${C.panelEdge}`,
                  borderRadius: 12, padding: "12px 16px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 12, flexWrap: "wrap", opacity: 0.8,
                }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{ac.name}</span>
                    <span style={{ fontSize: 11, color: C.textFaint, marginLeft: 8 }}>
                      archived {ac.created_at ? new Date(ac.created_at).toLocaleDateString() : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <a
                      href={`/teacher/students/export?class=${ac.id}`}
                      style={{ fontSize: 11, color: C.light, textDecoration: "none", fontWeight: 600 }}
                    >
                      Download spreadsheet
                    </a>
                    <ArchiveClassButton classId={ac.id} action="unarchive" />
                    {(archivedEnrollmentCounts[ac.id] ?? 0) === 0 && (
                      <DeleteClassButton classId={ac.id} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

      </div>
    </div>
  );
}
