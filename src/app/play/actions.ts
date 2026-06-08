// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/play/actions.ts   (REPLACES existing file)
//
// Server Actions for the /play surface and profile.
//
// Slice 1 (cohorts foundation):
//   - enrollStudent derives the class from the FAVORITED ENTRY (not a
//     hardcoded NEXT_PUBLIC_DEMO_CLASS_ID). The deck mixes starters across
//     public classes; whichever pic the visitor favorited determines which
//     cohort they join. The favorite's entry id is the key in the `favorites`
//     map ({ "<entryId>": true }); we look up that entry's class_id and
//     enroll there.
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
//     an enrollment, a round-1 game_session (nine comments + the favorite),
//     then sends a magic link. Name/screen name/the "why" come later.
//   - saveProfile   : profile-page form once logged in. Saves real name +
//     screen name, an optional self-photo, and the "why was this your
//     favorite?" note.
//
// Slice 1 engine-adaptation (#25):
//   - addEntry     : dashboard form for adding ANOTHER photo after the
//     first one (which saveProfile captures at finish-joining time). Same
//     write path as saveProfile's entry block — uploads to PRIVATE `media`
//     bucket, inserts `entries` row at status='pending' on the profiles
//     track (entries.student_id = profiles.id = auth user.id). No limit
//     on how many pending an account can have; teacher moderates.
//
// Error surfacing (#26):
//   - saveProfile AND addEntry now return ActionResult (previously
//     Promise<void> with console.error + silent no-op). The dashboard
//     wraps each form in a client component (FinishJoiningForm /
//     AddEntryForm) that calls useFormState against the action and
//     renders an error banner above the submit on failure.
//   - The OPTIONAL self-photo upload inside saveProfile stays a SOFT fail
//     (logs and continues without photo_url) — the rest of the profile
//     still saves; the self-photo can be retried via a future edit-profile
//     feature. The REQUIRED entry upload/insert paths are HARD fails: if
//     any step fails, the action returns ok:false with a specific error
//     so the student knows their photo didn't land and can retry.
//   - Signatures take a leading prevState arg (ignored) per the
//     useFormState contract: (prevState, formData) => Promise<NewState>.
//
// Slice 1 round assignment (#27):
//   - entries.round_number is now NOT NULL. Every insert must set it.
//   - saveProfile's first-entry insert is always round_number = 1.
//     Finish-joining is by definition pre-game (the student JUST joined),
//     so their first photo is round 1.
//   - addEntry resolves a target round number:
//       * If the form passes a round_number (the slot-grid UI in pass 2),
//         that value is validated and used.
//       * Otherwise (today's "Add another photo" form, which has no slot
//         picker yet), addEntry finds the lowest unlocked + unfilled slot.
//     Rejects if the target round is locked, already filled by this
//     student, out of range (> total_rounds), or if the game is over.
//   - NEW removeEntry action: deletes an entry the student owns, but only
//     if the entry's round is not yet locked. Used by the pass-2 slot grid
//     for the remove-and-re-upload flow on unlocked slots.
//
// Lock semantics (#27 — Mike's call):
//   Round N is LOCKED the moment round N STARTS, i.e.,
//     now >= game_starts_at + (N - 1) * round_duration_hours.
//   Equivalently, N is locked iff N <= currentRound. Pre-game (no timing
//   set, or now < game_starts_at), no round is locked; the student can
//   stage their entire queue ahead of time. When the game starts, slot 1
//   locks. When round 2 starts, slot 2 locks. And so on. After the last
//   round starts, every slot is locked — the game is effectively over.
//
// Round-timing helpers (#30 follow-up): extracted to src/lib/round-timing.ts
// and now imported alongside the rest of the module's dependencies.
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  type ClassTiming,
  isRoundLocked,
  isGameOver,
} from "@/lib/round-timing";

export type EnrollResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

// Generic shape for server actions whose success-side payload is just
// "the page revalidated, look there." Used by saveProfile, addEntry,
// and (new #27) removeEntry.
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
    if (isRoundLocked(r, timing, now)) continue;
    return r;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// enrollStudent — UNCHANGED from #26.  No round_number involvement: it
// writes to enrollments + game_sessions, neither of which has a round_number
// column on the entries side.  (game_sessions.round exists but is unrelated
// to entries.round_number — that's the session sequence number, not the
// round-assignment slot.)
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

  // ── Resolve the class FROM THE FAVORITE ───────────────────────────────
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
  const classId = favEntry.class_id;

  // ── Existing student? (reuse row; name fills in later on the profile) ──
  const { data: existing } = await admin
    .from("students")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  let studentId: string;
  if (existing) {
    studentId = existing.id;
  } else {
    const { data: newStudent, error: stuErr } = await admin
      .from("students")
      .insert({ email })
      .select("id")
      .single();
    if (stuErr || !newStudent) {
      return { ok: false, error: `Could not create student record: ${stuErr?.message}` };
    }
    studentId = newStudent.id;
  }

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

  // ── Upsert enrollment (status defaults to 'active') ───────────────────
  const { error: enrollErr } = await admin
    .from("enrollments")
    .upsert(
      { student_id: studentId, class_id: classId, round: 1, status: "active" },
      { onConflict: "student_id,class_id" }
    );
  if (enrollErr) {
    return { ok: false, error: `Enrollment failed: ${enrollErr.message}` };
  }

  // ── Save the round-1 game session (the nine comments + the favorite) ──
  const { error: sessionErr } = await admin
    .from("game_sessions")
    .insert({
      student_id: studentId,
      class_id: classId,
      round: 1,
      comments,
      favorites,
    });
  if (sessionErr) {
    console.error("game_session insert failed:", sessionErr.message);
  }

  // ── Send magic link via signInWithOtp ─────────────────────────────────
  const anon = createServiceClient(supabaseUrl, anonKey);
  const { error: otpErr } = await anon.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
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
// saveProfile — used as a <form action> on the dashboard (INCOMPLETE state),
// wrapped by FinishJoiningForm.tsx via useFormState.
//
// Reads the logged-in user from the session cookie, then saves:
//   • students.name        (real name — private, for the teacher)
//   • students.screen_name (public — classmates see this in later rounds)
//   • students.photo_url   (OPTIONAL self-photo — soft fail if upload fails)
//   • game_sessions.favorite_comment on their most recent round (the "why")
//   • entries row           (REQUIRED first game entry — hard fail, round 1)
//
// TWO DISTINCT PHOTOS — do not conflate:
//   • Self-photo (form field "photo"): a picture OF the student. OPTIONAL.
//     Uploaded to the PUBLIC 'profile-photos' bucket; we store the public URL
//     in students.photo_url (directly usable in <img src>). If none provided,
//     we leave any existing photo_url untouched.
//   • First game entry (fields "entry_photo" + "entry_description"): the
//     student's OWN contribution that classmates see and comment on. REQUIRED.
//     Uploaded to the PRIVATE 'media' bucket. Per src/lib/deck.ts convention,
//     entries.media_url stores the storage PATH (not a URL) — the read layer
//     builds a (signed, for the private bucket) URL at display time. We write
//     an entries row at status='pending' (the default), attached to the
//     student's ACTIVE class.  ALWAYS round_number = 1 (#27): finish-joining
//     is by definition pre-game.
//
// All uploads use the service-role `admin` client, which bypasses storage
// RLS — so NO storage policy is needed for either bucket here.
// ─────────────────────────────────────────────────────────────────────────
export async function saveProfile(
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
  const why = String(formData.get("favorite_comment") || "").trim();
  const photo = formData.get("photo");
  const entryPhoto = formData.get("entry_photo");
  const entryDescription = String(formData.get("entry_description") || "").trim();

  // Defensive — the form already enforces these.
  if (!name || !screenName || why.length < 15) {
    return {
      ok: false,
      error:
        "Please fill in your name, screen name, and a why-note of at least 15 characters.",
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

  // ── Self-photo (optional — SOFT fail) ─────────────────────────────────
  let photoUrl: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    const ext =
      photo.name.includes(".") ? photo.name.split(".").pop() : "jpg";
    const path = `${student.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await admin.storage
      .from("profile-photos")
      .upload(path, photo, {
        contentType: photo.type || "image/jpeg",
        upsert: true,
      });
    if (upErr) {
      console.error("Profile photo upload failed:", upErr.message);
    } else {
      const { data: pub } = admin.storage
        .from("profile-photos")
        .getPublicUrl(path);
      photoUrl = pub.publicUrl;
    }
  }

  const update: { name: string; screen_name: string; photo_url?: string } = {
    name,
    screen_name: screenName,
  };
  if (photoUrl) update.photo_url = photoUrl;

  await admin
    .from("students")
    .update(update)
    .eq("id", student.id);

  // ── First game entry (REQUIRED — HARD fail) ───────────────────────────
  // The student's own photo + description, written as an `entries` row at
  // status='pending'.  entries lives on the PROFILES track (student_id FKs
  // to profiles, not students), and the class lives on profiles.class_id.
  if (!(entryPhoto instanceof File) || entryPhoto.size === 0) {
    return { ok: false, error: "Please add your first photo." };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("class_id")
    .eq("id", user.id)
    .maybeSingle();
  let entryClassId: string | null = profile?.class_id ?? null;
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

  const { error: entryErr } = await admin.from("entries").insert({
    student_id: user.id,       // profiles(id) — NOT students.id
    class_id: entryClassId,
    media_url: entryPath,
    media_type: "photo",
    description_text: entryDescription,
    round_number: 1,            // #27: finish-joining is always pre-game
    // status defaults to 'pending'; is_starter to false; uploaded_at to now()
  });
  if (entryErr) {
    return {
      ok: false,
      error: `We couldn't save your photo. Please try again. (${entryErr.message})`,
    };
  }

  // ── Attach the why-note to their most recent session (soft) ───────────
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
      .update({ favorite_comment: why })
      .eq("id", session.id);
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

  // ── Read class timing (#27) ──────────────────────────────────────────
  const { data: classRow } = await admin
    .from("classes")
    .select("total_rounds, game_starts_at, round_duration_hours")
    .eq("id", entryClassId)
    .maybeSingle();
  const timing: ClassTiming = {
    total_rounds: classRow?.total_rounds ?? null,
    game_starts_at: classRow?.game_starts_at ?? null,
    round_duration_hours: classRow?.round_duration_hours ?? null,
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
    return {
      ok: false,
      error: `Round ${targetRound} has already started — that slot is locked.`,
    };
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

  const { error: entryErr } = await admin.from("entries").insert({
    student_id: user.id,
    class_id: entryClassId,
    media_url: entryPath,
    media_type: "photo",
    description_text: entryDescription,
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
// than relying on RLS, because addEntry/saveProfile also use the service-
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

  // ── Lock check ───────────────────────────────────────────────────────
  const { data: classRow } = await admin
    .from("classes")
    .select("total_rounds, game_starts_at, round_duration_hours")
    .eq("id", entry.class_id)
    .maybeSingle();
  const timing: ClassTiming = {
    total_rounds: classRow?.total_rounds ?? null,
    game_starts_at: classRow?.game_starts_at ?? null,
    round_duration_hours: classRow?.round_duration_hours ?? null,
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
