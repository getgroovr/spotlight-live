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
import {
  computeCurrentRound,
  isGameOver as checkGameOver,
  type ClassTiming,
} from "@/lib/round-timing";
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
  | { ok: true; students: EngineStudent[]; classId: string; currentRound: number; totalRounds: number | null; warmupComplete: boolean }
  | { ok: false; reason: "no-supabase" | "no-session" | "no-class" | "no-entries" | "game-over" | "game-not-started"; classId: string | null };

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

  // ── B18 FIX (#44): Check game timing BEFORE loading the deck. ──────
  // If the game is over, don't let the student play — they should see
  // the game-over screen, not a playable deck. If the game hasn't
  // started yet, show a "not yet" holding page.
  const { data: classRow } = await admin
    .from("classes")
    .select("total_rounds, round_duration_hours, game_starts_at")
    .eq("id", classId)
    .maybeSingle();

  if (!classRow?.game_starts_at) {
    return { ok: false, reason: "game-not-started", classId };
  }

  const timing: ClassTiming = {
    total_rounds: classRow.total_rounds,
    game_starts_at: classRow.game_starts_at,
    round_duration_hours:
      classRow.round_duration_hours === null
        ? null
        : Number(classRow.round_duration_hours),
  };
  const now = new Date();

  if (checkGameOver(timing, now)) {
    return { ok: false, reason: "game-over", classId };
  }

  const currentRound = computeCurrentRound(timing, now);

  // ── B22 FIX (#45): Check if this student already has a completed
  // warm-up (round=0) game_session. If so, GameShell should skip the
  // warm-up phase and go straight to the current round's game.
  // game_sessions.student_id is on the STUDENTS track (not profiles),
  // so we look up the student row via email match.
  let warmupComplete = false;
  if (user.email) {
    const { data: studentRow } = await admin
      .from("students")
      .select("id")
      .eq("email", user.email.toLowerCase())
      .maybeSingle();
    if (studentRow) {
      const { data: warmupSession } = await admin
        .from("game_sessions")
        .select("id")
        .eq("student_id", studentRow.id)
        .eq("class_id", classId)
        .eq("round", 0)
        .maybeSingle();
      warmupComplete = !!warmupSession;
    }
  }

  // Two reads, then merge — clearer than a compound .or() filter, and avoids
  // any string-interpolation worries on the filter syntax. Two small queries
  // against a class-sized table is nothing.
  //
  // B38 (session 51): added `round_number` so we can filter the deck to
  // entries from the CURRENT round only. Before this, the deck pulled live
  // entries from any round, which meant a student who submitted for round 1
  // but skipped round 2 would still appear in round 2's spotlight with
  // their stale round 1 photo. Now they appear as a placeholder instead.
  const selectCols =
    "id, student_id, media_url, media_type, description_text, description_l1, uploaded_at, status, round_number";

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

  // ── B38: round-filtered grouping ────────────────────────────────────
  // Group by student_id, but ONLY keep entries whose round_number matches
  // the current round. A student with a round 1 entry and no round 2 entry,
  // playing during round 2, gets an EMPTY entry list here — and falls into
  // the placeholder branch below.
  //
  // Own pending entries pass the same round filter, so a student who just
  // uploaded for the current round sees their own pending photo in the
  // grid (the pre-B38 behavior, preserved).
  const byStudent = new Map<string, typeof rows>();
  for (const r of rows) {
    if ((r.round_number as number) !== currentRound) continue;
    const sid = r.student_id as string;
    const list = byStudent.get(sid) || [];
    list.push(r);
    byStudent.set(sid, list);
  }

  // ── B38: fetch all profiles enrolled in this class ─────────────────
  // profiles.class_id is the "current class" pointer for each enrolled
  // student (set by route.ts's syncCurrentClass on magic-link landing,
  // and by the all-in-one SQL's Phase 2 + Phase 4 for the test seed).
  // Anyone enrolled-but-not-in-byStudent for this round becomes a
  // placeholder tile. We ALSO pull profiles for any submitter who isn't
  // already covered (covers the edge case where a student switched
  // classes — their profile.class_id moved on but their old entries
  // remain).
  const submitterIds = Array.from(byStudent.keys());
  const { data: enrolledProfiles } = await admin
    .from("profiles")
    .select("id, display_name, username, color, bio")
    .eq("class_id", classId);
  const { data: submitterProfiles } = submitterIds.length > 0
    ? await admin
        .from("profiles")
        .select("id, display_name, username, color, bio")
        .in("id", submitterIds)
    : { data: [] as Array<{ id: string; display_name?: string; username?: string; color?: string; bio?: string }> };

  // Merge — id collisions are identical rows, either source wins.
  const profileById = new Map<string, { id: string; display_name?: string; username?: string; color?: string; bio?: string }>();
  for (const p of submitterProfiles ?? []) profileById.set(p.id as string, p as any);
  for (const p of enrolledProfiles ?? []) profileById.set(p.id as string, p as any);

  // Sign one path. Returns null (engine falls back to placeholder) on failure
  // — we LOG (never swallow silently again; that bug cost a session).
  //
  // B17 FIX (#44): entries.media_url is normally a storage PATH in the
  // PRIVATE "media" bucket (where student uploads go). But test seed data
  // may store a full URL (e.g., a public URL from the teacher-deck bucket
  // or an external URL). Full URLs pass through as-is; paths get signed.
  //
  // IMPORTANT: class-deck NEVER searches the teacher-deck bucket. The
  // teacher deck is for the warm-up round only and will become per-teacher
  // sub-decks. These are distinct systems.
  async function sign(path: string | null): Promise<string | null> {
    if (!path) return null;

    // Full URL? Pass through — nothing to sign.
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return path;
    }

    // Storage path → sign from the media bucket.
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

  // ── B38: build the student list. One tile per enrolled profile. ─────
  // Real submitter (has at least one this-round entry) → real EngineStudent
  //   built from their entry data, same as the pre-B38 path.
  // Non-submitter (enrolled but no this-round entry) → placeholder with
  //   isPlaceholder:true, a single synthetic entry with primary:null so
  //   the spotlight's image-or-Avatar fallback renders the greyed avatar.
  //   The synthetic entry id is namespaced (`placeholder:<sid>:r<round>`)
  //   so it can never collide with a real entries.id UUID — important
  //   because comments + favorites are keyed by entry.id throughout the
  //   system (B33 fix) and we don't want anyone to accidentally comment
  //   on a placeholder.
  //
  // ClassEngineStudent extends EngineStudent with isPlaceholder?:boolean.
  // We declare it locally (deck.ts's EngineStudent type doesn't know about
  // it; visitor flow doesn't use placeholders) and the return cast back to
  // EngineStudent[] is fine because consumers that DO care (spotlight.jsx,
  // in plain JSX) just read the optional flag.
  type ClassEngineStudent = EngineStudent & { isPlaceholder?: boolean };
  const students: ClassEngineStudent[] = [];
  let paletteIndex = 0;

  for (const [sid, profile] of profileById) {
    const thisRoundEntries = byStudent.get(sid) ?? [];
    const isSelf = sid === user.id;
    const name = profile.display_name || profile.username || "Classmate";
    const color = profile.color || FALLBACK_PALETTE[paletteIndex % FALLBACK_PALETTE.length];
    const bio = profile.bio || "";

    if (thisRoundEntries.length > 0) {
      // Real submitter — same projection as the pre-B38 code.
      const engineEntries = await Promise.all(
        thisRoundEntries.map(async (r) => ({
          // B33 fix (session 50): entries must carry their own id so the
          // spotlight engine can key comments and favorites by entry.id
          // (the contract the rest of the system — enrollStudent,
          // student-archive's lookup — assumes). Before this, the engine's
          // entryIdOf helper silently fell back to student.id because
          // liveEntry(s).id was undefined, which broke the classmate-comment
          // render in completed-round folders (logged commentKeys: 8 but
          // entriesResolved: 0).
          id: r.id as string,
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
        name,
        color,
        bio,
        entries: engineEntries,
        peerComments: [],
        // Mark the current student's own tile so the engine can skip them in
        // the comment cycle (you don't comment on yourself). The tile still
        // SHOWS in the grid — it's just opted out of the comment step.
        isSelf,
      });
    } else {
      // B38: placeholder for the student who didn't submit this round.
      students.push({
        id: sid,
        name,
        color,
        bio,
        entries: [{
          id: `placeholder:${sid}:r${currentRound}`,
          primary: null,                         // → spotlight renders Avatar fallback
          description: null,
          mediaType: "photo" as const,
          uploadedAt: "",
          descriptionText: "",
          descriptionL1: "",
          readingAudio: null,
        }],
        peerComments: [],
        isSelf,
        isPlaceholder: true,
      });
    }
    paletteIndex++;
  }

  // Lift the current student to the front of the grid — a small but real
  // "I'm in the game" cue. Otherwise preserves Map iteration order.
  students.sort((a, b) => (a.id === user.id ? -1 : b.id === user.id ? 1 : 0));

  return { ok: true, students, classId, currentRound, totalRounds: timing.total_rounds, warmupComplete };
}
