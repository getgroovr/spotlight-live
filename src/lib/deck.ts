// ─────────────────────────────────────────────────────────────────────────
// src/lib/deck.ts — DB → engine adapter for the warm-up deck
//
// DESTINATION: src/lib/deck.ts   (REPLACES existing file)
//
// Session 93: Level-aware solo deck loader.
//
// loadTeacherDeck(teacherId, level?) fetches starter photos for one
// teacher, optionally filtered by level. If level is omitted, all
// active starters are returned (backward compat / single-level use).
//
// A teacher needs ≥ 3 active starter photos to open their warmup.
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

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function loadTeacherDeck(
  teacherId: string,
  level?: string,
): Promise<DeckResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, reason: "no-supabase", have: 0 };
  }

  const sb = createServiceClient(supabaseUrl, serviceKey);

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

  const students: EngineStudent[] = picked.map((r, i): EngineStudent => {
    let publicUrl: string | null = null;
    if (r.media_url) {
      if (r.media_url.startsWith("http")) {
        publicUrl = r.media_url;
      } else {
        try {
          const { data } = sb.storage.from(STARTER_BUCKET).getPublicUrl(r.media_url);
          publicUrl = data?.publicUrl ?? null;
        } catch (e) {
          console.error(`[deck] getPublicUrl threw for path: ${r.media_url}`, e);
        }
      }
    }

    return {
      id: r.id,
      name: `Photo ${i + 1}`,
      color: STARTER_PALETTE[i % STARTER_PALETTE.length],
      bio: "",
      entries: [{
        primary: publicUrl,
        description: null,
        mediaType: (r.media_type as "photo" | "video") || "photo",
        uploadedAt: (r.uploaded_at || "").slice(0, 10),
        descriptionText: r.description_text || "",
        descriptionL1: r.description_l1 || "",
        readingAudio: null,
      }],
      peerComments: [],
      isSelf: false,
    };
  });

  return { ok: true, students };
}
