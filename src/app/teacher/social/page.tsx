// /teacher/social — moderation surface for the social slice.
//
// Server Component. Mirrors /teacher/deck/page.tsx: createClient → null-check →
// getUser → redirect if none → teacher-role gate → resolve the class the same
// way the deck and /play do → ownership check → read the pending queues.
//
// It shows two queues for the teacher's class:
//   - Pending photos    (submissions with status = 'pending')
//   - Pending comments  (submission_comments with status = 'pending')
// and hands them to the client half, which calls the approve/reject Server
// Actions. Approving/rejecting moves an item out of 'pending', so it leaves the
// queue either way.
//
// NOTE — submission image storage isn't wired yet (migration handoff #15):
// `submissions.media_url` is plain text and no live-game-student bucket/RLS is
// settled. The client renders the image only when media_url is already a full
// URL, else a "(image pending storage)" placeholder. The gate decisions don't
// depend on the image, so the surface is fully usable now; real images get
// wired when the upload screen is built.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { SocialClient } from "./social-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Spotlight — Moderation" };

type Student = {
  id: string;
  name: string | null;
  screen_name: string | null;
  email: string | null;
  photo_url: string | null;
};

export type PendingSubmission = {
  id: string;
  round: number;
  media_url: string | null;
  description: string;
  created_at: string;
  student: Student | null;
};

export type PendingComment = {
  id: string;
  round: number;
  body: string;
  created_at: string;
  submission_id: string;
  author: Student | null;
  on_description: string | null; // parent submission's description, for context
};

// PostgREST returns an embedded to-one relation as an object, but can surface
// it as a single-element array depending on how it detects the relationship.
// Normalize both to "object or null".
function one<T>(v: unknown): T | null {
  if (Array.isArray(v)) return (v[0] as T) ?? null;
  return (v as T) ?? null;
}

// Loose shapes for the raw query rows (the embed makes the inferred type
// awkward; we normalize into the exported types below).
type SubRow = {
  id: string;
  round: number;
  media_url: string | null;
  description: string | null;
  created_at: string;
  student: unknown;
};
type CmtRow = {
  id: string;
  round: number;
  body: string;
  created_at: string;
  submission_id: string;
  author: unknown;
};

export default async function TeacherSocialPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <Frame>
        <h1 className="text-2xl font-bold mb-2">Supabase isn’t configured.</h1>
        <p className="text-white/70">
          Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code>.env.local</code>.
        </p>
      </Frame>
    );
  }

  // Auth: redirect to login if no user.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Role: teachers only.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "teacher") {
    return (
      <Frame>
        <h1 className="text-2xl font-bold mb-2">Teacher access only.</h1>
        <p className="text-white/70">
          Your account is signed in but does not have the teacher role.
        </p>
      </Frame>
    );
  }

  // Resolve the class the same way /teacher/deck and /play do.
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
        <h1 className="text-2xl font-bold mb-2">No class found.</h1>
        <p className="text-white/70">
          Create the public class (see <code>SLICE_1A_MANUAL_STEPS.md</code>)
          before moderating.
        </p>
      </Frame>
    );
  }

  // Ownership check, for a clean message. The approve/reject RPCs self-authorize
  // via owns_class() in the DB regardless, so this is UX, not the security line.
  const { data: owned } = await supabase
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("teacher_id", user.id)
    .maybeSingle();
  if (!owned) {
    return (
      <Frame>
        <h1 className="text-2xl font-bold mb-2">Not your class.</h1>
        <p className="text-white/70">You can only moderate classes you own.</p>
      </Frame>
    );
  }

  // Pending photos.
  const { data: subRows } = await supabase
    .from("submissions")
    .select(
      "id, round, media_url, description, created_at, student:students!student_id(id, name, screen_name, email, photo_url)",
    )
    .eq("class_id", classId)
    .eq("status", "pending")
    .order("round", { ascending: true })
    .order("created_at", { ascending: true });

  const pendingSubmissions: PendingSubmission[] = ((subRows ?? []) as unknown as SubRow[]).map(
    (r) => ({
      id: r.id,
      round: r.round,
      media_url: r.media_url ?? null,
      description: r.description ?? "",
      created_at: r.created_at,
      student: one<Student>(r.student),
    }),
  );

  // Pending comments.
  const { data: cmtRows } = await supabase
    .from("submission_comments")
    .select(
      "id, round, body, created_at, submission_id, author:students!author_student_id(id, name, screen_name, email, photo_url)",
    )
    .eq("class_id", classId)
    .eq("status", "pending")
    .order("round", { ascending: true })
    .order("created_at", { ascending: true });

  const cmtRowsTyped = (cmtRows ?? []) as unknown as CmtRow[];

  // Pull parent submission descriptions in one query (instead of a fragile
  // nested embed) to give each comment a little context about which photo it's
  // on. Build submission_id -> description.
  const parentIds = Array.from(
    new Set(cmtRowsTyped.map((c) => c.submission_id).filter(Boolean)),
  );
  let descById = new Map<string, string>();
  if (parentIds.length > 0) {
    const { data: parents } = await supabase
      .from("submissions")
      .select("id, description")
      .in("id", parentIds);
    descById = new Map(
      ((parents ?? []) as { id: string; description: string | null }[]).map((p) => [
        p.id,
        p.description ?? "",
      ]),
    );
  }

  const pendingComments: PendingComment[] = cmtRowsTyped.map((r) => ({
    id: r.id,
    round: r.round,
    body: r.body,
    created_at: r.created_at,
    submission_id: r.submission_id,
    author: one<Student>(r.author),
    on_description: descById.get(r.submission_id) || null,
  }));

  return (
    <Frame>
      <h1 className="text-3xl font-extrabold mb-2 bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
        Moderation
      </h1>
      <p className="text-white/70 mb-6 text-sm">
        Approve or reject student photos and comments. Nothing is shown to the
        class until you approve it; rejected items stay hidden. Work through a
        round, then move to the reveal.
      </p>

      <SocialClient
        pendingSubmissions={pendingSubmissions}
        pendingComments={pendingComments}
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
