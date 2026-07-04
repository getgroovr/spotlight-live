// ─────────────────────────────────────────────────────────────────────────
// src/app/admin/page.tsx — Admin dashboard (Session 71)
//
// Server Component. Wider centered layout (~660px).
// Auth: checks is_admin boolean on profiles (not role='admin').
//
// Session 71: Added is_archived to TeacherRow and profiles query.
// Generates signed URLs for starter photos so they render in <img> tags.
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
  is_archived: boolean;
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

  // ── Fetch all teachers (including archived) ───────────────────────
  const { data: teachers } = await supabase
    .from("profiles")
    .select("id, display_name, username, max_classes, is_admin, is_archived")
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

  // ── Generate signed URLs for starter photos ───────────────────────
  // media_url may be a full external URL (placehold.co) or a storage
  // path in the media bucket. Storage paths need signed URLs.
  const signedStarters = await Promise.all(
    (starters || []).map(async (s) => {
      let displayUrl = s.media_url;

      // If it's not already an absolute URL, treat it as a storage path
      // Photos are uploaded to the "teacher-deck" bucket (see actions.ts STARTER_BUCKET)
      if (s.media_url && !s.media_url.startsWith("http")) {
        const { data: signed } = await supabase.storage
          .from("teacher-deck")
          .createSignedUrl(s.media_url, 3600); // 1 hour
        if (signed?.signedUrl) {
          displayUrl = signed.signedUrl;
        }
      }

      return { ...s, media_url: displayUrl };
    }),
  );

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

  // ── Assemble teacher rows with nested data ────────────────────────
  const teacherRows: TeacherRow[] = (teachers || []).map((t) => {
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
      is_archived: t.is_archived ?? false,
      rotation: rotationMap.get(t.id) || null,
      classes: teacherClasses,
      starters: startersByTeacher.get(t.id) || [],
    };
  });

  return (
    <Frame>
      <AdminClient
        teachers={teacherRows}
        warmupConfig={warmupConfig}
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
