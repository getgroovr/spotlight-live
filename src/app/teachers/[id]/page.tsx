// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teachers/[id]/page.tsx   (NEW FILE)
//
// Session 95 — Public teacher profile page.
//
// Anyone (anonymous or signed-in) can view a teacher's profile. Shows:
//   - Teacher name, bio, teaching style
//   - Recruiting classes grouped by level with "Try a warmup" links
//   - Overall warm Spotlight aesthetic (tan/cream)
//
// This page is the landing page a teacher shares with prospective students.
// The "Try a warmup" button links to /play/[teacherId]?level=X which
// already exists and plays the level-specific warmup game.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────

interface ClassRow {
  id: string;
  name: string;
  level: string;
  capacity: number;
  is_recruiting: boolean;
  round_topics: Record<string, string> | null;
  _enrolled: number;
}

interface TeacherProfile {
  id: string;
  display_name: string;
  bio: string | null;
  teaching_style: string | null;
  avatar_url: string | null;
}

// ── Level display helpers ─────────────────────────────────────────────────

const LEVEL_ORDER = ["beginner", "intermediate", "advanced"] as const;
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

// ── Page ──────────────────────────────────────────────────────────────────

export default async function TeacherProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) notFound();

  // Load teacher profile
  const { data: teacher } = await supabase
    .from("profiles")
    .select("id, display_name, bio, teaching_style, avatar_url, is_public")
    .eq("id", id)
    .eq("role", "teacher")
    .maybeSingle();

  if (!teacher || !teacher.is_public) notFound();

  // Load their classes
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, level, capacity, is_recruiting, round_topics")
    .eq("teacher_id", id)
    .order("created_at", { ascending: true });

  // Count enrolled students per class
  const classRows: ClassRow[] = [];
  for (const c of classes || []) {
    const { count } = await supabase
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("class_id", c.id)
      .eq("status", "active");
    classRows.push({ ...c, _enrolled: count || 0 });
  }

  // Group by level
  const byLevel = new Map<string, ClassRow[]>();
  for (const c of classRows) {
    const level = c.level || "beginner";
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level)!.push(c);
  }

  // Only show levels that have at least one recruiting class
  const recruitingLevels = LEVEL_ORDER.filter((l) =>
    byLevel.get(l)?.some((c) => c.is_recruiting),
  );

  const hasRecruitingClasses = recruitingLevels.length > 0;

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* ── Teacher header ─────────────────────────── */}
        <div style={styles.header}>
          {teacher.avatar_url ? (
            <img
              src={teacher.avatar_url}
              alt={teacher.display_name || "Teacher"}
              style={styles.avatar}
            />
          ) : (
            <div style={styles.avatarPlaceholder}>
              {(teacher.display_name || "T").charAt(0).toUpperCase()}
            </div>
          )}
          <h1 style={styles.name}>{teacher.display_name || "Teacher"}</h1>
          {teacher.teaching_style && (
            <p style={styles.teachingStyle}>{teacher.teaching_style}</p>
          )}
        </div>

        {/* ── Bio ────────────────────────────────────── */}
        {teacher.bio && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>About</h2>
            <p style={styles.bioText}>{teacher.bio}</p>
          </div>
        )}

        {/* ── Recruiting classes ─────────────────────── */}
        {hasRecruitingClasses ? (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Open Classes</h2>
            {recruitingLevels.map((level) => {
              const levelClasses = byLevel
                .get(level)!
                .filter((c) => c.is_recruiting);
              return (
                <div key={level} style={styles.levelGroup}>
                  <div style={styles.levelBadgeRow}>
                    <span
                      style={{
                        ...styles.levelBadge,
                        backgroundColor: LEVEL_COLORS[level] || "#666",
                      }}
                    >
                      {LEVEL_LABELS[level] || level}
                    </span>
                  </div>
                  {levelClasses.map((cls) => (
                    <div key={cls.id} style={styles.classCard}>
                      <div style={styles.classInfo}>
                        <span style={styles.className}>{cls.name}</span>
                        <span style={styles.classCapacity}>
                          {cls._enrolled}/{cls.capacity} students
                        </span>
                        {cls.round_topics?.["0"] && (
                          <span style={styles.warmupTitle}>
                            Warmup: {cls.round_topics["0"]}
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/play/${id}?level=${level}`}
                        style={styles.warmupButton}
                      >
                        Try a warmup →
                      </Link>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={styles.section}>
            <p style={styles.noClasses}>
              No classes are currently recruiting. Check back soon!
            </p>
          </div>
        )}

        {/* ── Back link ──────────────────────────────── */}
        <div style={styles.backRow}>
          <Link href="/play" style={styles.backLink}>
            ← Browse all teachers
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
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  container: {
    maxWidth: "640px",
    margin: "0 auto",
  },
  header: {
    textAlign: "center" as const,
    marginBottom: "2rem",
  },
  avatar: {
    width: "96px",
    height: "96px",
    borderRadius: "50%",
    objectFit: "cover" as const,
    border: "3px solid #D4A853",
    marginBottom: "1rem",
  },
  avatarPlaceholder: {
    width: "96px",
    height: "96px",
    borderRadius: "50%",
    backgroundColor: "#D4A853",
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "2.5rem",
    fontWeight: 700,
    marginBottom: "1rem",
  },
  name: {
    fontSize: "1.75rem",
    fontWeight: 700,
    color: "#3D2E1E",
    margin: "0 0 0.25rem",
  },
  teachingStyle: {
    fontSize: "1rem",
    color: "#7A6B5D",
    fontStyle: "italic" as const,
    margin: 0,
  },
  section: {
    marginBottom: "2rem",
  },
  sectionTitle: {
    fontSize: "1.1rem",
    fontWeight: 600,
    color: "#5C4A3A",
    borderBottom: "1px solid #D4C9A8",
    paddingBottom: "0.5rem",
    marginBottom: "1rem",
  },
  bioText: {
    fontSize: "1rem",
    lineHeight: 1.6,
    color: "#4A3D2E",
    whiteSpace: "pre-line" as const,
  },
  levelGroup: {
    marginBottom: "1.5rem",
  },
  levelBadgeRow: {
    marginBottom: "0.75rem",
  },
  levelBadge: {
    display: "inline-block",
    padding: "0.2rem 0.75rem",
    borderRadius: "12px",
    color: "#fff",
    fontSize: "0.8rem",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.03em",
  },
  classCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFDF5",
    border: "1px solid #E0D5BA",
    borderRadius: "8px",
    padding: "1rem",
    marginBottom: "0.5rem",
  },
  classInfo: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.2rem",
  },
  className: {
    fontWeight: 600,
    color: "#3D2E1E",
  },
  classCapacity: {
    fontSize: "0.85rem",
    color: "#8A7B6B",
  },
  warmupTitle: {
    fontSize: "0.85rem",
    color: "#7A6B5D",
    fontStyle: "italic" as const,
  },
  warmupButton: {
    display: "inline-block",
    padding: "0.5rem 1rem",
    backgroundColor: "#D4A853",
    color: "#3D2E1E",
    borderRadius: "6px",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: "0.9rem",
    whiteSpace: "nowrap" as const,
  },
  noClasses: {
    color: "#7A6B5D",
    fontStyle: "italic" as const,
    textAlign: "center" as const,
    padding: "2rem 0",
  },
  backRow: {
    textAlign: "center" as const,
    marginTop: "1rem",
  },
  backLink: {
    color: "#8A7B6B",
    textDecoration: "none",
    fontSize: "0.9rem",
  },
};
