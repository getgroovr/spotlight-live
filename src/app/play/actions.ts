// ─────────────────────────────────────────────────────────────────────────
// src/app/play/actions.ts — Server Actions for the /play surface and profile
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
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export type EnrollResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

// Generic shape for server actions whose success-side payload is just
// "the page revalidated, look there." Used by saveProfile + addEntry.
export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

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
  // favorites is { "<entryId>": true }. The favorited entry's class_id is the
  // cohort the visitor joins. (Single-favorite flow; if multiple, take the
  // first truthy one.)
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
  // favorite_comment (the "why") is added later, from the profile.
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
    // Non-fatal — enrollment succeeded; student can request another link later.
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
//   • entries row           (REQUIRED first game entry — hard fail)
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
//     student's ACTIVE class.
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
  // Only attempt an upload when a real file came through. An unselected file
  // input still yields a File here, but with size 0 — skip those. Upload
  // errors are logged and swallowed: the profile still saves, just without
  // photo_url. A future edit-profile feature can let the student retry.
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
  // status='pending'. IMPORTANT: entries lives on the PROFILES track, not the
  // students track — entries.student_id is a FK to profiles(id) (= the auth
  // user id), and the class lives on profiles.class_id. (This is distinct from
  // students.id / enrollments, which the rest of saveProfile uses — that seam
  // is why the earlier students.id version threw a FK violation.)
  if (!(entryPhoto instanceof File) || entryPhoto.size === 0) {
    return { ok: false, error: "Please add your first photo." };
  }

  // Class for the entry: prefer profiles.class_id (profiles track); fall back
  // to the student's active enrollment only if the profile's is somehow unset.
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
// addEntry — used as a <form action> on the dashboard (COMPLETE state, in
// the "Your photo → Add another photo" section), wrapped by AddEntryForm.tsx
// via useFormState.
//
// Adds ANOTHER own photo to the student's current class. saveProfile handled
// the first one (at finish-joining time, alongside name + screen_name + the
// why-note); this is the same write minus the profile fields. Identical
// constraints:
//   • Logged-in session required (reads user via SSR cookie client).
//   • Current class resolves from profiles.class_id (the profiles track —
//     matches the rest of saveProfile's entry block).
//   • Uploads to PRIVATE `media` bucket via the service-role admin client
//     (bypasses storage RLS — no policies needed).
//   • Writes entries.media_url as the storage PATH (not a URL); read layer
//     signs it at display time (deck.ts convention).
//   • student_id is set to user.id (= profiles.id), NOT students.id. See
//     student-archive.ts header for the TWO-TRACK STUDENT IDS explanation.
//   • status defaults to 'pending'; teacher approves later.
//
// All paths are HARD fails since this action has no soft-optional fields —
// every step matters. On success, revalidatePath('/student/dashboard')
// refreshes the dashboard so the new entry (now the most-recent own) shows
// in the "Your photo" section.
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

  // Form already enforces these; defense in depth.
  if (!(entryPhoto instanceof File) || entryPhoto.size === 0) {
    return { ok: false, error: "Please choose a photo." };
  }
  if (!entryDescription) {
    return { ok: false, error: "Please write a short description." };
  }

  const admin = createServiceClient(supabaseUrl, serviceKey);

  // Resolve current class via profiles.class_id (profiles track — same
  // source saveProfile uses for the entry's class_id).
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

  // Upload to PRIVATE `media` bucket. Path layout matches saveProfile:
  // <classId>/<userId>-<timestamp>.<ext>
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
    // status defaults to 'pending'; is_starter to false; uploaded_at to now()
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
