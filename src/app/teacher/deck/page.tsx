// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/deck/page.tsx   (REPLACES existing file)
//
// Session 94: Per-class deck management.
//   - Fetches all active classes for the teacher (with level, recruiting, topics)
//   - Fetches all starter entries and groups them by class_id
//   - Passes structured ClassData[] to DeckClient
//   - DeckClient renders level sections → expandable class cards → photos
// ─────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { DeckClient, type ClassData, type Starter } from "./deck-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Spotlight — Deck" };

const STARTER_BUCKET = "teacher-deck";

const C = {
  bg: "#FBF6EC",
  text: "#3A2A18",
  textDim: "#6E5536",
  textFaint: "#9A815E",
  panelEdge: "#C9A877",
  light: "#D98A2B",
};
const F = "'Outfit',sans-serif";

function TopNav() {
  return (
    <nav style={{
      display: "flex", gap: 24,
      borderBottom: `1px solid ${C.panelEdge}`, paddingBottom: 0, marginBottom: 20, fontSize: 14,
    }}>
      <Link href="/teacher/students" style={{
        paddingBottom: 8, fontWeight: 500, color: C.textFaint,
        textDecoration: "none", borderBottom: "2px solid transparent", marginBottom: -1,
      }}>Class</Link>
      <span style={{
        paddingBottom: 8, fontWeight: 700, color: C.light,
        borderBottom: `2px solid ${C.light}`, marginBottom: -1,
      }}>Deck</span>
    </nav>
  );
}

export default async function TeacherDeckPage() {
  const supabase = await createClient();
  if (!supabase) {
    return <Frame><TopNav /><h1 style={{ fontSize: 22, fontWeight: 800, color: C.text }}>Supabase isn&apos;t configured.</h1></Frame>;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, display_name")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "teacher") {
    return <Frame><TopNav /><h1 style={{ fontSize: 22, fontWeight: 800, color: C.text }}>Teacher access only.</h1></Frame>;
  }

  // ── Fetch all active classes for this teacher ─────────────────────────
  const { data: teacherClasses } = await supabase
    .from("classes")
    .select("id, name, level, is_recruiting, round_topics, round_prompts")
    .eq("teacher_id", user.id)
    .eq("is_archived", false)
    .order("created_at", { ascending: true });

  // ── Fetch all starter entries for this teacher ────────────────────────
  const { data: rows } = await supabase
    .from("entries")
    .select("id, media_url, description_text, is_active, class_id, uploaded_at")
    .eq("student_id", user.id)
    .eq("is_starter", true)
    .eq("status", "live")
    .order("uploaded_at", { ascending: true });

  // ── Group photos by class_id with signed URLs ─────────────────────────
  const photosByClass = new Map<string, Starter[]>();
  for (const r of rows || []) {
    const isFullUrl = r.media_url?.startsWith("http");
    const publicUrl = isFullUrl
      ? r.media_url
      : r.media_url
        ? supabase.storage.from(STARTER_BUCKET).getPublicUrl(r.media_url).data.publicUrl
        : null;
    const starter: Starter = {
      id: r.id,
      media_url: r.media_url,
      description_text: r.description_text,
      is_active: r.is_active ?? true,
      signed_url: publicUrl,
      uploaded_at: r.uploaded_at,
    };
    const classId = r.class_id;
    if (!photosByClass.has(classId)) photosByClass.set(classId, []);
    photosByClass.get(classId)!.push(starter);
  }

  // ── Build ClassData array ─────────────────────────────────────────────
  const classesData: ClassData[] = (teacherClasses || []).map((c) => {
    const topics = c.round_topics as Record<string, string | null> | null;
    const prompts = c.round_prompts as Record<string, string | null> | null;
    return {
      id: c.id,
      name: c.name,
      level: c.level || "beginner",
      is_recruiting: c.is_recruiting ?? false,
      warmup_title: topics?.["0"] || "",
      warmup_prompt: prompts?.["0"] || "",
      photos: photosByClass.get(c.id) || [],
    };
  });

  return (
    <Frame>
      <TopNav />
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px", color: C.text }}>
        Your deck
      </h1>
      <p style={{ fontSize: 14, color: C.textDim, margin: "0 0 20px" }}>
        Manage warmup photos by class. Expand a class to upload photos, set titles, and toggle recruiting.
      </p>
      <DeckClient
        classes={classesData}
        initialDisplayName={profile.display_name || ""}
      />
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main style={{
      minHeight: "100vh", background: C.bg,
      padding: "24px 16px 64px", fontFamily: F, color: C.text, colorScheme: "light",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');`}</style>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>{children}</div>
    </main>
  );
}
