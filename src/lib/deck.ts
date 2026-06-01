// ─────────────────────────────────────────────────────────────────────────
// src/lib/deck.ts — DB → engine adapter for the generic deck
//
// Slice 1 (cohorts foundation): the deck is no longer pinned to ONE class.
// It now pulls starter entries across ALL public classes and mixes them, so
// a visitor's favorite can drop them into whichever cohort that pic belongs
// to. The engine (spotlight.jsx) still just receives an array of
// student-shaped objects via `initialStudents`; it doesn't know any of this.
//
// (Slice 1A history: switched /play from the static STUDENTS array to a live
// read of the public class's entries. This slice generalizes "the public
// class" to "every public class.")
//
// SHAPE TRANSLATION (snake_case DB → camelCase engine)
//   entries_public row                       engine entry
//   ----------------------------             -------------------------------
//   id                       (uuid)          (used as student.id, since each
//                                             starter entry is presented as
//                                             its own "student" in the deck.
//                                             This id IS the entry id the
//                                             favorite is keyed by, which is
//                                             how enrollStudent later resolves
//                                             the favorite's class.)
//   media_url                (storage path)  primary (public URL)
//   media_type               (enum)          mediaType ('photo'|'video')
//   description_text         (text)          descriptionText
//   description_l1           (text)          descriptionL1 (DORMANT)
//   uploaded_at              (timestamptz)   uploadedAt (ISO date string)
//
// Starters don't have a student profile in the cohort sense — they're
// teacher-owned. The engine still wants a per-tile name/color/bio. We
// synthesize those from the entry: a label like "Photo 1", a color cycled
// from a fixed palette so the 3×3 grid still looks distinct, and the
// description_text as the "bio" line in the reveal card.
//
// SECURITY
//   This runs server-side. It uses the SSR Supabase client, which carries
//   the visitor's cookies — so logged-in users go through their normal
//   auth context, and anon visitors go through the public-class RLS path.
//   Either way, what comes back is exactly what the visitor is allowed to
//   see. No service-role key, no privilege escalation, no surprises.
//
// STORAGE
//   Starter media lives in the `teacher-deck` PUBLIC bucket. getPublicUrl
//   returns a permanent world-readable URL — no signing, no expiry, no
//   anon-role storage RLS puzzle. This replaces the previous
//   createSignedUrl approach which silently returned null for anon
//   visitors against the private `media` bucket (see migration 08).
// ─────────────────────────────────────────────────────────────────────────
import "server-only";
import { createClient } from "@/lib/supabase-server";

// Soft palette echoing the original STUDENTS colors. Cycles per starter so
// the 3×3 grid reads as nine distinct tiles.
const STARTER_PALETTE = [
  "#E0954A", "#4A90D9", "#1D9E75",
  "#D4537E", "#9168F5", "#E2554A",
  "#22B8C9", "#639922", "#BA7517",
];

// Public bucket holding teacher-uploaded starter photos. Keep in sync with
// STARTER_BUCKET in src/app/teacher/deck/actions.ts.
const STARTER_BUCKET = "teacher-deck";

// What the engine expects (shape of a single "student" tile). Kept loose
// because students.js doesn't export a type; this is documentation as much
// as enforcement.
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
};

// Result of loadGenericDeck — discriminated so callers can branch on the
// "not enough photos yet" case without inspecting array length.
export type DeckResult =
  | { ok: true; students: EngineStudent[] }
  | { ok: false; reason: "no-supabase" | "no-class" | "underfilled"; have: number };

const DECK_SIZE = 9;

export async function loadGenericDeck(): Promise<DeckResult> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, reason: "no-supabase", have: 0 };

  // Resolve EVERY public class. The deck is the union of all public classes'
  // starter entries — that's what makes the favorite-drops-you-into-a-cohort
  // mechanic work across multiple cohorts. (Previously this resolved a single
  // pinned/first class via NEXT_PUBLIC_DEMO_CLASS_ID; that env var is no
  // longer load-bearing for /play.)
  const { data: classes } = await supabase
    .from("classes")
    .select("id")
    .eq("is_public", true);

  const classIds = (classes ?? []).map((c) => c.id);
  if (classIds.length === 0) return { ok: false, reason: "no-class", have: 0 };

  // Pull starter entries across all those classes. We read entries_public
  // (the column-safe view that omits teacher-only audio) — the engine should
  // never see reading_audio_url even by accident.
  //
  // We don't filter by is_starter here because (a) it isn't in the view's
  // column list, and (b) public classes contain only starters by
  // construction at this stage. When a later slice mixes student submissions
  // into a non-public class deck, that becomes a separate function anyway.
  const { data: rows, error } = await supabase
    .from("entries_public")
    .select("id, media_url, media_type, description_text, description_l1, uploaded_at")
    .in("class_id", classIds)
    .eq("status", "live");

  if (error || !rows) return { ok: false, reason: "underfilled", have: 0 };

  // Refuse to play under-filled. The /play page renders a "preparing" state.
  if (rows.length < DECK_SIZE) {
    return { ok: false, reason: "underfilled", have: rows.length };
  }

  // Pool > 9: pick 9 at random so repeat visits stay fresh AND so the mix
  // spans cohorts rather than always front-loading one class's uploads.
  // Fisher-Yates, truncated to DECK_SIZE.
  const pool = [...rows];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, DECK_SIZE);

  // Build the public URL for each media_url. teacher-deck is a public bucket
  // so getPublicUrl returns a permanent world-readable URL — no signing,
  // no expiry, no anon RLS dance. If the path is missing or the call fails
  // for some unforeseen reason, log it (NEVER swallow silently again — that
  // bug cost a session) and surface a null primary so the engine falls back
  // to its animated placeholder for that tile rather than crashing the deck.
  const students: EngineStudent[] = picked.map((r, i): EngineStudent => {
    let publicUrl: string | null = null;
    if (r.media_url) {
      try {
        const { data } = supabase.storage
          .from(STARTER_BUCKET)
          .getPublicUrl(r.media_url);
        publicUrl = data?.publicUrl ?? null;
        if (!publicUrl) {
          console.error(
            `[deck] getPublicUrl returned no URL for path: ${r.media_url}`
          );
        }
      } catch (e) {
        console.error(
          `[deck] getPublicUrl threw for path: ${r.media_url}`,
          e
        );
      }
    }
    const color = STARTER_PALETTE[i % STARTER_PALETTE.length];
    return {
      id: r.id,
      name: `Photo ${i + 1}`,
      color,
      // bio is empty for starters: the engine's reveal card already shows
      // descriptionText as a quoted block below the name. Setting bio to
      // the same text would duplicate it. For actual student tiles in
      // later slices, bio carries the student's profile blurb.
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
    };
  });

  return { ok: true, students };
}
