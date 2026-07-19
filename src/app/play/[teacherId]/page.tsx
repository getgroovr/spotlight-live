// /play/[teacherId] — a teacher's playable warmup game.
//
// DESTINATION: src/app/play/[teacherId]/page.tsx   (REPLACES existing)
//
// Session 93: Level-aware. Accepts ?level=beginner|intermediate|advanced
// to load a specific level's warmup deck. Without a level param, loads
// all active starters (backward compat).
//
// Session 96: Multi-teacher mode. When app_mode = "multi", the warmup
// grid pulls photos from all active rotation teachers (shared pot)
// instead of just the one teacher. The student still enters through a
// specific teacher's link (for enrollment), but sees a mixed deck.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import GameShell from "@/game/shell";
import {
  loadTeacherDeck,
  loadMultiTeacherDeck,
  getAppMode,
  getActiveRotationTeacherIds,
} from "@/lib/deck";

export const metadata = { title: "Spotlight — Play" };
export const dynamic = "force-dynamic";

export default async function PlayTeacherPage({
  params,
  searchParams,
}: {
  params: Promise<{ teacherId: string }>;
  searchParams: Promise<{ level?: string }>;
}) {
  const { teacherId } = await params;
  const { level } = await searchParams;

  // Redirect enrolled students to their dashboard
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

  // Load warmup deck — multi-teacher or solo depending on app_mode
  const validLevel = level && ["beginner", "intermediate", "advanced"].includes(level)
    ? level
    : undefined;

  const mode = await getAppMode();
  let deck;
  if (mode === "multi") {
    // Shared pot: pull photos from all active rotation teachers
    const teacherIds = await getActiveRotationTeacherIds();
    // Ensure the entry teacher is included even if not in rotation
    if (!teacherIds.includes(teacherId)) teacherIds.push(teacherId);
    deck = await loadMultiTeacherDeck(teacherIds, validLevel);
  } else {
    deck = await loadTeacherDeck(teacherId, validLevel);
  }

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
          This warmup link doesn't match any teacher. Double-check the URL
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
