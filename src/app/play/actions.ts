// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/play/actions.ts   (REPLACES existing file)
//
// Server Actions for the /play surface and profile.
//
// Slice 1 (cohorts foundation):
//   - enrollStudent derives teacher + level from the FAVORITED ENTRY's
//     class, then finds the best available RECRUITING class for that
//     teacher at that level with room (< 9 active enrollments). Prefers
//     the original class if it qualifies; falls back to other classes at
//     the same teacher/level. This replaced the old approach of directly
//     using the favorite entry's class_id (which failed when that class
//     was full or no longer recruiting).
//
// Session 99: Smart class routing — enrollStudent no longer assumes the
//   favorite entry's class_id is the enrollment target. Instead it looks
//   up teacher_id + level from that class, finds all recruiting classes
//   for that teacher at that level, and picks the first with room. The
//   favorite's class gets priority if it qualifies.
//
// Slice 1 Part 2 guard (World B — "one active class at a time"):
//   - Before creating a NEW enrollment, refuse if the student already has an
//     ACTIVE enrollment in a DIFFERENT class. A student is in at most one live
//     class; finished classes are status='completed' and become history.
//     Re-enrolling in the SAME class is still fine (idempotent upsert).
//     (Manual completion for now — nothing here flips active→completed yet;
//     that's a later slice. The DB also has a partial unique index as a hard
//     backstop, see migration 20260601180000.)
//
// Slice 1B (Profile v1):
//   - enrollStudent : end-of-game join. EMAIL ONLY. Creates/reuses a student,
//     an enrollment, a round-0 (warm-up) game_session (nine comments + the
//     favorite), then sends a magic link. Name/screen name/the "why" come later.
//
// Session 108: saveProfile split into two actions:
//   - saveProfileInfo : saves students.name + students.screen_name. No photo,
//     no entry, no enrollment. Step 1 of the two-step finish-joining flow.
//   - saveFirstEntry  : uploads first game entry photo, creates entries row
//     at round 1, sets profiles.class_id (fixing the no-class bug), and
//     saves the favorite comment on the game_session. Step 2.
//   The old saveProfile is removed.
//
// Slice 1 engine-adaptation (#25):
//   - addEntry     : dashboard form for adding ANOTHER photo after the
//     first one. Same write path — uploads to PRIVATE `media`
//     bucket, inserts `entries` row at status='pending' on the profiles
//     track (entries.student_id = profiles.id = auth user.id). No limit
//     on how many pending an account can have; teacher moderates.
//
// Error surfacing (#26):
//   - saveProfileInfo AND saveFirstEntry return ActionResult. The dashboard
//     wraps each form in a client component (ProfileForm / PhotoUploadForm)
//     that calls useFormState against the action and renders an error
//     banner above the submit on failure.
//
// Slice 1 round assignment (#27):
//   - entries.round_number is now NOT NULL. Every insert must set it.
//   - saveFirstEntry's first-entry insert is always round_number = 1.
//   - addEntry resolves a target round number:
//       * If the form passes a round_number (the slot-grid UI in pass 2),
//         that value is validated and used.
//       * Otherwise (today's "Add another photo" form, which has no slot
//         picker yet), addEntry finds the lowest unlocked + unfilled slot.
//
// Round-timing helpers (#30 follow-up): extracted to src/lib/round-timing.ts
// and now imported alongside the rest of the module's dependencies.
//
// #38: saveFirstEntry now sets favorite_comment_status = 'pending' when
//      writing the why-note to game_sessions, so it appears in the
//      teacher's pending queue for approval. Resubmissions (after a
//      rejection) reset the reviewed fields.
//
// B23 (#47): Rejection/resubmission workflow:
//   - resubmitEntry: student uploads new photo + description for a
//     rejected entry. Status resets to 'pending'. Entry row is updated
//     in place so teacher_comments history is preserved.
//   - resubmitFavoriteComment: student edits rejected favorite comment
//     text. Status resets to 'pending' on game_sessions.
//
// B56 (session 60): saveStudentRound was not setting favorite_comment
//   or favorite_comment_status on game_sessions for student rounds.
//   The teacher review queue filters on favorite_comment_status='pending',
//   so student-round favorite comments were invisible. Fixed: the favorite
//   entry's comment is now extracted and written to favorite_comment with
//   status='pending', mirroring the warm-up path in saveFirstEntry.
//
// D2 (session 84): Student-side round-phase enforcement.
//   - addEntry: rejects submissions after the game phase deadline
//     (isSubmissionsClosed). Previously only checked isRoundLocked
//     (round started). Now a started round that's still in its game
//     phase allows submissions, but once game_phase_hours elapse,
//     submissions are closed even though the round isn't "over" yet
//     (review phase follows).
//   - saveStudentRound: same game-phase-closed check. Students can't
//     submit comments/favorites after the game phase ends.
//   - ClassTiming reads now include game_phase_hours + review_phase_hours
//     from the classes table (added by D1 migration).
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  type ClassTiming,
  computeCurrentRound,
  isRoundLocked,
  isGameOver,
  isSubmissionsClosed,
} from "@/lib/round-timing";

export type EnrollResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

// Generic shape for server actions whose success-side payload is just
// "the page revalidated, look there." Used by saveProfileInfo,
// saveFirstEntry, addEntry, and removeEntry.
export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

// Resolve an unspecified target round → the lowest unlocked + unfilled slot.
// Used when the form doesn't pass round_number explicitly (today's
// "Add another photo" form, pre slot-grid).  Returns null if nothing's
// available (everything filled, everything locked, or game over).
//
// Note: when total_rounds is NULL (game not configured yet), the only valid
// slot is round 1.  Pre-configuration uploads stack on round 1; once the
// teacher configures total_rounds, additional uploads spread to later slots.
async function findFirstAvailableRound(
  admin: ReturnType<typeof createServiceClient>,
  userId: string,
  classId: string,
  timing: ClassTiming,
  now: Date = new Date(),
): Promise<number | null> {
  if (isGameOver(timing, now)) return null;
  // When total_rounds is NULL (teacher hasn't configured yet), the student
  // can still stage uploads — each one claims the next sequential round
  // number. Cap at 100 to match the CHECK constraint on classes.total_rounds.
  const maxRound = timing.total_rounds ?? 100;

  const { data: existing } = await admin
    .from("entries")
    .select("round_number")
    .eq("student_id", userId)
    .eq("class_id", classId);
  const filled = new Set<number>(
    (existing || []).map((e: { round_number: number }) => e.round_number),
  );

  for (let r = 1; r <= maxRound; r++) {
    if (filled.has(r)) continue;
    // D2: In phase mode, a locked round whose game phase is still open is
    // available. In legacy mode, locked = unavailable.
    if (isRoundLocked(r, timing, now)) {
      if (timing.game_phase_hours != null && !isSubmissionsClosed(r, timing, now)) {
        // Round started but game phase still open — this slot is available.
        return r;
      }
      continue;
    }
    return r;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// requestMagicLink — B53: re-authentication from the student dashboard.
//
// When a student's session has expired, the dashboard shows an email form
// instead of redirecting to /play. This action sends a new magic link to
// an email that MUST already be enrolled (no new enrollment created).
//
// After clicking the link, the student lands back on /student/dashboard
// (via /auth/confirm → redirect) with a fresh session.
// ─────────────────────────────────────────────────────────────────────────
export async function requestMagicLink(formData: FormData): Promise<EnrollResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return { ok: false, error: "Server is not configured." };
  }

  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  // Verify this email is actually enrolled somewhere
  const admin = createServiceClient(supabaseUrl, serviceKey);
  const { data: student } = await admin
    .from("students")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (!student) {
    return {
      ok: false,
      error: "We don't have that email on file. Play the warm-up round first to join a class.",
    };
  }

  // Send a new magic link — redirect to dashboard after auth
  const anon = createServiceClient(supabaseUrl, anonKey);
  const { error: otpErr } = await anon.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/student/dashboard`,
    },
  });
  if (otpErr) {
    console.error("Magic link send failed:", otpErr.message);
    return { ok: false, error: "We couldn't send the email. Please try again in a minute." };
  }

  return { ok: true, message: "Check your email for a new sign-in link." };
}

// ─────────────────────────────────────────────────────────────────────────
// enrollStudent — Session 72 fix: preserve the ID invariant
//   students.id == auth.users.id == profiles.id
//
// Session 99: Smart class routing — no longer blindly enrolls into the
//   favorite entry's class. Derives teacher + level, then finds a
//   recruiting class with room. See class resolution block below.
//
// The bug this fixes: this function used to create a students row with a
// fresh random UUID before the auth user existed. Later, when the visitor
// clicked the magic link, Supabase created auth.users with a DIFFERENT id.
// entries.student_id (which references profiles/auth) then no longer joined
// to enrollments.student_id (which references students). Dashboard returned
// "not-enrolled" even though the enrollment row was there.
//
// Fix: create the auth.users row FIRST via admin.createUser (returns a new
// row or "email_exists"). Then use that id for the students row. If a stale
// students row exists from before this fix, reconcile it in-place — same
// dance as the one-shot reconcile SQL from Session 72: rename the old row's
// email to a sentinel, insert the new row keyed to auth id, migrate FK
// references, delete the old row.
//
// Round-0 convention unchanged: enrollStudent writes round=0 for the
// warm-up session and enrollment.
//
// SESSION 72 UPDATE — returning-visitor fallback (this session):
//   The initial Session 72 fix left a bug in the fallback lookup. When
//   admin.auth.admin.createUser refused because the email already existed,
//   the code tried admin.schema("auth").from("users") to fetch the id.
//   PostgREST doesn't expose the `auth` schema by default, so that call
//   silently returned null even for existing users. The visitor saw
//   "Could not identify your account: A user with this email address has
//   already been registered" — the two halves came from the app's own
//   fallback branch concatenating createErr.message onto its prefix.
//
//   Fixed by calling a SECURITY DEFINER RPC (get_auth_user_id_by_email)
//   added in migration 20260703000000_auth_user_lookup_rpc.sql. Any
//   returning student who hits /play now correctly resolves to their
//   existing auth id and receives a magic link.
// ─────────────────────────────────────────────────────────────────────────
export async function enrollStudent(formData: FormData): Promise<EnrollResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return { ok: false, error: "Server is not configured." };
  }
  const admin = createServiceClient(supabaseUrl, serviceKey);

  // ── Validate inputs ───────────────────────────────────────────────────
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const commentsRaw = String(formData.get("comments") || "{}");
  const favoritesRaw = String(formData.get("favorites") || "{}");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  let comments: Record<string, string> = {};
  let favorites: Record<string, boolean> = {};
  try {
    comments = JSON.parse(commentsRaw);
    favorites = JSON.parse(favoritesRaw);
  } catch {}

  // ── Resolve the class — find a recruiting class with room ─────────────
  // Step 1: identify teacher + level from the favorite entry's class.
  // Step 2: find the best available recruiting class for that teacher at
  //         that level that still has room (< 9 active enrollments).
  //
  // This replaces the old approach of directly using the favorite entry's
  // class_id, which broke when that class was full or no longer recruiting.
  const favEntryId = Object.keys(favorites).find((k) => favorites[k]);
  if (!favEntryId) {
    return { ok: false, error: "No favorite was selected." };
  }

  const { data: favEntry, error: favErr } = await admin
    .from("entries")
    .select("class_id")
    .eq("id", favEntryId)
    .maybeSingle();
  if (favErr || !favEntry?.class_id) {
    return { ok: false, error: "Could not resolve the favorited photo's class." };
  }

  // Look up the teacher + level from the favorite's class
  const { data: favClass, error: favClassErr } = await admin
    .from("classes")
    .select("teacher_id, level")
    .eq("id", favEntry.class_id)
    .maybeSingle();
  if (favClassErr || !favClass?.teacher_id) {
    return { ok: false, error: "Could not identify the teacher for this class." };
  }
  const targetTeacherId = favClass.teacher_id;
  const targetLevel = favClass.level || "beginner";

  // Find all recruiting classes for this teacher at this level
  const { data: candidateClasses, error: candidateErr } = await admin
    .from("classes")
    .select("id")
    .eq("teacher_id", targetTeacherId)
    .eq("level", targetLevel)
    .eq("is_recruiting", true);
  if (candidateErr || !candidateClasses || candidateClasses.length === 0) {
    return {
      ok: false,
      error: "This teacher doesn't have an open class at this level right now.",
    };
  }

  // For each candidate, check enrollment count — pick the first with room.
  // Prefer the original favorite's class if it's among the candidates and
  // has room, so the student lands where the photos came from.
  const candidateIds = candidateClasses.map((c) => c.id);
  // Put the favorite's class first so it gets priority
  candidateIds.sort((a, b) =>
    a === favEntry.class_id ? -1 : b === favEntry.class_id ? 1 : 0,
  );

  let classId: string | null = null;
  for (const cid of candidateIds) {
    const { count, error: cntErr } = await admin
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("class_id", cid)
      .eq("status", "active");
    if (cntErr) continue;
    if ((count ?? 0) < 9) {
      classId = cid;
      break;
    }
  }
  if (!classId) {
    return {
      ok: false,
      error:
        "All of this teacher's classes at this level are full. Ask your teacher to open another class.",
    };
  }

  // ── Ensure auth.users row exists; get its id ──────────────────────────
  // Attempt to create the auth user (email_confirm: false — the magic link
  // will confirm them). If they already exist, admin.createUser returns an
  // error and we fall through to the RPC lookup below.
  let authUserId: string;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: false,
  });

  if (created?.user?.id) {
    authUserId = created.user.id;
  } else {
    // Returning visitor — createUser refused because auth.users already has
    // a row for this email. Look up the id via a SECURITY DEFINER RPC
    // added in migration 20260703000000_auth_user_lookup_rpc.sql.
    //
    // Why RPC instead of admin.schema("auth").from("users"):
    //   PostgREST doesn't expose the `auth` schema, so the .schema("auth")
    //   approach silently returned null even for existing users. RPCs run
    //   as service_role directly against Postgres and don't have that
    //   restriction. This is the reliable path.
    const { data: existingId, error: rpcErr } = await admin
      .rpc("get_auth_user_id_by_email", { p_email: email });
    if (rpcErr || !existingId) {
      return {
        ok: false,
        error: `Could not identify your account: ${
          createErr?.message || rpcErr?.message || "unknown error"
        }`,
      };
    }
    authUserId = existingId as string;
  }

  // ── Reconcile any stale students row (id != authUserId) ───────────────
  // Legacy data: if enrollStudent was called before this fix, the students
  // row may have a random id. Migrate it in place.
  const { data: existingStudent } = await admin
    .from("students")
    .select("id, name, screen_name")
    .eq("email", email)
    .maybeSingle();

  if (existingStudent && existingStudent.id !== authUserId) {
    const oldId = existingStudent.id as string;

    // 1. Free the email on the old row so the new insert can use it
    await admin
      .from("students")
      .update({ email: `stale-${oldId}@removed.local` })
      .eq("id", oldId);

    // 2. Insert new row keyed to auth id, preserving name/screen_name
    await admin.from("students").insert({
      id: authUserId,
      email,
      name: (existingStudent.name as string | null) ?? null,
      screen_name: (existingStudent.screen_name as string | null) ?? null,
    });

    // 3. Re-point FK references
    await admin.from("enrollments").update({ student_id: authUserId }).eq("student_id", oldId);
    await admin.from("game_sessions").update({ student_id: authUserId }).eq("student_id", oldId);

    // 4. Delete the stale row
    await admin.from("students").delete().eq("id", oldId);
  } else if (!existingStudent) {
    // Fresh visitor — insert the students row with id = auth id
    const { error: stuErr } = await admin
      .from("students")
      .insert({ id: authUserId, email });
    if (stuErr) {
      return { ok: false, error: `Could not create student record: ${stuErr.message}` };
    }
  }
  // else: existingStudent.id === authUserId — nothing to do.

  const studentId = authUserId;

  // ── GUARD: one ACTIVE class at a time (World B) ───────────────────────
  const { data: activeRows, error: activeErr } = await admin
    .from("enrollments")
    .select("class_id")
    .eq("student_id", studentId)
    .eq("status", "active");
  if (activeErr) {
    return { ok: false, error: `Could not check enrollment: ${activeErr.message}` };
  }
  const activeOther = (activeRows || []).find((r) => r.class_id !== classId);
  if (activeOther) {
    return {
      ok: false,
      error:
        "You're already in a class. You can join a new one once your current class has finished.",
    };
  }

  // ── CLASS SIZE ENFORCEMENT — max 9 students per class ─────────────────
  const { count: classSize, error: countErr } = await admin
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("class_id", classId)
    .eq("status", "active")
    .neq("student_id", studentId);
  if (countErr) {
    return { ok: false, error: `Could not check class size: ${countErr.message}` };
  }
  if ((classSize ?? 0) >= 9) {
    return {
      ok: false,
      error: "This class is full (9 students max). Ask your teacher to create another class.",
    };
  }

  // ── Upsert enrollment (status defaults to 'active') ───────────────────
  const { error: enrollErr } = await admin
    .from("enrollments")
    .upsert(
      { student_id: studentId, class_id: classId, round: 0, status: "active" },
      { onConflict: "student_id,class_id" }
    );
  if (enrollErr) {
    return { ok: false, error: `Enrollment failed: ${enrollErr.message}` };
  }

  // ── Save the warm-up (round 0) game session ───────────────────────────
  const { error: sessionErr } = await admin
    .from("game_sessions")
    .insert({
      student_id: studentId,
      class_id: classId,
      round: 0,
      comments,
      favorites,
    });
  if (sessionErr) {
    console.error("game_session insert failed:", sessionErr.message);
  }

  // ── Send magic link via signInWithOtp ─────────────────────────────────
  // The auth.users row already exists (from createUser above); this just
  // sends the confirmation email. shouldCreateUser stays true as a safety
  // net in case createUser above returned an error we didn't fully handle.
  const anon = createServiceClient(supabaseUrl, anonKey);
  const { error: otpErr } = await anon.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/student/dashboard`,
    },
  });
  if (otpErr) {
    console.error("Magic link send failed:", otpErr.message);
  }

  revalidatePath("/play");
  return {
    ok: true,
    message: "Check your email for your invitation.",
  };
}

// ─────────────────────────────────────────────────────────────────────────
// saveProfileInfo — Session 108: Step 1 of the two-step finish-joining flow.
//
// Saves only students.name + students.screen_name. No photo upload, no
// entry creation, no enrollment mutation. Lightweight — just two fields.
//
// After this succeeds, the dashboard re-renders. The student now has a
// complete profile (name + screen_name) but no entry yet, so the dashboard
// shows PhotoUploadForm (step 2) instead of ProfileForm (step 1).
//
// Signature: (prevState, formData) => ActionResult — useFormState contract.
// ─────────────────────────────────────────────────────────────────────────
export async function saveProfileInfo(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return {
      ok: false,
      error: "The server isn't configured. Please tell your teacher.",
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      ok: false,
      error: "We couldn't reach the server. Please try again in a moment.",
    };
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return {
      ok: false,
      error: "Your sign-in expired. Please use the magic link again.",
    };
  }

  const name = String(formData.get("name") || "").trim();
  const screenName = String(formData.get("screen_name") || "").trim();

  if (!name || !screenName) {
    return {
      ok: false,
      error: "Please fill in your full name and screen name.",
    };
  }

  const admin = createServiceClient(supabaseUrl, serviceKey);

  const { data: student } = await admin
    .from("students")
    .select("id")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  if (!student) {
    return {
      ok: false,
      error: "We couldn't find your enrollment. Try the play page and re-join.",
    };
  }

  await admin
    .from("students")
    .update({ name, screen_name: screenName })
    .eq("id", student.id);

  revalidatePath("/student/dashboard");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// saveFirstEntry — Session 108: Step 2 of the two-step finish-joining flow.
//
// Uploads the student's first game photo, creates the entries row at
// round 1, sets profiles.class_id (fixing the "no-class" bug for real
// users), and saves the favorite comment on the game_session.
//
// This is the action that makes the student "exist" in the class from
// the dashboard's perspective — after this, isComplete becomes true.
//
// Fields:
//   entry_photo       — File, REQUIRED — the student's first game entry
//   entry_description — string, REQUIRED — what is it, why they picked it
//   favorite_comment  — string, OPTIONAL — "why was this your favorite?"
//                       (only present when a warmup favorite exists)
//
// Class resolution: finds the enrollment's class_id via students →
//   enrollments. Also sets profiles.class_id so downstream code
//   (class-deck, addEntry, saveStudentRound) can find the class via the
//   fast path.
//
// Signature: (prevState, formData) => ActionResult — useFormState contract.
// ─────────────────────────────────────────────────────────────────────────
export async function saveFirstEntry(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return {
      ok: false,
      error: "The server isn't configured. Please tell your teacher.",
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      ok: false,
      error: "We couldn't reach the server. Please try again in a moment.",
    };
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return {
      ok: false,
      error: "Your sign-in expired. Please use the magic link again.",
    };
  }

  const entryPhoto = formData.get("entry_photo");
  const entryDescription = String(formData.get("entry_description") || "").trim();
  const why = String(formData.get("favorite_comment") || "").trim();

  if (!(entryPhoto instanceof File) || entryPhoto.size === 0) {
    return { ok: false, error: "Please add your first photo." };
  }
  if (!entryDescription) {
    return { ok: false, error: "Please write a short description of your photo." };
  }

  const admin = createServiceClient(supabaseUrl, serviceKey);

  // ── Find student row ──────────────────────────────────────────────────
  const { data: student } = await admin
    .from("students")
    .select("id")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  if (!student) {
    return {
      ok: false,
      error: "We couldn't find your enrollment. Try the play page and re-join.",
    };
  }

  // ── Resolve class via enrollments (the reliable path) ─────────────────
  // profiles.class_id may not be set yet. The enrollment was created by
  // enrollStudent during warmup, so the enrollments table is the source
  // of truth.
  let entryClassId: string | null = null;

  // Try profiles.class_id first (fast path for returning students)
  const { data: profile } = await admin
    .from("profiles")
    .select("class_id")
    .eq("id", user.id)
    .maybeSingle();
  entryClassId = profile?.class_id ?? null;

  // Enrollments fallback (the common path for new students)
  if (!entryClassId) {
    const { data: enrollment } = await admin
      .from("enrollments")
      .select("class_id")
      .eq("student_id", student.id)
      .eq("status", "active")
      .maybeSingle();
    entryClassId = enrollment?.class_id ?? null;
  }

  if (!entryClassId) {
    return {
      ok: false,
      error: "We couldn't find your class. Please tell your teacher.",
    };
  }

  // ── Upload photo to PRIVATE media bucket ──────────────────────────────
  const ext =
    entryPhoto.name.includes(".") ? entryPhoto.name.split(".").pop() : "jpg";
  const entryPath = `${entryClassId}/${user.id}-${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from("media")
    .upload(entryPath, entryPhoto, {
      contentType: entryPhoto.type || "image/jpeg",
      upsert: true,
    });
  if (upErr) {
    return {
      ok: false,
      error: `Your photo didn't upload. Please try again. (${upErr.message})`,
    };
  }

  // ── Create entries row at round 1 ─────────────────────────────────────
  const { error: entryErr } = await admin.from("entries").insert({
    student_id: user.id,       // profiles(id) — NOT students.id
    class_id: entryClassId,
    media_url: entryPath,
    media_type: "photo",
    description_text: entryDescription,
    round_number: 1,            // finish-joining is always pre-game
    // status defaults to 'pending'; is_starter to false; uploaded_at to now()
  });
  if (entryErr) {
    return {
      ok: false,
      error: `We couldn't save your photo. Please try again. (${entryErr.message})`,
    };
  }

  // ── Set profiles.class_id (fixes the "no-class" bug) ──────────────────
  // This is the field that class-deck.ts, addEntry, and saveStudentRound
  // use as the fast path to find the student's class. enrollStudent never
  // set it, which is why real users hit the "no-class" error.
  await admin
    .from("profiles")
    .update({ class_id: entryClassId })
    .eq("id", user.id);

  // ── Attach the why-note to their most recent session (soft) ───────────
  // #38: Also set favorite_comment_status = 'pending' so the teacher sees
  // it in the pending queue. Reset reviewed fields in case this is a
  // resubmission after rejection.
  if (why.length >= 15) {
    const { data: session } = await admin
      .from("game_sessions")
      .select("id")
      .eq("student_id", student.id)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (session) {
      await admin
        .from("game_sessions")
        .update({
          favorite_comment: why,
          favorite_comment_status: "pending",
          favorite_comment_reviewed_by: null,
          favorite_comment_reviewed_at: null,
          favorite_comment_rejection_reason: null,
        })
        .eq("id", session.id);
    }
  }

  revalidatePath("/student/dashboard");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// addEntry — used as a <form action> on the dashboard (COMPLETE state).
// Today wrapped by AddEntryForm.tsx (the single "Add another photo" form).
// In pass 2, the dashboard becomes a slot grid; each slot's upload form
// passes a round_number hidden input and addEntry uses that exact value.
//
// Behavior matrix:
//   form passes round_number?     →  validate + use
//   no round_number on form       →  auto-resolve: lowest unlocked +
//                                    unfilled slot (or round 1 pre-game)
//
// Reject conditions:
//   • game over (now past last round's start time)
//   • target round > total_rounds (when set)
//   • target round is locked (now ≥ that round's start time)
//   • target round already has an entry from this student
//     (use removeEntry to clear it first)
// ─────────────────────────────────────────────────────────────────────────
export async function addEntry(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return {
      ok: false,
      error: "The server isn't configured. Please tell your teacher.",
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      ok: false,
      error: "We couldn't reach the server. Please try again in a moment.",
    };
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return {
      ok: false,
      error: "Your sign-in expired. Please use the magic link again.",
    };
  }

  const entryPhoto = formData.get("entry_photo");
  const entryDescription = String(formData.get("entry_description") || "").trim();

  if (!(entryPhoto instanceof File) || entryPhoto.size === 0) {
    return { ok: false, error: "Please choose a photo." };
  }
  if (!entryDescription) {
    return { ok: false, error: "Please write a short description." };
  }

  const admin = createServiceClient(supabaseUrl, serviceKey);

  // ── Resolve current class (profiles track) ───────────────────────────
  const { data: profile } = await admin
    .from("profiles")
    .select("class_id")
    .eq("id", user.id)
    .maybeSingle();
  const entryClassId = profile?.class_id ?? null;
  if (!entryClassId) {
    return {
      ok: false,
      error: "We couldn't find your class. Please tell your teacher.",
    };
  }

  // ── Read class timing (#27, D2) ──────────────────────────────────────
  const { data: classRow } = await admin
    .from("classes")
    .select("total_rounds, game_starts_at, round_duration_hours, game_phase_hours, review_phase_hours")
    .eq("id", entryClassId)
    .maybeSingle();
  const timing: ClassTiming = {
    total_rounds: classRow?.total_rounds ?? null,
    game_starts_at: classRow?.game_starts_at ?? null,
    round_duration_hours: classRow?.round_duration_hours ?? null,
    game_phase_hours: classRow?.game_phase_hours ?? null,
    review_phase_hours: classRow?.review_phase_hours ?? null,
  };

  // Early reject if game is over.
  if (isGameOver(timing)) {
    return { ok: false, error: "The game has ended. No more photos can be added." };
  }

  // ── Resolve target round ─────────────────────────────────────────────
  let targetRound: number;
  const requestedRoundRaw = formData.get("round_number");
  if (requestedRoundRaw !== null && String(requestedRoundRaw).trim() !== "") {
    const parsed = parseInt(String(requestedRoundRaw), 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return { ok: false, error: "That round isn't valid." };
    }
    targetRound = parsed;
  } else {
    const resolved = await findFirstAvailableRound(admin, user.id, entryClassId, timing);
    if (resolved === null) {
      return {
        ok: false,
        error:
          "There aren't any open slots left for you. Remove an existing photo to upload a new one, or wait for your teacher to extend the game.",
      };
    }
    targetRound = resolved;
  }

  // ── Validate target round ────────────────────────────────────────────
  if (timing.total_rounds !== null && targetRound > timing.total_rounds) {
    return {
      ok: false,
      error: `Round ${targetRound} doesn't exist in this game (only ${timing.total_rounds} round${timing.total_rounds === 1 ? "" : "s"}).`,
    };
  }
  if (isRoundLocked(targetRound, timing)) {
    // D2: A locked round might still be in its game phase (submissions open).
    // Only reject if the game phase has also closed.
    if (isSubmissionsClosed(targetRound, timing)) {
      return {
        ok: false,
        error: `Submissions for round ${targetRound} are closed. The teacher is reviewing.`,
      };
    }
    // If isSubmissionsClosed returns false, either we're still in the game
    // phase OR there are no split fields (legacy mode). In legacy mode,
    // locked = no more submissions — preserve existing behavior.
    if (timing.game_phase_hours == null) {
      return {
        ok: false,
        error: `Round ${targetRound} has already started — that slot is locked.`,
      };
    }
    // Otherwise: round is locked (started) but game phase is still open.
    // Fall through — submission is allowed.
  }

  // Already filled? Caller must remove first.
  const { data: existingInRound } = await admin
    .from("entries")
    .select("id")
    .eq("student_id", user.id)
    .eq("class_id", entryClassId)
    .eq("round_number", targetRound)
    .maybeSingle();
  if (existingInRound) {
    return {
      ok: false,
      error: `You already have a photo in round ${targetRound}. Remove it first to upload a new one.`,
    };
  }

  // ── Upload to PRIVATE media bucket ───────────────────────────────────
  const ext =
    entryPhoto.name.includes(".") ? entryPhoto.name.split(".").pop() : "jpg";
  const entryPath = `${entryClassId}/${user.id}-${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from("media")
    .upload(entryPath, entryPhoto, {
      contentType: entryPhoto.type || "image/jpeg",
      upsert: true,
    });
  if (upErr) {
    return {
      ok: false,
      error: `Your photo didn't upload. Please try again. (${upErr.message})`,
    };
  }

  // B16 FIX (#44): Explicitly set status='pending' — never rely on the DB
  // default. Entries MUST go through the teacher approval queue regardless
  // of round number. Also set description_l1 (NOT NULL column).
  const { error: entryErr } = await admin.from("entries").insert({
    student_id: user.id,
    class_id: entryClassId,
    media_url: entryPath,
    media_type: "photo",
    description_text: entryDescription,
    description_l1: entryDescription,  // #44: was missing, column is NOT NULL
    status: "pending",                 // #44 B16: explicit, not DB default
    round_number: targetRound,
  });
  if (entryErr) {
    return {
      ok: false,
      error: `We couldn't save your photo. Please try again. (${entryErr.message})`,
    };
  }

  revalidatePath("/student/dashboard");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// removeEntry — NEW in #27.  Deletes an entry the student owns, but only
// if the entry's round has not yet started (i.e., the slot is unlocked).
// Used by the slot grid's ✕ button to clear an unlocked slot before
// re-uploading.
//
// Form fields: entry_id (the id of the row to remove).
//
// Storage cleanup: best-effort.  We try to remove the underlying media
// file from the 'media' bucket, but a storage failure does NOT block the
// row deletion — an orphaned file is harmless (private bucket, never
// served).  The row deletion is the source of truth.
//
// Authorization: we verify entry.student_id === user.id ourselves rather
// than relying on RLS, because addEntry/saveFirstEntry also use the service-
// role admin client which bypasses RLS.  Pattern stays consistent.
// ─────────────────────────────────────────────────────────────────────────
export async function removeEntry(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return {
      ok: false,
      error: "The server isn't configured. Please tell your teacher.",
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      ok: false,
      error: "We couldn't reach the server. Please try again in a moment.",
    };
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Your sign-in expired. Please use the magic link again.",
    };
  }

  const entryId = String(formData.get("entry_id") || "").trim();
  if (!entryId) {
    return { ok: false, error: "Missing entry id." };
  }

  const admin = createServiceClient(supabaseUrl, serviceKey);

  // ── Load entry; verify ownership ─────────────────────────────────────
  const { data: entry, error: entryFetchErr } = await admin
    .from("entries")
    .select("id, student_id, class_id, round_number, media_url")
    .eq("id", entryId)
    .maybeSingle();
  if (entryFetchErr) {
    return { ok: false, error: `Could not load entry: ${entryFetchErr.message}` };
  }
  if (!entry) {
    return { ok: false, error: "That photo no longer exists." };
  }
  if (entry.student_id !== user.id) {
    return { ok: false, error: "You can't remove a photo that isn't yours." };
  }

  // ── Lock check (D2: phase-aware) ──────────────────────────────────────
  const { data: classRow } = await admin
    .from("classes")
    .select("total_rounds, game_starts_at, round_duration_hours, game_phase_hours, review_phase_hours")
    .eq("id", entry.class_id)
    .maybeSingle();
  const timing: ClassTiming = {
    total_rounds: classRow?.total_rounds ?? null,
    game_starts_at: classRow?.game_starts_at ?? null,
    round_duration_hours: classRow?.round_duration_hours ?? null,
    game_phase_hours: classRow?.game_phase_hours ?? null,
    review_phase_hours: classRow?.review_phase_hours ?? null,
  };
  if (isRoundLocked(entry.round_number, timing)) {
    return {
      ok: false,
      error: `Round ${entry.round_number} has already started — this photo is locked in.`,
    };
  }

  // ── Storage delete (soft) ────────────────────────────────────────────
  if (entry.media_url) {
    const { error: storageErr } = await admin.storage
      .from("media")
      .remove([entry.media_url]);
    if (storageErr) {
      console.error("Storage delete failed (continuing):", storageErr.message);
    }
  }

  // ── Row delete (hard) ────────────────────────────────────────────────
  const { error: delErr } = await admin
    .from("entries")
    .delete()
    .eq("id", entry.id);
  if (delErr) {
    return { ok: false, error: `Could not remove the photo. (${delErr.message})` };
  }

  revalidatePath("/student/dashboard");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// saveStudentRound — NEW in #39.  Saves a student's comments + favorite
// at the end of an in-class round played via /student/play.
//
// This is the student counterpart of enrollStudent (which handles the
// warm-up round during enrollment). The key difference: enrollStudent
// always writes round=0 (warm-up) and triggers enrollment + magic link,
// while saveStudentRound resolves the CURRENT round from class timing and
// writes (or updates) the game_session for that round. No enrollment
// or magic link — the student is already logged in.
//
// Round-0 convention:
//   round 0 = warm-up (enrollStudent)
//   round 1 = Student Round 1 (saveStudentRound, computeCurrentRound=1)
//   round 2 = Student Round 2, etc.
//
// Form fields (set by spotlight.jsx in student mode):
//   comments  — JSON string: { "<entryId>": "comment text", … }
//   favorites — JSON string: { "<entryId>": true }
// ─────────────────────────────────────────────────────────────────────────
export async function saveStudentRound(formData: FormData): Promise<ActionResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return {
      ok: false,
      error: "The server isn't configured. Please tell your teacher.",
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      ok: false,
      error: "We couldn't reach the server. Please try again in a moment.",
    };
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return {
      ok: false,
      error: "Your sign-in expired. Please use the magic link again.",
    };
  }

  // ── Parse form data ──────────────────────────────────────────────────
  const commentsRaw = String(formData.get("comments") || "{}");
  const favoritesRaw = String(formData.get("favorites") || "{}");

  let comments: Record<string, string> = {};
  let favorites: Record<string, boolean> = {};
  try {
    comments = JSON.parse(commentsRaw);
    favorites = JSON.parse(favoritesRaw);
  } catch {}

  const admin = createServiceClient(supabaseUrl, serviceKey);

  // ── Resolve student + class ──────────────────────────────────────────
  const { data: student } = await admin
    .from("students")
    .select("id")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  if (!student) {
    return {
      ok: false,
      error: "We couldn't find your enrollment. Try the play page and re-join.",
    };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("class_id")
    .eq("id", user.id)
    .maybeSingle();
  const classId = profile?.class_id ?? null;
  if (!classId) {
    return {
      ok: false,
      error: "We couldn't find your class. Please tell your teacher.",
    };
  }

  // ── Resolve current round (D2: includes phase columns) ───────────────
  const { data: classRow } = await admin
    .from("classes")
    .select("total_rounds, game_starts_at, round_duration_hours, game_phase_hours, review_phase_hours")
    .eq("id", classId)
    .maybeSingle();
  const timing: ClassTiming = {
    total_rounds: classRow?.total_rounds ?? null,
    game_starts_at: classRow?.game_starts_at ?? null,
    round_duration_hours: classRow?.round_duration_hours ?? null,
    game_phase_hours: classRow?.game_phase_hours ?? null,
    review_phase_hours: classRow?.review_phase_hours ?? null,
  };

  if (isGameOver(timing)) {
    return { ok: false, error: "The game has ended." };
  }

  const currentRound = computeCurrentRound(timing);
  if (currentRound < 1) {
    return {
      ok: false,
      error: "The game hasn't started yet. Your teacher will let you know when it begins.",
    };
  }

  // D2: Reject if the game phase has closed for this round. The student
  // can no longer submit comments/favorites once submissions are closed.
  if (isSubmissionsClosed(currentRound, timing)) {
    return {
      ok: false,
      error: "Submissions for this round are closed. Your teacher is reviewing.",
    };
  }

  // ── B39: don't let the student save if their entry is pending ──────
  // Belt-and-suspenders with the loadClassDeck gate. Even if the UI
  // somehow lets them through, the server rejects the save.
  {
    const { data: ownEntry } = await admin
      .from("entries")
      .select("status")
      .eq("student_id", user.id)
      .eq("class_id", classId)
      .eq("round_number", currentRound)
      .eq("is_starter", false)
      .maybeSingle();
    if (ownEntry?.status === "pending") {
      return {
        ok: false,
        error: "Your photo for this round is still awaiting teacher approval. You can play once it's approved.",
      };
    }
  }

  // ── B56: Extract the favorite's comment for moderation ────────────────
  // The teacher needs to review the student's comment on their chosen
  // favorite before it becomes visible to classmates. Mirror the warm-up
  // path: populate favorite_comment + set status to 'pending'.
  const favEntryId = Object.keys(favorites).find((k) => favorites[k]);
  const favoriteComment = favEntryId ? (comments[favEntryId] || "").trim() : "";

  // ── Check for existing session in this round ─────────────────────────
  const { data: existingSession } = await admin
    .from("game_sessions")
    .select("id")
    .eq("student_id", student.id)
    .eq("class_id", classId)
    .eq("round", currentRound)
    .maybeSingle();

  if (existingSession) {
    // Update existing — student replayed the round and re-submitted.
    const { error: updateErr } = await admin
      .from("game_sessions")
      .update({
        comments,
        favorites,
        completed_at: new Date().toISOString(),
        // B56: favorite comment moderation for student rounds
        favorite_comment: favoriteComment || null,
        favorite_comment_status: favoriteComment ? "pending" : null,
        favorite_comment_reviewed_by: null,
        favorite_comment_reviewed_at: null,
        favorite_comment_rejection_reason: null,
      })
      .eq("id", existingSession.id);
    if (updateErr) {
      console.error("game_session update failed:", updateErr.message);
      return { ok: false, error: "We couldn't save your comments. Please try again." };
    }
  } else {
    // Insert new session for this round.
    const { error: insertErr } = await admin
      .from("game_sessions")
      .insert({
        student_id: student.id,
        class_id: classId,
        round: currentRound,
        comments,
        favorites,
        completed_at: new Date().toISOString(),
        // B56: favorite comment moderation for student rounds
        favorite_comment: favoriteComment || null,
        favorite_comment_status: favoriteComment ? "pending" : null,
      });
    if (insertErr) {
      console.error("game_session insert failed:", insertErr.message);
      return { ok: false, error: "We couldn't save your comments. Please try again." };
    }
  }

  revalidatePath("/student/dashboard");
  revalidatePath("/student/play");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// resubmitEntry — NEW B23 (#47).  Replaces a rejected entry with a new
// photo and/or description, resetting its status to 'pending' so it
// reappears in the teacher's pending queue.
//
// Only works on entries with status='rejected'. The student writes a
// new description (required) and optionally uploads a new photo. If no
// new photo is attached, the existing media_url is kept — this lets
// students fix just their description without re-uploading. When a new
// photo IS provided, the old media file is deleted from storage (soft
// fail) and replaced. The entry row is UPDATED in place (same id, same
// round_number) — not deleted + re-inserted — so the teacher_comments
// history for this entry_id is preserved.
//
// Form fields:
//   entry_id          — the rejected entry to resubmit
//   entry_photo       — replacement photo (File, OPTIONAL — omit to keep existing)
//   entry_description — the replacement description (string, required)
//
// Authorization: entry.student_id === user.id (same as addEntry).
// ─────────────────────────────────────────────────────────────────────────
export async function resubmitEntry(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return {
      ok: false,
      error: "The server isn't configured. Please tell your teacher.",
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      ok: false,
      error: "We couldn't reach the server. Please try again in a moment.",
    };
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return {
      ok: false,
      error: "Your sign-in expired. Please use the magic link again.",
    };
  }

  const entryId = String(formData.get("entry_id") || "").trim();
  const entryPhoto = formData.get("entry_photo");
  const entryDescription = String(formData.get("entry_description") || "").trim();

  if (!entryId) {
    return { ok: false, error: "Missing entry id." };
  }
  const hasNewPhoto = entryPhoto instanceof File && entryPhoto.size > 0;
  if (!entryDescription) {
    return { ok: false, error: "Please write a short description." };
  }

  const admin = createServiceClient(supabaseUrl, serviceKey);

  // ── Verify entry exists, is rejected, belongs to this user ──────────
  const { data: entry } = await admin
    .from("entries")
    .select("id, student_id, class_id, media_url, round_number, status")
    .eq("id", entryId)
    .maybeSingle();

  if (!entry) {
    return { ok: false, error: "Entry not found." };
  }
  if (entry.student_id !== user.id) {
    return { ok: false, error: "You can only resubmit your own entries." };
  }
  if (entry.status !== "rejected") {
    return { ok: false, error: "This entry hasn't been rejected — no resubmission needed." };
  }

  // ── If new photo provided: delete old media, upload replacement ──────
  let newMediaUrl: string | null = null;
  if (hasNewPhoto) {
    // Delete old media from storage (soft fail)
    if (entry.media_url) {
      const { error: delErr } = await admin.storage
        .from("media")
        .remove([entry.media_url]);
      if (delErr) {
        console.error("[resubmitEntry] old media delete failed (continuing):", delErr.message);
      }
    }

    const ext =
      entryPhoto.name.includes(".") ? entryPhoto.name.split(".").pop() : "jpg";
    const entryPath = `${entry.class_id}/${user.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await admin.storage
      .from("media")
      .upload(entryPath, entryPhoto, {
        contentType: entryPhoto.type || "image/jpeg",
        upsert: true,
      });
    if (upErr) {
      return {
        ok: false,
        error: `Your photo didn't upload. Please try again. (${upErr.message})`,
      };
    }
    newMediaUrl = entryPath;
  }

  // ── Update entry: description (always) + photo (if new) → pending ──
  const updatePayload: Record<string, unknown> = {
    description_text: entryDescription,
    description_l1: entryDescription,
    status: "pending",
    rejection_reason: null,
    reviewed_by: null,
    reviewed_at: null,
    uploaded_at: new Date().toISOString(),
  };
  if (newMediaUrl) {
    updatePayload.media_url = newMediaUrl;
  }

  const { error: updErr } = await admin
    .from("entries")
    .update(updatePayload)
    .eq("id", entryId);

  if (updErr) {
    return {
      ok: false,
      error: `We couldn't save your changes. Please try again. (${updErr.message})`,
    };
  }

  revalidatePath("/student/dashboard");
  revalidatePath("/teacher/students");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// resubmitFavoriteComment — NEW B23 (#47).  Lets a student edit and
// resubmit a rejected favorite comment.
//
// Finds the game_session for the given round in the student's current
// class, verifies favorite_comment_status='rejected', updates the
// favorite_comment text, and resets the status to 'pending'.
//
// Form fields:
//   favorite_comment — the new text (string, required, min 15 chars)
//   round            — the round number (string, defaults to "0" for
//                      warm-up backward compat)
//
// B73 (session 73): previously hardcoded round=0. Now reads a round
// field from formData so student-round favorite comments can also be
// resubmitted. The ResubmitFavoriteCommentForm passes the round prop.
// ─────────────────────────────────────────────────────────────────────────
export async function resubmitFavoriteComment(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return {
      ok: false,
      error: "The server isn't configured. Please tell your teacher.",
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      ok: false,
      error: "We couldn't reach the server. Please try again in a moment.",
    };
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return {
      ok: false,
      error: "Your sign-in expired. Please use the magic link again.",
    };
  }

  const why = String(formData.get("favorite_comment") || "").trim();
  if (!why || why.length < 15) {
    return {
      ok: false,
      error: "Please write at least 15 characters about why this was your favorite.",
    };
  }

  // B73: read round from form (defaults to 0 for warm-up backward compat).
  const round = parseInt(String(formData.get("round") || "0"), 10);

  const admin = createServiceClient(supabaseUrl, serviceKey);

  // ── Resolve student + class ─────────────────────────────────────────
  const { data: student } = await admin
    .from("students")
    .select("id")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  if (!student) {
    return {
      ok: false,
      error: "We couldn't find your enrollment. Try the play page and re-join.",
    };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("class_id")
    .eq("id", user.id)
    .maybeSingle();
  const classId = profile?.class_id ?? null;
  if (!classId) {
    return {
      ok: false,
      error: "We couldn't find your class. Please tell your teacher.",
    };
  }

  // ── Find the session for the specified round ────────────────────────
  // B73: was hardcoded to round=0. Now uses the form's round value.
  const { data: session } = await admin
    .from("game_sessions")
    .select("id, favorite_comment_status")
    .eq("student_id", student.id)
    .eq("class_id", classId)
    .eq("round", round)
    .maybeSingle();

  if (!session) {
    return { ok: false, error: round === 0 ? "We couldn't find your warm-up session." : `We couldn't find your session for round ${round}.` };
  }
  if (session.favorite_comment_status !== "rejected") {
    return {
      ok: false,
      error: "Your favorite comment hasn't been rejected — no resubmission needed.",
    };
  }

  // ── Update: new text, reset to pending ──────────────────────────────
  const { error: updErr } = await admin
    .from("game_sessions")
    .update({
      favorite_comment: why,
      favorite_comment_status: "pending",
      favorite_comment_rejection_reason: null,
      favorite_comment_reviewed_by: null,
      favorite_comment_reviewed_at: null,
    })
    .eq("id", session.id);

  if (updErr) {
    return {
      ok: false,
      error: `We couldn't save your changes. Please try again. (${updErr.message})`,
    };
  }

  revalidatePath("/student/dashboard");
  revalidatePath("/teacher/students");
  return { ok: true };
}
