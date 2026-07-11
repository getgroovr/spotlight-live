// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/page.tsx   (REPLACES existing file)
//
// Teacher students page. Three-section layout:
//   1. Class settings header (ClassHeader component)
//   2. Pending queue (PendingQueue component)
//      - Pending photo submissions (entries with status = 'pending')
//      - Pending favorite comments (game_sessions with
//        favorite_comment_status = 'pending')  — NEW #38
//   3. Student profile grid
//
// Auth pattern: SSR cookie client for auth.uid(), service client for
// joins and admin auth (resolving student emails). All queries scoped
// to classes this teacher owns.
//
// #34 FIX: Pending queue thumbnails were broken — used "teacher-deck"
// bucket with getPublicUrl, but student entries upload to "media" bucket
// and need createSignedUrl (same as student-archive.ts). Fixed below.
//
// #38: Added favorite comment moderation query. game_sessions rows with
//      favorite_comment_status = 'pending' are fetched, student name
//      and favorited-pic thumbnail resolved, and passed to PendingQueue
//      as the favoriteComments prop.
//
// Session 76 — P9: Warmup round (round=0) favorite comments were leaking
//      into the student-round pending queue. Added .gt("round", 0) filter
//      so only student game rounds show in the teacher's approval queue.
//      Warmup comments don't require moderation (they're about the
//      teacher's own starter photos).
//
// C4: Added "Request new class" button. Checks class_requests table for
//     pending requests and profiles.max_classes to decide visibility.
//
// Session 77 — C5: Messaging. MessagePanel button in header. Teacher can
//     message individual students, all students, or admin.
//
// Session 78: Game topics. Queries game_topics for approved topic presets
//     and classes.round_topics for per-round assignments. Passes both to
//     ClassHeader for the topic dropdown UI.
//
// Session 80: Auto-archive. In getPageData(), after fetching classes,
//     any active class whose game is over (isGameOver) is automatically
//     set to is_archived = true + archived_at = now. Piggybacks on the
//     existing round-timing logic — no separate trigger needed.
//
// Session 80: Multi-teacher read-only mode. Queries admin_settings for
//     warmup_teacher_count. When > 1, passes readOnly=true to ClassHeader
//     so game settings (rounds, duration, start, topics) are display-only.
//     Teachers can still edit class name and suggest topics.
//
// Session 81: Topic locking. Computes currentRound for the selected class
//     and passes it to ClassHeader. Rounds that have already been played
//     have their topic dropdown disabled so past topics can't be changed.
//     Also fixed class dropdown to always include the selected class even
//     if it was auto-archived.
//
// Session 84: Chunk D1 — game_phase_hours + review_phase_hours on ClassRow.
//     Computes currentPhase (game/review) via computeCurrentPhase() and
//     passes it to ClassHeader for the phase badge. ClassHeader props
//     updated to use game_phase_hours + review_phase_hours instead of
//     round_duration_hours.
//
// Session 86: Chunk M1 — Standard/Multi mode.
//     Queries admin_settings.app_mode. Derives isStandardMode boolean.
//     In standard mode:
//       - isMultiTeacher forced to false (teacher owns their own schedule)
//       - RequestClassSection gets isStandardMode (create vs request)
//       - ClassHeader gets isStandardMode + topicOptionsWithId (for delete)
//       - Zero-class state says "Create" not "Request"
//     In multi mode: behavior unchanged from session 84.
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
  game_phase_hours: number | string | null;      // D1
  review_phase_hours: number | string | null;     // D1
  game_starts_at: string | null;
  created_at: string | null;
  round_topics: Record<string, string | null> | null; // session 78
  is_archived: boolean; // session 79
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
      willingTrio: boolean;
      willingNine: boolean;
      isStandardMode: boolean; // M1
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
      topicOptions: string[]; // session 78
      topicOptionsWithId: TopicOption[]; // M1: topics with ids for deletion
      isMultiTeacher: boolean; // session 80
      isStandardMode: boolean; // M1
      currentRound: number; // session 81: for locking past-round topics
      currentPhase: "game" | "review" | null; // D1: current round phase
      willingTrio: boolean; // session 81
      willingNine: boolean; // session 81
      msgMessages: MessageRow[];
      msgRecipients: Recipient[];
      msgUnreadCount: number;
      msgUserId: string;
      msgClassId: string;
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
      "id, name, total_rounds, round_duration_hours, game_phase_hours, review_phase_hours, game_starts_at, created_at, round_topics, is_archived",
    )
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });

  // ── Session 78: fetch approved game topics for the topic dropdown ────
  const { data: topicRows } = await admin
    .from("game_topics")
    .select("id, topic_text")
    .eq("status", "approved")
    .order("topic_text", { ascending: true });
  const topicOptions = (topicRows || []).map((r: { id: string; topic_text: string }) => r.topic_text);
  // M1: topics with IDs for standard mode deletion
  const topicOptionsWithId: TopicOption[] = (topicRows || []).map(
    (r: { id: string; topic_text: string }) => ({ id: r.id, text: r.topic_text }),
  );

  // ── Session 80 + M1: check mode + multi-teacher ──────────────────────
  const { data: adminSettings } = await admin
    .from("admin_settings")
    .select("warmup_teacher_count, app_mode")
    .eq("id", 1)
    .maybeSingle();
  const appMode = adminSettings?.app_mode ?? "standard";
  const isStandardMode = appMode === "standard";
  // In standard mode, teacher always has full edit access (not read-only)
  const isMultiTeacher = isStandardMode
    ? false
    : (adminSettings?.warmup_teacher_count ?? 1) > 1;

  const classes = (classRows || []) as ClassRow[];

  // ── Session 81: fetch teacher mode preferences ─────────────────────
  const { data: rotationRow } = await admin
    .from("teacher_rotation")
    .select("willing_trio, willing_nine")
    .eq("teacher_id", user.id)
    .maybeSingle();
  const willingTrio = rotationRow?.willing_trio ?? false;
  const willingNine = rotationRow?.willing_nine ?? false;

  // ── Session 81: zero-class teacher → show request/create form ─────────
  if (classes.length === 0) {
    // Still need hasPendingRequest + messaging for zero-class state
    const { data: pendingReqs } = await admin
      .from("class_requests")
      .select("id")
      .eq("teacher_id", user.id)
      .eq("status", "pending")
      .limit(1);
    const hasPendingRequest = (pendingReqs?.length || 0) > 0;

    // Messaging: teacher can message admins even without a class
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
      willingTrio,
      willingNine,
      isStandardMode,
      msgMessages,
      msgRecipients,
      msgUnreadCount,
      msgUserId: user.id,
    };
  }

  // ── Session 80: Auto-archive completed games ──────────────────────
  // On every page load, check each active class: if the game is over
  // (all rounds elapsed), silently flip it to archived so it moves
  // into the "Archived classes" section without teacher action.
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

  let selectedClass = classes[0];
  if (classParam) {
    const match = classes.find((c) => c.id === classParam);
    if (match) selectedClass = match;
  }

  // ── Session 81: compute current round for topic locking ─────────────
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

  // ── D1: compute current phase (game / review) ──────────────────────
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

  // ── Enrollments + students (existing logic) ─────────────────────────
  const { data: enrollments } = await admin
    .from("enrollments")
    .select(
      "student_id, class_id, round, enrolled_at, students(id, name, screen_name, email, photo_url)",
    )
    .eq("class_id", selectedClass.id)
    .order("enrolled_at", { ascending: false });

  // Build email → display name lookup from enrollment data.
  // Used below to resolve student names for pending entries.
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
        // Full URL → passthrough (seed data, external photo, etc.)
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

  // ── Pending entries ─────────────────────────────────────────────────
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

  // Resolve auth user emails → student display names.
  // entries.student_id is auth.users.id (= profiles.id). We need the
  // email to bridge to the students table (which has screen_name/name).
  const uidEmailCache = new Map<string, string>();
  const pendingEntries: PendingEntryData[] = [];

  for (const pe of pendingRows || []) {
    // Get auth email (cached per uid)
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

    // ── FIX: use "media" bucket + createSignedUrl (not "teacher-deck" + getPublicUrl) ──
    // B62: Full URLs pass through (seed data, external images). Storage
    // paths get signed. Error logging so silent failures are visible.
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

  // ── Pending favorite comments (NEW #38) ─────────────────────────────
  // game_sessions where favorite_comment_status = 'pending' for this
  // class. game_sessions.student_id = students.id (no bridge needed).
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
    // Resolve student name directly from students table.
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

    // Parse favorites + comments JSON to find the favorited pic and
    // the comment the student left on it.
    const favorites = (gs.favorites || {}) as Record<string, boolean>;
    const comments = (gs.comments || {}) as Record<string, string>;
    const favEntryId = Object.keys(favorites).find((k) => favorites[k]);
    const commentOnPic = favEntryId ? comments[favEntryId] || "" : "";

    // Get a thumbnail of the favorited pic.
    // Starter entries (teacher's warm-up deck) are in the PUBLIC
    // "teacher-deck" bucket → getPublicUrl.  Student entries are in
    // the PRIVATE "media" bucket → createSignedUrl.
    // B62: Full URLs pass through (seed data, external images).
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

  // ── Class request status ─────────────────────────────────────────────
  const { data: pendingReqs } = await admin
    .from("class_requests")
    .select("id")
    .eq("teacher_id", user.id)
    .eq("status", "pending")
    .limit(1);
  const hasPendingRequest = (pendingReqs?.length || 0) > 0;

  // (Session 81: atClassLimit removed — request button always visible)

  // ── MESSAGE DATA (session 77) ──────────────────────────────────────
  let msgMessages: MessageRow[] = [];
  let msgRecipients: Recipient[] = [];
  let msgUnreadCount = 0;
  const msgUserId = user.id;
  const msgClassId = selectedClass.id;

  // Fetch messages (inbox + sent)
  const { data: rawMsgs } = await admin
    .from("messages")
    .select("id, sender_id, recipient_id, body, is_read, created_at")
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(50);

  msgUnreadCount = (rawMsgs || []).filter(
    (m) => m.recipient_id === user.id && !m.is_read,
  ).length;

  // Collect profile IDs for name resolution
  const msgPids = new Set<string>();
  for (const m of rawMsgs || []) {
    msgPids.add(m.sender_id);
    msgPids.add(m.recipient_id);
  }

  // Get admins for recipient list
  const { data: adminRows } = await admin
    .from("profiles")
    .select("id, display_name")
    .eq("is_admin", true);
  for (const a of adminRows || []) msgPids.add(a.id);

  // Add enrolled students to pids
  for (const s of students) msgPids.add(s.id);

  // Resolve names
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

  // For students, prefer the display name from the students array (screen_name)
  // since profiles.display_name may not be set for students.
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

  // Recipient list: admins + students in this class
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

  return {
    classes,
    selectedClass,
    students,
    pendingEntries,
    pendingFavoriteComments,
    hasPendingRequest,
    topicOptions,
    topicOptionsWithId,
    isMultiTeacher,
    isStandardMode,
    currentRound,
    currentPhase,
    willingTrio,
    willingNine,
    msgMessages,
    msgRecipients,
    msgUnreadCount,
    msgUserId,
    msgClassId,
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

// ── Top nav strip ─────────────────────────────────────────────────────────
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
        }}
      >
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>Something&apos;s off</h1>
        <p style={{ color: C.textDim }}>Server not configured.</p>
      </div>
    );
  }

  // ── Session 81 + M1: zero-class teacher → show create/request form ────
  if ("zeroClasses" in data && data.zeroClasses) {
    return (
      <div
        style={{
          background: C.bg,
          minHeight: "100vh",
          padding: "1.5rem 1rem 4rem",
          fontFamily: F,
          color: C.text,
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
            willingTrio={data.willingTrio}
            willingNine={data.willingNine}
            isProminent
            isStandardMode={data.isStandardMode}
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
    topicOptions,
    topicOptionsWithId,
    isMultiTeacher,
    isStandardMode,
    currentRound,
    currentPhase,
    willingTrio,
    willingNine,
    msgMessages,
    msgRecipients,
    msgUnreadCount,
    msgUserId,
    msgClassId,
  } = data;
  const statusLine = buildStatusLine(selectedClass);

  // Session 79: split active vs archived classes
  const activeClasses = classes.filter((c) => !c.is_archived);
  const archivedClasses = classes.filter((c) => c.is_archived);

  // Session 81: ensure selected class always appears in the dropdown
  // (covers edge case where auto-archive ran but we're still viewing it)
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
              willingTrio={willingTrio}
              willingNine={willingNine}
              isStandardMode={isStandardMode}
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
          }}
          statusLine={statusLine}
          topicOptions={topicOptions}
          topicOptionsWithId={topicOptionsWithId}
          readOnly={isMultiTeacher}
          currentRound={currentRound}
          currentPhase={currentPhase ?? undefined}
          isStandardMode={isStandardMode}
        />

        {/* Session 79: Archive button — shown when viewing a non-archived class */}
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

        {/* ── SECTION 2: Pending queue (submissions + favorite comments) ──
            Sits between settings and the student grid.
            Renders nothing if there's nothing pending. */}
        <div style={{ marginTop: 20 }}>
          <PendingQueue
            entries={pendingEntries}
            favoriteComments={pendingFavoriteComments}
          />
        </div>

        {/* ── SECTION 3: Student grid ── */}
        <p
          style={{
            fontSize: 14,
            color: C.textDim,
            margin: "0 0 16px",
          }}
        >
          {students.length}{" "}
          {students.length === 1 ? "student has" : "students have"} joined{" "}
          <span style={{ color: C.text, fontWeight: 600 }}>
            {selectedClass.name}
          </span>
          .
        </p>

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
            }}
          >
            No students yet. When someone plays the game and joins, they'll
            appear here.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 14,
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

        {/* ── Session 79: ARCHIVED CLASSES ── */}
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
