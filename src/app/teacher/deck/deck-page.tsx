// ─────────────────────────────────────────────────────────────────────────
// src/app/teacher/deck/page.tsx — manage the teacher's starter photo pool
//
// Session 67 rebuild: removed DEMO_CLASS_ID / is_public dependency.
// Each teacher sees their own starters (student_id = user.id).
// Photos are displayed with active/inactive status.
//
// The warm-up deck at /play pulls active photos based on the admin's
// warmup_teacher_count setting — that logic lives in the /play route,
// not here. This page is purely the teacher's photo management view.
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
        <h1 className="text-2xl font-bold mb-2">Supabase isn't configured.</h1>
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

  // ── Fetch this teacher's starters (all classes) ───────────────────
  const { data: rows } = await supabase
    .from("entries")
    .select("id, media_url, description_text, is_active, uploaded_at")
    .eq("student_id", user.id)
    .eq("is_starter", true)
    .eq("status", "live")
    .order("uploaded_at", { ascending: true });

  const starters: Starter[] = (rows || []).map((r) => {
    // Handle both full URLs (seed photos from seed-photos bucket) and
    // storage paths (teacher uploads in teacher-deck bucket).
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
      signed_url: publicUrl,
      uploaded_at: r.uploaded_at,
    };
  });

  const activeCount = starters.filter((s) => s.is_active).length;

  return (
    <Frame>
      <TopNav />
      <h1 className="text-3xl font-extrabold mb-2 bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
        Your deck
      </h1>
      <p className="text-white/70 mb-6 text-sm">
        Upload warm-up photos for visitors to see. Toggle photos active or
        inactive — only active photos appear in the warm-up deck.
      </p>

      <PoolStatus total={starters.length} active={activeCount} />

      <DeckClient
        starters={starters}
        initialDisplayName={profile.display_name || ""}
        canUpload={!!hasClass}
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

function PoolStatus({ total, active }: { total: number; active: number }) {
  const ready = active >= 9;
  return (
    <div
      className={`mb-6 rounded-xl border p-4 ${
        ready
          ? "border-emerald-400/30 bg-emerald-400/5"
          : "border-amber-400/30 bg-amber-400/5"
      }`}
    >
      <p className="text-sm">
        {ready ? "✓" : "•"}{" "}
        <strong>{active}</strong> active / <strong>{total}</strong> total photos
        {ready
          ? " — ready for the warm-up deck."
          : " (9 active photos needed for Solo mode)."}
      </p>
    </div>
  );
}
