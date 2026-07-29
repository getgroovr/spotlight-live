// /play — browse page (Front Door).
//
// DESTINATION: src/app/play/page.tsx   (REPLACES existing file)
//
// Session 95: Replaces the "you need a link from a teacher" placeholder
// with a real browse page. Shows teachers who have at least one class
// with is_recruiting = true and whose profile has is_public = true.
//
// Session 97: Simplified cards — whole card links to teacher profile.
// Level buttons removed (warmup access is from the profile page).
// "See profile →" shown next to teacher name.
//
// Session 105: Phase 4 — Multi-teacher game cards alongside regular
// teacher listings. Games with status='active' and at least one round
// are shown with title, topic preview, teacher count, and "Event" badge.
// No teacher names or avatars visible — the game is blind from discovery.
//
// Session 108: Teacher cards now show class details: student count,
// round count, and time commitment per round.
//
// REDIRECT-IF-ENROLLED: preserved from Session 93. If someone is already
// enrolled, send them to their dashboard regardless of route.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import Link from "next/link";

export const metadata = {
  title: "Spotlight — Find a Teacher",
};

export const dynamic = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────

interface TeacherCard {
  id: string;
  display_name: string;
  teaching_style: string | null;
  avatar_url: string | null;
  recruiting_levels: string[];
  // Session 108: class detail fields for the browse page
  total_students: number;
  total_rounds: number | null;
  round_duration_hours: number | null;
  game_starts_at: string | null;
}

interface MultiGameCard {
  id: string;
  topic: string;
  status: string;
  teacher_count: number;
  first_round_topic: string | null;
  total_rounds: number;
  created_at: string;
}

// ── Level display helpers ─────────────────────────────────────────────────

const LEVEL_LABELS: Record<string, string> = {
  beginner: "Beginning",
  intermediate: "Intermediate",
  advanced: "Advanced",
};
const LEVEL_COLORS: Record<string, string> = {
  beginner: "#5B8C3E",
  intermediate: "#C4841D",
  advanced: "#B83A3A",
};
const LEVEL_ORDER = ["beginner", "intermediate", "advanced"];

// ── Page ──────────────────────────────────────────────────────────────────

export default async function PlayBrowsePage() {
  // ── Redirect-if-enrolled (preserved from Session 93) ────────────────
  const ssr = await createClient();
  if (ssr) {
    const { data: { user } } = await ssr.auth.getUser();
    if (user?.email) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && serviceKey) {
        const admin = createServiceClient(supabaseUrl, serviceKey);
        const { data: student } = await admin
          .from("students")
          .select("id")
          .eq("email", user.email.toLowerCase())
          .maybeSingle();
        if (student) {
          redirect("/student/dashboard");
        }
      }
    }
  }

  // ── Load recruiting teachers ────────────────────────────────────────
  let teachers: TeacherCard[] = [];
  let multiGames: MultiGameCard[] = [];

  if (ssr) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceKey) {
      const admin = createServiceClient(supabaseUrl, serviceKey);

      // ── Regular teacher cards ──────────────────────────────────────
      // Step 1: Find all recruiting classes (Session 108: + detail fields)
      const { data: recruitingClasses } = await admin
        .from("classes")
        .select("id, level, teacher_id, total_rounds, round_duration_hours, game_starts_at")
        .eq("is_recruiting", true);

      if (recruitingClasses && recruitingClasses.length > 0) {
        // Step 2: Get unique teacher IDs
        const teacherIds = [...new Set(recruitingClasses.map((c) => c.teacher_id))];

        // Step 3: Load teacher profiles (only public ones)
        const { data: profiles } = await admin
          .from("profiles")
          .select("id, display_name, teaching_style, avatar_url, is_public")
          .in("id", teacherIds)
          .eq("role", "teacher")
          .eq("is_public", true);

        if (profiles) {
          // Step 4: Build teacher cards with their recruiting levels
          const profileMap = new Map(profiles.map((p) => [p.id, p]));

          // Session 108: count enrolled students per class
          const classIds = recruitingClasses.map((c) => c.id);
          const { data: allEnrollments } = await admin
            .from("enrollments")
            .select("class_id")
            .in("class_id", classIds)
            .eq("status", "active");
          const enrollCountByClass = new Map<string, number>();
          for (const e of allEnrollments || []) {
            enrollCountByClass.set(e.class_id, (enrollCountByClass.get(e.class_id) || 0) + 1);
          }

          const teacherMap = new Map<string, TeacherCard>();
          for (const cls of recruitingClasses) {
            const profile = profileMap.get(cls.teacher_id);
            if (!profile) continue;

            if (!teacherMap.has(profile.id)) {
              teacherMap.set(profile.id, {
                id: profile.id,
                display_name: profile.display_name || "Teacher",
                teaching_style: profile.teaching_style,
                avatar_url: profile.avatar_url,
                recruiting_levels: [],
                total_students: 0,
                total_rounds: null,
                round_duration_hours: null,
                game_starts_at: null,
              });
            }
            const level = cls.level || "beginner";
            const card = teacherMap.get(profile.id)!;
            if (!card.recruiting_levels.includes(level)) {
              card.recruiting_levels.push(level);
            }
            // Accumulate students across all recruiting classes for this teacher
            card.total_students += enrollCountByClass.get(cls.id) || 0;
            // Use the first class's details as representative
            if (card.total_rounds === null && cls.total_rounds) {
              card.total_rounds = cls.total_rounds;
            }
            if (card.round_duration_hours === null && cls.round_duration_hours) {
              card.round_duration_hours = Number(cls.round_duration_hours);
            }
            if (!card.game_starts_at && cls.game_starts_at) {
              card.game_starts_at = cls.game_starts_at;
            }
          }

          teachers = Array.from(teacherMap.values());

          // Sort levels within each teacher
          for (const t of teachers) {
            t.recruiting_levels.sort(
              (a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b),
            );
          }
        }
      }

      // ── Multi-teacher game cards ───────────────────────────────────
      // Show games that are 'active' (students can play).
      const { data: activeGames } = await admin
        .from("multi_teacher_games")
        .select("id, topic, status, total_rounds, created_at")
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (activeGames && activeGames.length > 0) {
        // Count participants per game
        const gameIds = activeGames.map((g) => g.id);
        const { data: participants } = await admin
          .from("multi_teacher_participants")
          .select("game_id, teacher_id")
          .in("game_id", gameIds)
          .eq("status", "active");

        const participantCounts = new Map<string, number>();
        if (participants) {
          for (const p of participants) {
            participantCounts.set(
              p.game_id,
              (participantCounts.get(p.game_id) || 0) + 1,
            );
          }
        }

        // Get first-round topic for each game
        const { data: firstRounds } = await admin
          .from("multi_game_rounds")
          .select("game_id, topic")
          .in("game_id", gameIds)
          .eq("round_number", 1);

        const firstRoundTopicMap = new Map<string, string>();
        if (firstRounds) {
          for (const r of firstRounds) {
            firstRoundTopicMap.set(r.game_id, r.topic);
          }
        }

        multiGames = activeGames.map((g) => ({
          id: g.id,
          topic: g.topic,
          status: g.status,
          teacher_count: participantCounts.get(g.id) || 0,
          first_round_topic: firstRoundTopicMap.get(g.id) || null,
          total_rounds: g.total_rounds || 1,
          created_at: g.created_at,
        }));
      }
    }
  }

  const hasTeachers = teachers.length > 0;
  const hasMultiGames = multiGames.length > 0;
  const hasAnything = hasTeachers || hasMultiGames;

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* ── Header ─────────────────────────────────── */}
        <div style={styles.header}>
          <h1 style={styles.title}>Spotlight</h1>
          <p style={styles.subtitle}>
            Play a free warmup round to see how it works, then join a class
          </p>
        </div>

        {/* ── Multi-teacher game cards ────────────────── */}
        {hasMultiGames && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Events</h2>
            <div style={styles.grid}>
              {multiGames.map((g) => (
                <Link
                  key={g.id}
                  href={`/play/multi/${g.id}`}
                  style={styles.gameCard}
                >
                  <div style={styles.gameCardTop}>
                    <div style={styles.eventBadge}>Event</div>
                    <div style={styles.gameCardInfo}>
                      <span style={styles.gameCardTitle}>{g.topic}</span>
                      {g.first_round_topic && (
                        <p style={styles.gameCardTopic}>
                          Round 1: {g.first_round_topic}
                        </p>
                      )}
                      <div style={styles.gameCardMeta}>
                        <span>{g.teacher_count} teachers</span>
                        <span style={styles.metaDot}>·</span>
                        <span>{g.total_rounds} {g.total_rounds === 1 ? "round" : "rounds"}</span>
                      </div>
                    </div>
                    <span style={styles.profileLink}>Play →</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Teacher cards ──────────────────────────── */}
        {hasTeachers && (
          <div style={styles.section}>
            {hasMultiGames && (
              <h2 style={styles.sectionTitle}>Teachers</h2>
            )}
            <div style={styles.grid}>
              {teachers.map((t) => (
                <Link
                  key={t.id}
                  href={`/teachers/${t.id}`}
                  style={styles.card}
                >
                  <div style={styles.cardTop}>
                    {t.avatar_url ? (
                      <img
                        src={t.avatar_url}
                        alt={t.display_name}
                        style={styles.cardAvatar}
                      />
                    ) : (
                      <div style={styles.cardAvatarPlaceholder}>
                        {t.display_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div style={styles.cardInfo}>
                      <div style={styles.cardNameRow}>
                        <span style={styles.cardName}>
                          {t.display_name}
                        </span>
                        <span style={styles.profileLink}>
                          See profile →
                        </span>
                      </div>
                      {t.teaching_style && (
                        <p style={styles.cardStyle}>{t.teaching_style}</p>
                      )}
                      {/* Session 108: class details */}
                      <div style={styles.classDetailsMeta}>
                        {t.total_students > 0 && (
                          <span>{t.total_students} student{t.total_students !== 1 ? "s" : ""}</span>
                        )}
                        {t.total_rounds !== null && (
                          <>
                            {t.total_students > 0 && <span style={styles.metaDot}>·</span>}
                            <span>{t.total_rounds} round{t.total_rounds !== 1 ? "s" : ""}</span>
                          </>
                        )}
                        {t.round_duration_hours !== null && (
                          <>
                            <span style={styles.metaDot}>·</span>
                            <span>{t.round_duration_hours >= 24
                              ? `${Math.round(t.round_duration_hours / 24)}d per round`
                              : `${t.round_duration_hours}h per round`
                            }</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Empty state ────────────────────────────── */}
        {!hasAnything && (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>No teachers recruiting right now</p>
            <p style={styles.emptyText}>
              If you have a warmup link from your teacher, you can use it
              directly to get started.
            </p>
          </div>
        )}

        {/* ── Teacher CTA ────────────────────────────── */}
        <div style={styles.teacherCta}>
          <p style={styles.ctaText}>Are you a teacher?</p>
          <Link href="/teacher/students" style={styles.ctaLink}>
            Sign in to set up your class →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#F5ECD7",
    padding: "2rem 1rem",
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
  container: {
    maxWidth: "680px",
    margin: "0 auto",
  },
  header: {
    textAlign: "center" as const,
    marginBottom: "2.5rem",
  },
  title: {
    fontSize: "2rem",
    fontWeight: 700,
    color: "#3D2E1E",
    margin: "0 0 0.5rem",
  },
  subtitle: {
    fontSize: "1.1rem",
    color: "#7A6B5D",
    margin: 0,
  },
  section: {
    marginBottom: "2rem",
  },
  sectionTitle: {
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "#8A6D3B",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    margin: "0 0 0.75rem",
  },
  grid: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1rem",
  },
  // ── Regular teacher card ────────────────────────────────────
  card: {
    backgroundColor: "#FFFDF5",
    border: "1px solid #E0D5BA",
    borderRadius: "10px",
    padding: "1.25rem",
    textDecoration: "none",
    color: "inherit",
    display: "block",
    transition: "border-color 0.15s ease",
  },
  cardTop: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
  },
  cardAvatar: {
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    objectFit: "cover" as const,
    border: "2px solid #D4A853",
    flexShrink: 0,
  },
  cardAvatarPlaceholder: {
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    backgroundColor: "#D4A853",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.5rem",
    fontWeight: 700,
    flexShrink: 0,
  },
  cardInfo: {
    flex: 1,
    minWidth: 0,
  },
  cardName: {
    fontSize: "1.15rem",
    fontWeight: 600,
    color: "#3D2E1E",
  },
  cardNameRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  profileLink: {
    fontSize: "0.82rem",
    fontWeight: 600,
    color: "#8A6D3B",
    whiteSpace: "nowrap" as const,
  },
  cardStyle: {
    fontSize: "0.9rem",
    color: "#7A6B5D",
    margin: "0.2rem 0 0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  classDetailsMeta: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    fontSize: "0.78rem",
    color: "#9A815E",
    marginTop: "0.35rem",
    flexWrap: "wrap" as const,
  },
  // ── Multi-teacher game card ─────────────────────────────────
  gameCard: {
    backgroundColor: "#FFFDF5",
    border: "1px solid #C9A877",
    borderRadius: "10px",
    padding: "1.25rem",
    textDecoration: "none",
    color: "inherit",
    display: "block",
    transition: "border-color 0.15s ease",
  },
  gameCardTop: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
  },
  eventBadge: {
    backgroundColor: "#D4A853",
    color: "#fff",
    fontSize: "0.7rem",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    padding: "0.3rem 0.6rem",
    borderRadius: "6px",
    flexShrink: 0,
    alignSelf: "flex-start",
    marginTop: "0.15rem",
  },
  gameCardInfo: {
    flex: 1,
    minWidth: 0,
  },
  gameCardTitle: {
    fontSize: "1.1rem",
    fontWeight: 600,
    color: "#3D2E1E",
    display: "block",
  },
  gameCardTopic: {
    fontSize: "0.88rem",
    color: "#7A6B5D",
    margin: "0.2rem 0 0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    fontStyle: "italic",
  },
  gameCardMeta: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    fontSize: "0.78rem",
    color: "#9A815E",
    marginTop: "0.35rem",
  },
  metaDot: {
    color: "#C9A877",
  },
  // ── Shared ──────────────────────────────────────────────────
  emptyState: {
    textAlign: "center" as const,
    padding: "3rem 1rem",
  },
  emptyTitle: {
    fontSize: "1.2rem",
    fontWeight: 600,
    color: "#5C4A3A",
    marginBottom: "0.5rem",
  },
  emptyText: {
    color: "#7A6B5D",
    lineHeight: 1.5,
  },
  teacherCta: {
    textAlign: "center" as const,
    marginTop: "3rem",
    paddingTop: "1.5rem",
    borderTop: "1px solid #D4C9A8",
  },
  ctaText: {
    color: "#7A6B5D",
    margin: "0 0 0.5rem",
  },
  ctaLink: {
    color: "#8A6D3B",
    fontWeight: 600,
    textDecoration: "none",
  },
};
