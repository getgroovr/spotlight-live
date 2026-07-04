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
  | { ok: false; reason: "no-supabase" | "no-session" | "no-class" | "no-entries" | "game-over" | "game-not-started" | "entry-pending" | "teacher-account"; classId: string | null };

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
    .select("class_id, role")
    .eq("id", user.id)
    .maybeSingle();
  const classId = profile?.class_id ?? null;
  if (!classId) {
    // Session 72: detect teacher/admin on student route (session swap).
    const reason = (profile?.role === "teacher") ? "teacher-account" as const : "no-class" as const;
    return { ok: false, reason, classId: null };
  }

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

  // ── B39: don't let the student play if their entry is pending ────────
  // If the student submitted a photo for this round but the teacher
  // hasn't approved it yet, they shouldn't play — they'd see their own
  // pending photo in the grid alongside approved classmates, which is
  // confusing. Gate here so the /student/play page can show a "waiting
  // for approval" message.
  //
  // Three cases:
  //   • No entry for this round → proceed (B38 placeholder, student
  //     can still comment on classmates)
  //   • Pending entry → block ("entry-pending")
  //   • Approved (live) entry → proceed (normal play)
  //   • Rejected entry → proceed (they can still play; they'll see
  //     the resubmit prompt on the dashboard)
  {
    const { data: ownCurrentRoundEntry } = await admin
      .from("entries")
      .select("status")
      .eq("student_id", user.id)
      .eq("class_id", classId)
      .eq("round_number", currentRound)
      .eq("is_starter", false)
      .maybeSingle();
    if (ownCurrentRoundEntry?.status === "pending") {
      return { ok: false, reason: "entry-pending", classId };
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
  // IMPORTANT: derive "who's in this class" from the ENROLLMENTS table,
  // NOT from profiles.class_id. profiles.class_id is a convenience
  // pointer set by syncCurrentClass — it can be stale (a profile from
  // a prior test run still has class_id set, causing a phantom 10th
  // tile). Enrollments are the source of truth.
  //
  // The join: enrollments.student_id → students.id, but profiles.id ==
  // auth.users.id (different from students.id for real users). For seed
  // voters the SQL sets students.id == auth.users.id, so the direct
  // path works. For real users we bridge via email.
  //
  // We also pull submitter profiles for anyone who has entries but might
  // not be in the enrollment set (edge case: class switch).
  const submitterIds = Array.from(byStudent.keys());

  // Step 1: get enrolled student rows (students.id, email)
  const { data: enrollmentRows } = await admin
    .from("enrollments")
    .select("student_id")
    .eq("class_id", classId);
  const enrolledStudentIds = (enrollmentRows ?? []).map((e: any) => e.student_id as string);

  const { data: enrolledStudents } = enrolledStudentIds.length > 0
    ? await admin
        .from("students")
        .select("id, email, photo_url")
        .in("id", enrolledStudentIds)
    : { data: [] as Array<{ id: string; email: string; photo_url: string | null }> };

  // Step 2: map students.id → profiles.id. For seed voters it's 1:1.
  // For real users, students.id != profiles.id, so we match via email.
  // We know the current user's email; for other real users we'd need
  // auth.users (not accessible via .from()). In practice the only real
  // user in the class right now is the current user — everyone else is
  // a seed voter whose ids match. This handles both cases.
  const enrolledProfileIds = new Set<string>();
  for (const s of enrolledStudents ?? []) {
    // Seed voter path: students.id IS the profile id
    enrolledProfileIds.add(s.id as string);
    // Real user path: if this student's email matches the logged-in user
    if (user.email && (s.email as string).toLowerCase() === user.email.toLowerCase()) {
      enrolledProfileIds.add(user.id);
    }
  }

  // Step 3: fetch profiles for enrolled ids + submitter ids
  const allProfileIds = Array.from(new Set([...enrolledProfileIds, ...submitterIds]));
  const { data: allProfiles } = allProfileIds.length > 0
    ? await admin
        .from("profiles")
        .select("id, display_name, username, color, bio")
        .in("id", allProfileIds)
    : { data: [] as Array<{ id: string; display_name?: string; username?: string; color?: string; bio?: string }> };

  const profileById = new Map<string, { id: string; display_name?: string; username?: string; color?: string; bio?: string }>();
  for (const p of allProfiles ?? []) profileById.set(p.id as string, p as any);

  // Only iterate enrolled profiles for tile generation (not stale profiles
  // that happen to have class_id set). Submitters who aren't enrolled get
  // skipped — they shouldn't be in the game.
  const tileProfileIds = Array.from(enrolledProfileIds).filter(
    (pid) => profileById.has(pid)
  );

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

  // ── B38: students.photo_url for placeholder tiles ───────────────────
  // Already have enrolledStudents with photo_url from the enrollment
  // query above. Map to profile.id using the same seed-voter/real-user
  // logic.
  const profilePhotoByProfileId = new Map<string, string>();
  for (const s of enrolledStudents ?? []) {
    if (!s.photo_url) continue;
    // Seed voters: students.id == profiles.id (direct match)
    if (profileById.has(s.id as string)) {
      profilePhotoByProfileId.set(s.id as string, s.photo_url as string);
    }
    // Real users: match via email (profiles.id != students.id)
    if (user.email && (s.email as string).toLowerCase() === user.email!.toLowerCase()) {
      profilePhotoByProfileId.set(user.id, s.photo_url as string);
    }
  }

  // ── B38: build the student list. One tile per ENROLLED profile. ────
  type ClassEngineStudent = EngineStudent & { isPlaceholder?: boolean };
  const students: ClassEngineStudent[] = [];
  let paletteIndex = 0;

  for (const sid of tileProfileIds) {
    const profile = profileById.get(sid)!;
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
      // Use their profile photo (students.photo_url) if they have one —
      // it's already a public URL, no signing needed. Spotlight renders
      // it greyed out (opacity 0.5 + grayscale). Falls back to null
      // (Avatar initial+color circle) for students without a photo.
      const profilePhoto = profilePhotoByProfileId.get(sid) ?? null;
      students.push({
        id: sid,
        name,
        color,
        bio,
        entries: [{
          id: `placeholder:${sid}:r${currentRound}`,
          primary: profilePhoto,
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
