// /play/[teacherId] — a teacher's playable warmup game.
//
// DESTINATION: src/app/play/[teacherId]/page.tsx   (REPLACES existing)
//
// Session 93: Level-aware. Accepts ?level=beginner|intermediate|advanced
// to load a specific level's warmup deck.
//
// Session 97: Class-scoped loading. When a level param is present, finds
// the specific RECRUITING class at that level and loads starters only from
// that class. Fixes bug where starters from multiple same-level classes
// (including old/archived ones) were mixed together.
// Removed multi-teacher mode branching (modes system removed in session 96).
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import GameShell from "@/game/shell";
import { loadTeacherDeck } from "@/lib/deck";

export const metadata = { title: "Spotlight — Play" };
export const dynamic = "force-dynamic";

const STARTER_BUCKET = "teacher-deck";

export default async function PlayTeacherPage({
  params,
  searchParams,
}: {
  params: Promise<{ teacherId: string }>;
  searchParams: Promise<{ level?: string }>;
}) {
  const { teacherId } = await params;
  const { level } = await searchParams;

  // ── Redirect enrolled students to their dashboard ───────────────────
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
        if (student) redirect("/student/dashboard");
      }
    }
  }

  // ── Resolve level ───────────────────────────────────────────────────
  const validLevel = level && ["beginner", "intermediate", "advanced"].includes(level)
    ? level
    : undefined;

  // ── Class-scoped loading (when level is specified) ──────────────────
  // Find the specific recruiting class for this teacher at this level,
  // then load starters ONLY from that class. This prevents starters from
  // old/non-recruiting classes leaking into the warmup grid.
  if (validLevel) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) return <GameShell />;

    const admin = createServiceClient(supabaseUrl, serviceKey);

    // Verify teacher exists
    const { data: teacher } = await admin
      .from("profiles")
      .select("id")
      .eq("id", teacherId)
      .eq("role", "teacher")
      .maybeSingle();

    if (!teacher) return <TeacherNotFound />;

    // Find the recruiting class at this level
    const { data: targetClass } = await admin
      .from("classes")
      .select("id")
      .eq("teacher_id", teacherId)
      .eq("level", validLevel)
      .eq("is_recruiting", true)
      .eq("is_archived", false)
      .limit(1)
      .maybeSingle();

    if (!targetClass) {
      // No recruiting class at this level — check if ANY class exists
      const { data: anyClass } = await admin
        .from("classes")
        .select("id")
        .eq("teacher_id", teacherId)
        .eq("level", validLevel)
        .eq("is_archived", false)
        .limit(1)
        .maybeSingle();

      if (!anyClass) return <TeacherNotFound />;
      return <DeckBeingPrepared have={0} />;
    }

    // Load active starters from this specific class only
    const { data: starters } = await admin
      .from("entries")
      .select("id, media_url, description_text")
      .eq("class_id", targetClass.id)
      .eq("is_starter", true)
      .eq("is_active", true)
      .eq("status", "live")
      .order("uploaded_at", { ascending: true });

    const active = starters || [];

    if (active.length < 3) {
      return <DeckBeingPrepared have={active.length} />;
    }

    // Resolve public URLs and build engine students.
    // Game engine expects entries with: primary (image URL), mediaType ("photo").
    const students = active.slice(0, 9).map((s) => {
      const isFullUrl = s.media_url?.startsWith("http");
      const publicUrl = isFullUrl
        ? s.media_url
        : s.media_url
          ? admin.storage.from(STARTER_BUCKET).getPublicUrl(s.media_url).data.publicUrl
          : "";
      return {
        id: s.id,
        name: s.description_text || "",
        entries: [
          {
            id: s.id,
            primary: publicUrl || "",
            mediaType: "photo",
            description_text: s.description_text || "",
          },
        ],
      };
    });

    return <GameShell initialStudents={students} />;
  }

  // ── Fallback: no level param — use loadTeacherDeck (backward compat) ─
  const deck = await loadTeacherDeck(teacherId);

  if (deck.ok) return <GameShell initialStudents={deck.students} />;

  if (deck.reason === "no-supabase") return <GameShell />;
  if (deck.reason === "no-teacher") return <TeacherNotFound />;
  return <DeckBeingPrepared have={deck.have} />;
}

function TeacherNotFound() {
  return (
    <div style={{
      minHeight: "100vh", background: "#D9BE8E", color: "#3a2a1a",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    }}>
      <div style={{ maxWidth: 460, textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 12px" }}>Teacher not found</h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, margin: 0 }}>
          This warmup link doesn&apos;t match any teacher. Double-check the URL
          or ask your teacher for their Spotlight link.
        </p>
      </div>
    </div>
  );
}

function DeckBeingPrepared({ have }: { have: number }) {
  return (
    <div style={{
      minHeight: "100vh", background: "#D9BE8E", color: "#3a2a1a",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    }}>
      <div style={{ maxWidth: 460, textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 12px" }}>The deck is being prepared</h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, margin: "0 0 4px" }}>
          This teacher needs at least three photos before their warmup opens.
        </p>
        <p style={{ fontSize: 13, color: "#6a4f33", margin: 0 }}>
          {have === 0 ? "None have been added yet." : `${have} of 3 added so far.`}
        </p>
      </div>
    </div>
  );
}
