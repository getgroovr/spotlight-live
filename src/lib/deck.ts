// ─────────────────────────────────────────────────────────────────────────
// src/lib/deck.ts — DB → engine adapter for the generic deck
//
// Slice 1A: switch /play from the static STUDENTS array to a live read of
// the public class's entries. The engine (spotlight.jsx) doesn't know this
// file exists; it just receives an array of student-shaped objects via the
// `initialStudents` prop.
//
// SHAPE TRANSLATION (snake_case DB → camelCase engine)
//   entries_public row                       engine entry
//   ----------------------------             -------------------------------
//   id                       (uuid)          (used as student.id, since each
//                                             starter entry is presented as
//                                             its own "student" in the deck)
//   media_url                (storage path)  primary (signed URL)
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

// How long signed URLs live. 1 hour is plenty for one /play session and
// keeps the URL out of the static prerender's "infinite" trap.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

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

  // Resolve the public class. Prefer the pinned env id (predictable in dev
  // and for the future /teacher/deck redirect target); fall back to "any
  // public class," which is fine for a single-teacher install.
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
  if (!classId) return { ok: false, reason: "no-class", have: 0 };

  // Pull starter entries for that class. We read entries_public (the column-
  // safe view that omits teacher-only audio) — the engine should never see
  // reading_audio_url even by accident.
  //
  // We don't filter by is_starter here because (a) it isn't in the view's
  // column list, and (b) the public deck contains only starters by
  // construction in Slice 1A. When Slice 2's class deck starts mixing
  // student submissions in, this becomes a separate function on a non-
  // public class anyway.
  const { data: rows, error } = await supabase
    .from("entries_public")
    .select("id, media_url, media_type, description_text, description_l1, uploaded_at")
    .eq("class_id", classId)
    .eq("status", "live");

  if (error || !rows) return { ok: false, reason: "underfilled", have: 0 };

  // Refuse to play under-filled. The /play page renders a "preparing" state.
  if (rows.length < DECK_SIZE) {
    return { ok: false, reason: "underfilled", have: rows.length };
  }

  // Pool > 9: pick 9 at random so repeat visits stay fresh. Fisher-Yates,
  // truncated to DECK_SIZE.
  const pool = [...rows];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, DECK_SIZE);

  // Sign each media_url. createSignedUrl works against the private bucket
  // because the RLS in migration 10 grants the caller read access to
  // public-class objects. If signing fails (e.g. an entry's media_url is a
  // path that no longer exists in storage), we surface a null primary so
  // the engine falls back to its animated placeholder for that tile rather
  // than crashing the whole deck.
  const students: EngineStudent[] = await Promise.all(
    picked.map(async (r, i): Promise<EngineStudent> => {
      let signedUrl: string | null = null;
      if (r.media_url) {
        const { data: signed } = await supabase.storage
          .from("media")
          .createSignedUrl(r.media_url, SIGNED_URL_TTL_SECONDS);
        signedUrl = signed?.signedUrl ?? null;
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
          primary: signedUrl,
          description: null,
          mediaType: (r.media_type as "photo" | "video") || "photo",
          uploadedAt: (r.uploaded_at || "").slice(0, 10),
          descriptionText: r.description_text || "",
          descriptionL1: r.description_l1 || "",
          readingAudio: null,
        }],
        peerComments: [],
      };
    })
  );

  return { ok: true, students };
}
