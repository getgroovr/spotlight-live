// ─────────────────────────────────────────────────────────────────────────
// src/app/teacher/deck/page.tsx — manage the public deck's starter pool.
//
// Server Component. Lists the current starters with their descriptions and a
// delete button. Renders an upload form that posts to the uploadStarter
// Server Action. Refuses to render at all if the visitor isn't a teacher.
//
// Slice 1A / piece 3 change: image URLs come from getPublicUrl against the
// `teacher-deck` bucket (public by design). Public URLs don't expire and
// don't require a signing roundtrip — correct shape for a starter pool that
// anonymous /play visitors will also read.
//
// Slice 1 step 5 change: added the "Class | Deck" top nav strip mirroring
// the students page, so navigation between the two teacher views is
// bidirectional.
//
// Step 6 changes:
//   1. Scope filter: `.eq("student_id", user.id)` on the starters query so
//      each teacher sees only their own uploads. `/play` (via loadGenericDeck)
//      is untouched and continues to union everything across teachers.
//   2. Teacher display_name: read from `profiles.display_name` and pass to
//      DeckClient so it can render/edit the name field at the top of the page.
// ─────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { DeckClient } from "./deck-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Spotlight — Deck" };

// Starter bucket name. Kept in one place so we don't drift from actions.ts
// (which has its own STARTER_BUCKET const for the same reason).
const STARTER_BUCKET = "teacher-deck";

type Starter = {
  id: string;
  media_url: string;
  description_text: string;
  signed_url: string | null;
  uploaded_at: string;
};

// Top nav strip — same two-tab shape as /teacher/students, palette
// flipped to suit the dark gradient background. "Deck" active here,
// "Class" links back.
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
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code>.env.local</code>{" "}
          to use this page.
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

  const pinnedId = process.env.NEXT_PUBLIC_DEMO_CLASS_ID;
  let classId: string | null = pinnedId || null;
  if (!classId) {
    const { data: cls } = await supabase
      .from("classes")
      .select("id")
      .eq("is_public", true)
      .limit(1)
      .maybeSingle();
    classId = cls?.id ?? null;
  }
  if (!classId) {
    return (
      <Frame>
        <TopNav />
        <h1 className="text-2xl font-bold mb-2">No public class yet.</h1>
        <p className="text-white/70">
          Run the setup SQL in <code>SLICE_1A_MANUAL_STEPS.md</code> to create
          the public class row before uploading starters.
        </p>
      </Frame>
    );
  }

  // ── Step 6: scope filter ──────────────────────────────────────────────
  // Each teacher sees only their own uploads. The `.eq("student_id", ...)`
  // filter restricts to entries this teacher created. The `/play` route
  // (loadGenericDeck) is untouched and unions everything across teachers.
  const { data: rows } = await supabase
    .from("entries")
    .select("id, media_url, description_text, uploaded_at")
    .eq("class_id", classId)
    .eq("student_id", user.id)
    .eq("status", "live")
    .eq("is_starter", true)
    .order("uploaded_at", { ascending: true });

  const starters: Starter[] = (rows || []).map((r) => {
    const publicUrl = r.media_url
      ? supabase.storage.from(STARTER_BUCKET).getPublicUrl(r.media_url).data
          .publicUrl
      : null;
    return {
      id: r.id,
      media_url: r.media_url,
      description_text: r.description_text,
      signed_url: publicUrl,
      uploaded_at: r.uploaded_at,
    };
  });

  return (
    <Frame>
      <TopNav />
      <h1 className="text-3xl font-extrabold mb-2 bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
        Public deck
      </h1>
      <p className="text-white/70 mb-6 text-sm">
        Nine photos are required before the front door opens. The deck shows
        nine random items from this pool to each visitor.
      </p>

      <PoolStatus count={starters.length} />

      <DeckClient
        starters={starters}
        initialDisplayName={profile.display_name || ""}
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

function PoolStatus({ count }: { count: number }) {
  const ready = count >= 9;
  return (
    <div
      className={`mb-6 rounded-xl border p-4 ${
        ready
          ? "border-emerald-400/30 bg-emerald-400/5"
          : "border-amber-400/30 bg-amber-400/5"
      }`}
    >
      <p className="text-sm">
        {ready ? "✓" : "•"} <strong>{count}</strong>{" "}
        {count === 1 ? "photo" : "photos"} in the pool{" "}
        {ready ? "— the front door is open." : `(need at least 9).`}
      </p>
    </div>
  );
}
