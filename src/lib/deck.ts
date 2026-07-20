// ─────────────────────────────────────────────────────────────────────────
// src/lib/deck.ts — DB → engine adapter for the warm-up deck
//
// DESTINATION: src/lib/deck.ts   (REPLACES existing file)
//
// Session 93: Level-aware solo deck loader.
// Session 96: Shared internals refactored.
// Session 98: Removed loadMultiTeacherDeck (wrong "shared pot" model),
//   getActiveRotationTeacherIds, and getAppMode. Multi-teacher games
//   are handled by /teacher/multi with their own data model — they
//   do NOT mix photos into a shared pot.
//
// loadTeacherDeck(teacherId, level?)
//   Fetches starter photos for ONE teacher. Used in standard (solo) mode.
//
// Minimum: 3 photos from the teacher.
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
