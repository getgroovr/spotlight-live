// /play — browse page (Front Door).
//
// DESTINATION: src/app/play/page.tsx   (REPLACES existing file)
//
// Session 95: Replaces the "you need a link from a teacher" placeholder
// with a real browse page. Shows teachers who have at least one class
// with is_recruiting = true and whose profile has is_public = true.
//
// Each teacher card links to /teachers/[id] (full profile) and offers
// direct "Try a warmup →" buttons per level, linking to /play/[teacherId].
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

  if (ssr) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceKey) {
      const admin = createServiceClient(supabaseUrl, serviceKey);

      // Step 1: Find all recruiting classes
      const { data: recruitingClasses } = await admin
        .from("classes")
        .select("id, level, teacher_id")
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
              });
            }
            const level = cls.level || "beginner";
            const card = teacherMap.get(profile.id)!;
            if (!card.recruiting_levels.includes(level)) {
              card.recruiting_levels.push(level);
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
    }
  }

  const hasTeachers = teachers.length > 0;

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* ── Header ─────────────────────────────────── */}
        <div style={styles.header}>
          <h1 style={styles.title}>Spotlight</h1>
          <p style={styles.subtitle}>
            Find a teacher and try a free warmup game
          </p>
        </div>

        {/* ── Teacher cards ──────────────────────────── */}
        {hasTeachers ? (
          <div style={styles.grid}>
            {teachers.map((t) => (
              <div key={t.id} style={styles.card}>
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
                    <Link
                      href={`/teachers/${t.id}`}
                      style={styles.cardName}
                    >
                      {t.display_name}
                    </Link>
                    {t.teaching_style && (
                      <p style={styles.cardStyle}>{t.teaching_style}</p>
                    )}
                  </div>
                </div>

                <div style={styles.cardLevels}>
                  {t.recruiting_levels.map((level) => (
                    <Link
                      key={level}
                      href={`/play/${t.id}?level=${level}`}
                      style={{
                        ...styles.levelButton,
                        backgroundColor: LEVEL_COLORS[level] || "#666",
                      }}
                    >
                      {LEVEL_LABELS[level] || level} warmup →
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
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
          <Link href="/login" style={styles.ctaLink}>
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
  grid: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1rem",
  },
  card: {
    backgroundColor: "#FFFDF5",
    border: "1px solid #E0D5BA",
    borderRadius: "10px",
    padding: "1.25rem",
  },
  cardTop: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    marginBottom: "1rem",
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
    display: "block",
    fontSize: "1.15rem",
    fontWeight: 600,
    color: "#3D2E1E",
    textDecoration: "none",
  },
  cardStyle: {
    fontSize: "0.9rem",
    color: "#7A6B5D",
    margin: "0.2rem 0 0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  cardLevels: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.5rem",
  },
  levelButton: {
    display: "inline-block",
    padding: "0.4rem 0.9rem",
    borderRadius: "6px",
    color: "#fff",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: "0.85rem",
  },
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
