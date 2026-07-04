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
// C4: Added "Request new class" button. Checks class_requests table for
//     pending requests and profiles.max_classes to decide visibility.
// ─────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  computeCurrentRound,
  isGameOver,
  type ClassTiming,
} from "@/lib/round-timing";
import { ClassHeader } from "./class-header";
import {
  PendingQueue,
  type PendingEntryData,
  type PendingFavoriteCommentData,
} from "./pending-queue";
import { RequestClassButton } from "./request-class";

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
  game_starts_at: string | null;
  created_at: string | null;
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
  | { error: "no-session" | "not-teacher" | "config" }
  | {
      classes: ClassRow[];
      selectedClass: ClassRow;
      students: StudentCard[];
      pendingEntries: PendingEntryData[];
      pendingFavoriteComments: PendingFavoriteCommentData[];
      hasPendingRequest: boolean;
      atClassLimit: boolean;
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
      "id, name, total_rounds, round_duration_hours, game_starts_at, created_at",
    )
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });

  const classes = (classRows || []) as ClassRow[];
  if (classes.length === 0) return { error: "not-teacher" };

  let selectedClass = classes[0];
  if (classParam) {
    const match = classes.find((c) => c.id === classParam);
    if (match) selectedClass = match;
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
    .eq("favorite_comment_status", "pending");

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

  // Check if teacher is at their max_classes limit
  const { data: teacherProfile } = await admin
    .from("profiles")
    .select("max_classes")
    .eq("id", user.id)
    .maybeSingle();
  const maxClasses = teacherProfile?.max_classes ?? 1;
  const atClassLimit = classes.length >= maxClasses;

  return {
    classes,
    selectedClass,
    students,
    pendingEntries,
    pendingFavoriteComments,
    hasPendingRequest,
    atClassLimit,
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
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>
          {data.error === "not-teacher" ? "No class found" : "Something's off"}
        </h1>
        <p style={{ color: C.textDim }}>
          {data.error === "not-teacher"
            ? "This account doesn't own a class yet."
            : "Server not configured."}
        </p>
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
    atClassLimit,
  } = data;
  const statusLine = buildStatusLine(selectedClass);

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
          <RequestClassButton
            hasPending={hasPendingRequest}
            atLimit={atClassLimit}
          />
        </div>

        {/* ── SECTION 1: Class settings header ── */}
        <ClassHeader
          key={selectedClass.id}
          classes={classes.map((c) => ({ id: c.id, name: c.name }))}
          selectedClass={{
            id: selectedClass.id,
            name: selectedClass.name,
            total_rounds: selectedClass.total_rounds ?? 5,
            round_duration_hours:
              selectedClass.round_duration_hours === null
                ? 24
                : Number(selectedClass.round_duration_hours),
            game_starts_at: selectedClass.game_starts_at,
          }}
          statusLine={statusLine}
        />

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
      </div>
    </div>
  );
}
