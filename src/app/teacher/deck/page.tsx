// ─────────────────────────────────────────────────────────────────────────
// src/app/teacher/deck/page.tsx — manage the teacher's starter photo pool
//
// Session 70 rebuild: multi-mode photo selection.
// Teachers pre-select photos for each warm-up mode independently:
//   Solo → pick up to 9    Trio → pick up to 3    Full → pick up to 1
// A photo can be selected for multiple modes simultaneously.
// ─────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { DeckClient } from "./deck-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Spotlight — Deck" };

const STARTER_BUCKET = "teacher-deck";

export type Starter = {
  id: string;
  media_url: string;
  description_text: string;
  is_active: boolean;
  selected_solo: boolean;
  selected_trio: boolean;
  selected_full: boolean;
  signed_url: string | null;
  uploaded_at: string;
};

function TopNav() {
  return (
    <nav className="mb-6 flex gap-6 border-b border-white/10 pb-0 text-sm">
      <Link
        href="/teacher/students"
        className="-mb-px pb-2 font-medium text-white/60 hover:text-white/90 transition"
      >
        Class
      </Link>
      <span className="-mb-px border-b-2 border-fuchsia-400 pb-2 font-bold text-fuchsia-300">
        Deck
      </span>
    </nav>
  );
}

export default async function TeacherDeckPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <Frame>
        <TopNav />
        <h1 className="text-2xl font-bold mb-2">Supabase isn&apos;t configured.</h1>
        <p className="text-white/70">
          Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code>.env.local</code>.
        </p>
      </Frame>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, display_name")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "teacher") {
    return (
      <Frame>
        <TopNav />
        <h1 className="text-2xl font-bold mb-2">Teacher access only.</h1>
        <p className="text-white/70">
          Your account is signed in but does not have the teacher role.
        </p>
      </Frame>
    );
  }

  // ── Check teacher has at least one class ──────────────────────────
  const { data: teacherClasses } = await supabase
    .from("classes")
    .select("id, name")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: true });

  const hasClass = teacherClasses && teacherClasses.length > 0;

  // ── Fetch current admin mode (for highlighting active mode) ───────
  const { data: settings } = await supabase
    .from("admin_settings")
    .select("warmup_teacher_count")
    .eq("id", 1)
    .single();
  const warmupTeacherCount = settings?.warmup_teacher_count ?? 1;
  const activeModeName =
    warmupTeacherCount === 1 ? "solo"
    : warmupTeacherCount === 3 ? "trio"
    : "full";

  // ── Fetch this teacher's starters (all classes) ───────────────────
  const { data: rows } = await supabase
    .from("entries")
    .select("id, media_url, description_text, is_active, selected_solo, selected_trio, selected_full, uploaded_at")
    .eq("student_id", user.id)
    .eq("is_starter", true)
    .eq("status", "live")
    .order("uploaded_at", { ascending: true });

  const starters: Starter[] = (rows || []).map((r) => {
    const isFullUrl = r.media_url?.startsWith("http");
    const publicUrl = isFullUrl
      ? r.media_url
      : r.media_url
        ? supabase.storage.from(STARTER_BUCKET).getPublicUrl(r.media_url).data.publicUrl
        : null;
    return {
      id: r.id,
      media_url: r.media_url,
      description_text: r.description_text,
      is_active: r.is_active ?? true,
      selected_solo: r.selected_solo ?? false,
      selected_trio: r.selected_trio ?? false,
      selected_full: r.selected_full ?? false,
      signed_url: publicUrl,
      uploaded_at: r.uploaded_at,
    };
  });

  return (
    <Frame>
      <TopNav />
      <h1 className="text-3xl font-extrabold mb-2 bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
        Your deck
      </h1>
      <p className="text-white/70 mb-6 text-sm">
        Upload photos and select which ones appear in each warm-up mode.
      </p>

      <DeckClient
        starters={starters}
        initialDisplayName={profile.display_name || ""}
        canUpload={!!hasClass}
        activeMode={activeModeName}
      />
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-blue-950 p-6 text-white">
      <div className="mx-auto max-w-3xl">{children}</div>
    </main>
  );
}
