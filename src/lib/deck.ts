// ─────────────────────────────────────────────────────────────────────────
// src/lib/deck.ts — DB → engine adapter for the warm-up deck
//
// DESTINATION: src/lib/deck.ts   (REPLACES existing file)
//
// Session 68: Multi-teacher warm-up support.
//
// The admin sets `warmup_teacher_count` (1, 3, or 9) in admin_settings.
// The deck reads that value and builds the 3×3 grid from the rotation
// queue's active teachers:
//
//   Solo (1): Recruiting teacher → 9 photos
//   Trio (3): Top 3 in rotation  → 3 photos each
//   Full (9): Top 9 in rotation  → 1 photo each
//
// Teachers are selected from `teacher_rotation` where status is
// 'recruiting' or 'waiting'. The recruiting teacher always comes first.
// After that, teachers are ordered by sort_order ascending.
//
// If fewer teachers are in rotation than the mode requires, the deck
// uses however many are available and distributes 9 photos across them
// via round-robin (e.g. mode=3 with 2 teachers → 5+4 split). If any
// teacher runs short, others backfill. Only when total active starters
// across all selected teachers is < 9 does the deck return underfilled.
//
// Each starter entry's `id` IS the tile's `id` in the engine. When a
// visitor favorites a tile, that entry id lets enrollStudent() resolve
// which class (and therefore which teacher) to enroll them in — the
// entry's class_id is the key. Multi-class teachers may have starters
// in different classes; the favorite determines the assignment.
//
// MEDIA URLs:
//   Seed photos have full URLs in media_url (e.g. https://...storage.../
//   seed-photos/black wolf.jpg). Teacher-uploaded starters have storage
//   paths (e.g. classId/teacherId/timestamp.jpg) in the `teacher-deck`
//   public bucket. The loader checks: starts with "http" → use directly;
//   otherwise → getPublicUrl from teacher-deck bucket.
//
// SERVICE ROLE:
//   Uses the service-role key to bypass RLS. Anonymous visitors can't
//   read admin_settings or teacher_rotation through the anon/SSR client,
//   but they need the deck to play. This runs server-side only (guarded
//   by "server-only" import) so the key is never exposed.
//
// PREVIOUS BEHAVIOR (pre-session 68):
//   The deck pulled starters from all is_public=true classes. The
//   is_public mechanism is now replaced by the rotation queue. Classes
//   no longer need is_public=true to appear in the warm-up deck; their
//   teachers need to be in the rotation instead.
// ─────────────────────────────────────────────────────────────────────────
import "server-only";
import { createClient as createServiceClient } from "@supabase/supabase-js";

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
//
// isSelf:
//   true if this tile belongs to the currently-logged-in student, false
//   otherwise. Set by class-deck.ts (the in-class adapter). The visitor
//   deck (loadGenericDeck below) has no "self" — visitors aren't students —
//   so it sets isSelf:false on every starter tile. The engine uses this to
//   skip the current student's own tile during the comment cycle.
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

// Result of loadGenericDeck — discriminated so callers can branch on the
// "not enough photos yet" case without inspecting array length.
export type DeckResult =
  | { ok: true; students: EngineStudent[] }
  | { ok: false; reason: "no-supabase" | "no-class" | "underfilled"; have: number };

const DECK_SIZE = 9;

// Fisher-Yates shuffle (in-place, returns same array).
function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function loadGenericDeck(): Promise<DeckResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, reason: "no-supabase", have: 0 };
  }

  const sb = createServiceClient(supabaseUrl, serviceKey);

  // ── 1. Read warm-up mode ──────────────────────────────────────────
  const { data: settings } = await sb
    .from("admin_settings")
    .select("warmup_teacher_count")
    .eq("id", 1)
    .single();

  const teacherCount = (settings?.warmup_teacher_count ?? 1) as 1 | 3 | 9;

  // ── 2. Get teachers from rotation queue ───────────────────────────
  // Status must be 'recruiting' or 'waiting' (paused teachers are out).
  // Recruiting teacher always comes first; ties broken by sort_order.
  const { data: rotationRows } = await sb
    .from("teacher_rotation")
    .select("teacher_id, status, sort_order")
    .in("status", ["recruiting", "waiting"])
    .order("sort_order", { ascending: true });

  if (!rotationRows || rotationRows.length === 0) {
    return { ok: false, reason: "no-class", have: 0 };
  }

  // Recruiting teacher goes first in the selection order.
  const sorted = [...rotationRows].sort((a, b) => {
    if (a.status === "recruiting" && b.status !== "recruiting") return -1;
    if (b.status === "recruiting" && a.status !== "recruiting") return 1;
    return a.sort_order - b.sort_order;
  });

  // Use up to teacherCount, but fall back to however many are available.
  const selectedTeachers = sorted.slice(0, teacherCount);
  const teacherIds = selectedTeachers.map((t) => t.teacher_id);

  // ── 3. Fetch active starters for selected teachers ────────────────
  // Starters have student_id = teacher's profile id, is_starter = true,
  // is_active = true (admin can deactivate individual photos).
  //
  // C1 (session 73): mode-aware filtering. Each starter has three boolean
  // columns — selected_solo, selected_trio, selected_full — set by the
  // teacher's deck selection UI. The deck now reads the mode from
  // admin_settings and filters on the matching column, so only photos
  // the teacher chose for the ACTIVE mode appear in the warm-up grid.
  // is_active is kept as a separate admin-level override (can turn off
  // individual photos regardless of mode selection).
  const modeColumn =
    teacherCount === 1 ? "selected_solo"
    : teacherCount === 3 ? "selected_trio"
    : "selected_full";

  const { data: starters, error } = await sb
    .from("entries")
    .select(
      "id, student_id, media_url, media_type, description_text, description_l1, uploaded_at",
    )
    .in("student_id", teacherIds)
    .eq("is_starter", true)
    .eq("is_active", true)
    .eq(modeColumn, true)
    .eq("status", "live");

  if (error || !starters) {
    return { ok: false, reason: "underfilled", have: 0 };
  }

  // ── 4. Distribute photos across teachers via round-robin ──────────
  // Group by teacher, shuffle each teacher's pool independently.
  const byTeacher = new Map<string, typeof starters>();
  for (const s of starters) {
    const list = byTeacher.get(s.student_id) || [];
    list.push(s);
    byTeacher.set(s.student_id, list);
  }

  const teacherPools = teacherIds.map((id) => ({
    pool: shuffleInPlace([...(byTeacher.get(id) || [])]),
    idx: 0,
  }));

  // Round-robin: slot 0 → teacher 0, slot 1 → teacher 1, etc.
  // Natural distribution: 3 teachers → 3-3-3, 2 → 5-4, 1 → 9.
  const picked: (typeof starters)[number][] = [];
  for (let slot = 0; slot < DECK_SIZE; slot++) {
    const tp = teacherPools[slot % teacherPools.length];
    if (tp.idx < tp.pool.length) {
      picked.push(tp.pool[tp.idx]);
      tp.idx++;
    }
  }

  // Backfill: if any teacher ran short during round-robin, take extras
  // from teachers that still have photos.
  if (picked.length < DECK_SIZE) {
    for (const tp of teacherPools) {
      while (tp.idx < tp.pool.length && picked.length < DECK_SIZE) {
        picked.push(tp.pool[tp.idx]);
        tp.idx++;
      }
    }
  }

  if (picked.length < DECK_SIZE) {
    return { ok: false, reason: "underfilled", have: picked.length };
  }

  // ── 5. Final shuffle for grid variety ─────────────────────────────
  // Without this, Trio mode would always show teacher-A in positions
  // 0/3/6, teacher-B in 1/4/7, etc. Shuffling the final 9 means the
  // grid looks different every visit.
  shuffleInPlace(picked);

  // ── 6. Build EngineStudent[] ──────────────────────────────────────
  const students: EngineStudent[] = picked.map((r, i): EngineStudent => {
    let publicUrl: string | null = null;

    if (r.media_url) {
      if (r.media_url.startsWith("http")) {
        // Seed photos: media_url is already a full public URL.
        publicUrl = r.media_url;
      } else {
        // Teacher-deck uploads: media_url is a storage path in the
        // teacher-deck public bucket. getPublicUrl constructs the URL
        // (no API call, no auth needed).
        try {
          const { data } = sb.storage
            .from(STARTER_BUCKET)
            .getPublicUrl(r.media_url);
          publicUrl = data?.publicUrl ?? null;
        } catch (e) {
          console.error(
            `[deck] getPublicUrl threw for path: ${r.media_url}`,
            e,
          );
        }
      }
      if (!publicUrl) {
        console.error(
          `[deck] No URL resolved for media_url: ${r.media_url}`,
        );
      }
    }

    const color = STARTER_PALETTE[i % STARTER_PALETTE.length];
    return {
      id: r.id,
      name: `Photo ${i + 1}`,
      color,
      bio: "",
      entries: [
        {
          primary: publicUrl,
          description: null,
          mediaType: (r.media_type as "photo" | "video") || "photo",
          uploadedAt: (r.uploaded_at || "").slice(0, 10),
          descriptionText: r.description_text || "",
          descriptionL1: r.description_l1 || "",
          readingAudio: null,
        },
      ],
      peerComments: [],
      isSelf: false,
    };
  });

  return { ok: true, students };
}
