// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/page.tsx   (REPLACES existing file)
//
// Slice 1 teacher UI:
//   - step 4: class management header + class switcher (rendered via the
//     ClassHeader client component)
//   - step 5: top nav strip "Class | Deck" replaces the old "← Back to deck"
//     link. Mirrored on /teacher/deck so navigation is bidirectional.
//
// The student grid is filtered to the selected class only (previously
// unioned every class this teacher owned).
//
// Auth pattern: SSR cookie client to resolve auth.uid(), service client
// for the joins, every query scoped to classes this teacher owns.
//
// CSV note: the Export CSV link points at /teacher/students/export, which
// currently exports EVERY class the teacher owns (one CSV across all
// classes). When/if that's scoped to the selected class, this link will
// need the ?class=<id> appended too — TBD with Mike.
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

  const { data: enrollments } = await admin
    .from("enrollments")
    .select(
      "student_id, class_id, round, enrolled_at, students(id, name, screen_name, email, photo_url)",
    )
    .eq("class_id", selectedClass.id)
    .order("enrolled_at", { ascending: false });

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
        try {
          const { data } = await admin.storage
            .from(MEDIA_BUCKET)
            .createSignedUrl(s.photo_url, 3600);
          photoUrl = data?.signedUrl ?? null;
        } catch {}
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

  return { classes, selectedClass, students };
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
    days >= 1 ? `${days}d ago` : hours >= 1 ? `${hours}h ago` : `${minutes}m ago`;

  return `Game started ${ago} — round ${current} of ${cls.total_rounds ?? "?"}`;
}

// ── Top nav strip (step 5) ────────────────────────────────────────────
// Two-link horizontal nav: "Class" (this page, active) and "Deck"
// (→ /teacher/deck). Active state = bold + accent color + 2px underline.
// Inactive = muted link. Mirrored shape on /teacher/deck with palette
// adjusted to the deck page's dark theme.
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

  const { classes, selectedClass, students } = data;
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

        {/* Title row + utility links (Export CSV) */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 6,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>
            Your classes
          </h1>
          {students.length > 0 && (
            <a
              href="/teacher/students/export"
              style={{
                fontSize: 13,
                color: C.light,
                fontWeight: 600,
                textDecoration: "underline",
              }}
            >
              ↓ Export CSV
            </a>
          )}
        </div>

        {/* Class management header. Keyed on the selected class id so
            switching classes remounts the form and clears any in-progress
            edits. */}
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

        <p
          style={{
            fontSize: 14,
            color: C.textDim,
            margin: "20px 0 16px",
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
                      Round {s.round} ·{" "}
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
