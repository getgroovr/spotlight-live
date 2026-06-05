// ─────────────────────────────────────────────────────────────────────────
// src/lib/class-deck.ts — DB → engine adapter for the IN-CLASS game view.
//
// PARALLEL TO src/lib/deck.ts, NOT a replacement for it.
//   deck.ts        = visitor front-door deck (cross-class, public, ≥9 or bust,
//                    teacher-deck PUBLIC bucket, getPublicUrl).
//   class-deck.ts  = inside-the-class deck (one class, mixed approval, ANY N,
//                    media PRIVATE bucket, createSignedUrl).
//
// VISIBILITY RULES (locked in handoff #23 §"WHAT'S LOCKED"):
//   • The current student sees their OWN entries at status='pending' OR 'live'
//     (so a fresh upload shows to them immediately, before teacher approval).
//   • Classmates' entries appear only at status='live' (teacher-approved).
//
// SECURITY / BUCKET:
//   `media` is PRIVATE. getPublicUrl returned null silently for anon visitors
//   (migration 08 lesson). createSignedUrl with the service-role admin client
//   bypasses storage RLS and returns a time-limited URL the browser can load.
//   1-hour expiry — generous, plenty for one play session.
//
// SHAPE:
//   Returns EngineStudent[] in the SAME shape as deck.ts, so GameShell /
//   spotlight.jsx consume it without changes. One EngineStudent per student
//   (entries stacked; with "one live per student per class", typically one).
//
// isSelf FLAG (added in slice 1 engine-adaptation pass):
//   Each EngineStudent now carries isSelf:boolean. We set it to true for the
//   tile that belongs to the currently-logged-in student, false for everyone
//   else. The engine uses this to skip the student's own tile in the comment
//   cycle (they shouldn't comment on themselves) while still SHOWING that
//   tile in the grid as a real participant. Set here, at the adapter, so the
//   engine never has to know about auth.
// ─────────────────────────────────────────────────────────────────────────
import "server-only";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { EngineStudent } from "@/lib/deck";

const MEDIA_BUCKET = "media";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

// Soft palette fallback when profiles.color is null. Mirrors deck.ts's palette.
const FALLBACK_PALETTE = [
  "#E0954A", "#4A90D9", "#1D9E75",
  "#D4537E", "#9168F5", "#E2554A",
  "#22B8C9", "#639922", "#BA7517",
];

export type ClassDeckResult =
  | { ok: true; students: EngineStudent[]; classId: string }
  | { ok: false; reason: "no-supabase" | "no-session" | "no-class" | "no-entries"; classId: string | null };

export async function loadClassDeck(): Promise<ClassDeckResult> {
  const ssr = await createClient();
  if (!ssr) return { ok: false, reason: "no-supabase", classId: null };

  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return { ok: false, reason: "no-session", classId: null };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { ok: false, reason: "no-supabase", classId: null };
  const admin = createServiceClient(supabaseUrl, serviceKey);

  // Current class = profiles.class_id (profiles.id == auth user.id).
  const { data: profile } = await admin
    .from("profiles")
    .select("class_id")
    .eq("id", user.id)
    .maybeSingle();
  const classId = profile?.class_id ?? null;
  if (!classId) return { ok: false, reason: "no-class", classId: null };

  // Two reads, then merge — clearer than a compound .or() filter, and avoids
  // any string-interpolation worries on the filter syntax. Two small queries
  // against a class-sized table is nothing.
  const selectCols =
    "id, student_id, media_url, media_type, description_text, description_l1, uploaded_at, status";

  const { data: liveRows } = await admin
    .from("entries")
    .select(selectCols)
    .eq("class_id", classId)
    .eq("is_starter", false)
    .eq("status", "live")
    .order("uploaded_at", { ascending: false });

  const { data: ownPendingRows } = await admin
    .from("entries")
    .select(selectCols)
    .eq("class_id", classId)
    .eq("is_starter", false)
    .eq("student_id", user.id)
    .eq("status", "pending")
    .order("uploaded_at", { ascending: false });

  const rows = [...(liveRows || []), ...(ownPendingRows || [])];
  if (rows.length === 0) {
    return { ok: false, reason: "no-entries", classId };
  }

  // Group by student so each student becomes ONE tile with an entry stack
  // (newest first), matching the students.js archive model. Map preserves
  // insertion order, so the iteration order below mirrors the uploaded_at
  // DESC ordering of the queries above.
  const byStudent = new Map<string, typeof rows>();
  for (const r of rows) {
    const sid = r.student_id as string;
    const list = byStudent.get(sid) || [];
    list.push(r);
    byStudent.set(sid, list);
  }

  // Hydrate display fields for everyone in one read.
  const studentIds = Array.from(byStudent.keys());
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, display_name, username, color, bio")
    .in("id", studentIds);
  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p]),
  );

  // Sign one path. Returns null (engine falls back to placeholder) on failure
  // — we LOG (never swallow silently again; that bug cost a session).
  async function sign(path: string | null): Promise<string | null> {
    if (!path) return null;
    try {
      const { data, error } = await admin.storage
        .from(MEDIA_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) {
        console.error(`[class-deck] createSignedUrl failed for ${path}`, error);
        return null;
      }
      return data.signedUrl;
    } catch (e) {
      console.error(`[class-deck] createSignedUrl threw for ${path}`, e);
      return null;
    }
  }

  const students: EngineStudent[] = [];
  let paletteIndex = 0;
  for (const [sid, entries] of byStudent) {
    const prof = profileById.get(sid) as
      | { display_name?: string; username?: string; color?: string; bio?: string }
      | undefined;
    const engineEntries = await Promise.all(
      entries.map(async (r) => ({
        primary: await sign(r.media_url as string | null),
        description: null,
        mediaType:
          ((r.media_type as string) === "video" ? "video" : "photo") as
            | "photo"
            | "video",
        uploadedAt: ((r.uploaded_at as string) || "").slice(0, 10),
        descriptionText: (r.description_text as string) || "",
        descriptionL1: (r.description_l1 as string) || "",
        readingAudio: null,
      })),
    );
    students.push({
      id: sid,
      name: prof?.display_name || prof?.username || "Classmate",
      color: prof?.color || FALLBACK_PALETTE[paletteIndex % FALLBACK_PALETTE.length],
      bio: prof?.bio || "",
      entries: engineEntries,
      peerComments: [],
      // Mark the current student's own tile so the engine can skip them in
      // the comment cycle (you don't comment on yourself). The tile still
      // SHOWS in the grid — it's just opted out of the comment step.
      isSelf: sid === user.id,
    });
    paletteIndex++;
  }

  // Lift the current student to the front of the grid — a small but real
  // "I'm in the game" cue. Otherwise preserves Map iteration order.
  students.sort((a, b) => (a.id === user.id ? -1 : b.id === user.id ? 1 : 0));

  return { ok: true, students, classId };
}
