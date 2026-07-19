// ─────────────────────────────────────────────────────────────────────────
// src/lib/deck.ts — DB → engine adapter for the warm-up deck
//
// DESTINATION: src/lib/deck.ts   (REPLACES existing file)
//
// Session 93: Level-aware solo deck loader.
// Session 96: Multi-teacher deck loader.
//
// loadTeacherDeck(teacherId, level?)
//   Fetches starter photos for ONE teacher. Used in standard (solo) mode.
//
// loadMultiTeacherDeck(teacherIds, level?)
//   Fetches starter photos from MULTIPLE teachers (the shared pot).
//   Photos are shuffled together; the grid shows a mix from all
//   contributors, padded with monsters client-side if < 9.
//
// getActiveRotationTeacherIds()
//   Returns non-paused teacher IDs from teacher_rotation, in order.
//   The warmup page calls this when app_mode = "multi" to build the
//   teacher ID list for loadMultiTeacherDeck.
//
// Minimum: 3 total photos across all contributing teachers.
// Monster filler cards (padWithMonsters in monsters.jsx) pad the 3×3
// grid client-side when the deck has fewer than 9 photos.
// ─────────────────────────────────────────────────────────────────────────
import "server-only";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const STARTER_PALETTE = [
  "#E0954A", "#4A90D9", "#1D9E75",
  "#D4537E", "#9168F5", "#E2554A",
  "#22B8C9", "#639922", "#BA7517",
];

const STARTER_BUCKET = "teacher-deck";
const DECK_SIZE = 9;
const DECK_MIN = 3;

export type EngineStudent = {
  id: string;
  name: string;
  color: string;
  bio: string;
  entries: Array<{
    primary: string | null;
    description: null;
    mediaType: "photo" | "video";
    uploadedAt: string;
    descriptionText: string;
    descriptionL1: string;
    readingAudio: null;
  }>;
  peerComments: never[];
  isSelf: boolean;
};

export type DeckResult =
  | { ok: true; students: EngineStudent[] }
  | { ok: false; reason: "no-supabase" | "no-teacher" | "underfilled"; have: number };

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createServiceClient(supabaseUrl, serviceKey);
}

type StarterRow = {
  id: string;
  student_id: string;
  media_url: string | null;
  media_type: string | null;
  description_text: string | null;
  description_l1: string | null;
  uploaded_at: string | null;
};

/** Resolve a media_url to a full public URL. */
function resolvePublicUrl(
  sb: ReturnType<typeof createServiceClient>,
  mediaUrl: string | null,
): string | null {
  if (!mediaUrl) return null;
  if (mediaUrl.startsWith("http")) return mediaUrl;
  try {
    const { data } = sb.storage.from(STARTER_BUCKET).getPublicUrl(mediaUrl);
    return data?.publicUrl ?? null;
  } catch (e) {
    console.error(`[deck] getPublicUrl threw for path: ${mediaUrl}`, e);
    return null;
  }
}

/** Convert raw DB rows into EngineStudent[] for the game engine. */
function startersToEngineStudents(
  sb: ReturnType<typeof createServiceClient>,
  starters: StarterRow[],
): EngineStudent[] {
  return starters.map((r, i): EngineStudent => ({
    id: r.id,
    name: `Photo ${i + 1}`,
    color: STARTER_PALETTE[i % STARTER_PALETTE.length],
    bio: "",
    entries: [{
      primary: resolvePublicUrl(sb, r.media_url),
      description: null,
      mediaType: (r.media_type as "photo" | "video") || "photo",
      uploadedAt: (r.uploaded_at || "").slice(0, 10),
      descriptionText: r.description_text || "",
      descriptionL1: r.description_l1 || "",
      readingAudio: null,
    }],
    peerComments: [],
    isSelf: false,
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// Single-teacher deck loader (standard/solo mode)
// ─────────────────────────────────────────────────────────────────────────

export async function loadTeacherDeck(
  teacherId: string,
  level?: string,
): Promise<DeckResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, reason: "no-supabase", have: 0 };

  // Verify teacher exists
  const { data: teacher } = await sb
    .from("profiles")
    .select("id")
    .eq("id", teacherId)
    .eq("role", "teacher")
    .maybeSingle();

  if (!teacher) {
    return { ok: false, reason: "no-teacher", have: 0 };
  }

  // Fetch active starters, optionally filtered by level
  let query = sb
    .from("entries")
    .select(
      "id, student_id, media_url, media_type, description_text, description_l1, uploaded_at",
    )
    .eq("student_id", teacherId)
    .eq("is_starter", true)
    .eq("is_active", true)
    .eq("status", "live")
    .limit(DECK_SIZE);

  if (level) {
    query = query.eq("level", level);
  }

  const { data: starters, error } = await query;

  if (error || !starters) {
    return { ok: false, reason: "underfilled", have: 0 };
  }

  if (starters.length < DECK_MIN) {
    return { ok: false, reason: "underfilled", have: starters.length };
  }

  shuffleInPlace(starters);
  const picked = starters.slice(0, DECK_SIZE);
  return { ok: true, students: startersToEngineStudents(sb, picked) };
}

// ─────────────────────────────────────────────────────────────────────────
// Multi-teacher deck loader (shared pot)
//
// Pulls starter photos from ALL provided teacher IDs, shuffles them
// together, and picks up to DECK_SIZE. The grid shows a mix from
// every contributor. Monster filler pads client-side if < 9 total.
//
// The caller gets teacher IDs from getActiveRotationTeacherIds().
// ─────────────────────────────────────────────────────────────────────────

export async function loadMultiTeacherDeck(
  teacherIds: string[],
  level?: string,
): Promise<DeckResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, reason: "no-supabase", have: 0 };

  if (teacherIds.length === 0) {
    return { ok: false, reason: "no-teacher", have: 0 };
  }

  // Fetch active starters from all contributing teachers
  let query = sb
    .from("entries")
    .select(
      "id, student_id, media_url, media_type, description_text, description_l1, uploaded_at",
    )
    .in("student_id", teacherIds)
    .eq("is_starter", true)
    .eq("is_active", true)
    .eq("status", "live");

  if (level) {
    query = query.eq("level", level);
  }

  const { data: starters, error } = await query;

  if (error || !starters) {
    return { ok: false, reason: "underfilled", have: 0 };
  }

  if (starters.length < DECK_MIN) {
    return { ok: false, reason: "underfilled", have: starters.length };
  }

  // Shuffle all photos together — the shared pot
  shuffleInPlace(starters);
  const picked = starters.slice(0, DECK_SIZE);
  return { ok: true, students: startersToEngineStudents(sb, picked) };
}

// ─────────────────────────────────────────────────────────────────────────
// Rotation helpers — used by the warmup page to detect multi-teacher mode
// ─────────────────────────────────────────────────────────────────────────

/**
 * Returns teacher IDs for all non-paused teachers in the rotation queue,
 * in sort_order. Returns [] if no rotation entries exist or supabase is
 * not configured.
 */
export async function getActiveRotationTeacherIds(): Promise<string[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data: rows } = await sb
    .from("teacher_rotation")
    .select("teacher_id")
    .neq("status", "paused")
    .order("sort_order", { ascending: true });

  return (rows || []).map((r) => r.teacher_id);
}

/**
 * Returns the current app_mode from admin_settings.
 * Defaults to "standard" if not set or not configured.
 */
export async function getAppMode(): Promise<"standard" | "multi"> {
  const sb = getSupabase();
  if (!sb) return "standard";

  const { data } = await sb
    .from("admin_settings")
    .select("app_mode")
    .eq("id", 1)
    .maybeSingle();

  return (data?.app_mode as "standard" | "multi") || "standard";
}
