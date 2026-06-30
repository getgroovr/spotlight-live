// ─────────────────────────────────────────────────────────────────────────
// src/app/admin/page.tsx — Admin dashboard (Session 67 rebuild)
//
// Server Component. Teacher-centric management panel.
// Auth: checks is_admin boolean on profiles (not role='admin').
// ─────────────────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { AdminClient } from "./admin-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Spotlight — Admin" };

// ── Types shared with admin-client.tsx ───────────────────────────────────
export type StudentRow = {
  id: string;
  display_name: string | null;
  username: string | null;
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
  rotation: {
    status: "recruiting" | "waiting" | "paused";
    sort_order: number;
  } | null;
  classes: ClassRow[];
  starters: StarterRow[];
};

export type WarmupConfig = {
  warmup_teacher_count: 1 | 3 | 9;
};

export default async function AdminPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <Frame>
        <h1 className="text-2xl font-bold mb-2">Supabase isn't configured.</h1>
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
        <h1 className="text-2xl font-bold mb-2">Admin access only.</h1>
        <p className="text-white/70">
          Your account does not have admin privileges.
        </p>
      </Frame>
    );
  }

  // ── Fetch all teachers ────────────────────────────────────────────
  const { data: teachers } = await supabase
    .from("profiles")
    .select("id, display_name, username, max_classes, is_admin")
    .eq("role", "teacher")
    .order("display_name", { ascending: true });

  // ── Fetch rotation rows ───────────────────────────────────────────
  const { data: rotationRows } = await supabase
    .from("teacher_rotation")
    .select("teacher_id, status, sort_order")
    .order("sort_order", { ascending: true });

  // ── Fetch all classes ─────────────────────────────────────────────
  const { data: classes } = await supabase
    .from("classes")
    .select("id, teacher_id, name, capacity");

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

  // ── Fetch admin settings ──────────────────────────────────────────
  const { data: settings } = await supabase
    .from("admin_settings")
    .select("warmup_teacher_count")
    .eq("id", 1)
    .single();

  const warmupConfig: WarmupConfig = {
    warmup_teacher_count: (settings?.warmup_teacher_count as 1 | 3 | 9) || 1,
  };

  // ── Build lookup maps ─────────────────────────────────────────────
  const rotationMap = new Map<string, { status: "recruiting" | "waiting" | "paused"; sort_order: number }>();
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

  // Group enrollments by class_id
  const enrollmentsByClass = new Map<string, string[]>();
  (enrollments || []).forEach((e) => {
    const list = enrollmentsByClass.get(e.class_id) || [];
    list.push(e.student_id);
    enrollmentsByClass.set(e.class_id, list);
  });

  // Group games by class_id (take first/latest per class)
  const gameByClass = new Map<string, GameRow>();
  (games || []).forEach((g) => {
    gameByClass.set(g.class_id, {
      id: g.id,
      name: g.name,
      status: g.status,
      round_count: g.round_count,
    });
  });

  // Group starters by teacher (student_id = teacher id for starters)
  const startersByTeacher = new Map<string, StarterRow[]>();
  (starters || []).forEach((s) => {
    const list = startersByTeacher.get(s.student_id) || [];
    list.push({
      id: s.id,
      media_url: s.media_url,
      is_active: s.is_active,
      description_text: s.description_text,
    });
    startersByTeacher.set(s.student_id, list);
  });

  // ── Assemble teacher rows with nested data ────────────────────────
  const teacherRows: TeacherRow[] = (teachers || []).map((t) => {
    // Build class list for this teacher
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
          };
        });
        return {
          id: c.id,
          name: c.name,
          capacity: c.capacity,
          student_count: studentIds.length,
          students,
          game: gameByClass.get(c.id) || null,
        };
      });

    return {
      id: t.id,
      display_name: t.display_name,
      username: t.username,
      max_classes: t.max_classes,
      is_admin: t.is_admin ?? false,
      rotation: rotationMap.get(t.id) || null,
      classes: teacherClasses,
      starters: startersByTeacher.get(t.id) || [],
    };
  });

  // ── Summary stats ─────────────────────────────────────────────────
  const totalTeachers = teacherRows.length;
  const totalStudents = (enrollments || []).length;
  const totalClasses = (classes || []).length;
  const recruiting = teacherRows.find((t) => t.rotation?.status === "recruiting");

  return (
    <Frame>
      <h1 className="text-3xl font-extrabold mb-1 bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
        Admin
      </h1>
      <p className="text-white/50 text-sm mb-6">
        Teacher management, warm-up deck, and rotation controls.
      </p>

      {/* ── Stats strip ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Teachers" value={totalTeachers} />
        <Stat label="Students" value={totalStudents} />
        <Stat label="Classes" value={totalClasses} />
        <Stat
          label="Recruiting"
          value={recruiting ? (recruiting.display_name || recruiting.username || "—") : "None"}
          highlight={!!recruiting}
        />
      </div>

      <AdminClient
        teachers={teacherRows}
        warmupConfig={warmupConfig}
      />
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-blue-950 p-6 text-white">
      <div className="mx-auto max-w-5xl">{children}</div>
    </main>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 text-center ${
        highlight
          ? "border-emerald-400/30 bg-emerald-400/5"
          : "border-white/10 bg-white/5"
      }`}
    >
      <div className={`text-xl font-bold ${highlight ? "text-emerald-300" : "text-white"}`}>
        {value}
      </div>
      <div className="text-xs text-white/50 mt-0.5">{label}</div>
    </div>
  );
}
