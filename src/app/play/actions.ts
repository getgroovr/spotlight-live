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
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export type EnrollResult =
  | { ok: true; message: string }
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
  // If the student already has an active enrollment in a DIFFERENT class,
  // refuse. They must finish (status='completed') their current class before
  // joining another. Re-joining the SAME class is allowed (handled by the
  // upsert below). This is the friendly first line; the DB partial unique
  // index (migration 20260601180000) is the hard backstop.
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
// saveProfile — used as a <form action> on the profile page.
//
// Reads the logged-in user from the session cookie, then saves:
//   • students.name        (real name — private, for the teacher)
//   • students.screen_name (public — classmates see this in later rounds)
//   • students.photo_url    (OPTIONAL self-photo — the profile face)
//   • game_sessions.favorite_comment on their most recent round (the "why")
//   • entries row            (REQUIRED first game entry — see note below)
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
export async function saveProfile(formData: FormData): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  const supabase = await createClient();
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return;

  const name = String(formData.get("name") || "").trim();
  const screenName = String(formData.get("screen_name") || "").trim();
  const why = String(formData.get("favorite_comment") || "").trim();
  const photo = formData.get("photo");
  const entryPhoto = formData.get("entry_photo");
  const entryDescription = String(formData.get("entry_description") || "").trim();

  // Defensive — the form already enforces these.
  if (!name || !screenName || why.length < 15) return;

  const admin = createServiceClient(supabaseUrl, serviceKey);

  const { data: student } = await admin
    .from("students")
    .select("id")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  if (!student) return;

  // ── Self-photo (optional) ─────────────────────────────────────────────
  // Only attempt an upload when a real file came through. An unselected file
  // input still yields a File here, but with size 0 — skip those.
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

  // ── First game entry (required) ───────────────────────────────────────
  // The student's own photo + description, written as an `entries` row at
  // status='pending'. IMPORTANT: entries lives on the PROFILES track, not the
  // students track — entries.student_id is a FK to profiles(id) (= the auth
  // user id), and the class lives on profiles.class_id. (This is distinct from
  // students.id / enrollments, which the rest of saveProfile uses — that seam
  // is why the earlier students.id version threw a FK violation.) Photo goes to
  // the PRIVATE 'media' bucket; we store the storage PATH in media_url
  // (deck.ts convention — the read layer signs it at display time). Only write
  // when a real file came through and a class resolves.
  if (entryPhoto instanceof File && entryPhoto.size > 0) {
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

    if (entryClassId) {
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
        console.error("Entry photo upload failed:", upErr.message);
      } else {
        const { error: entryErr } = await admin.from("entries").insert({
          student_id: user.id,       // profiles(id) — NOT students.id
          class_id: entryClassId,
          media_url: entryPath,
          media_type: "photo",
          description_text: entryDescription,
          // status defaults to 'pending'; is_starter to false; uploaded_at to now()
        });
        if (entryErr) {
          console.error("Entry insert failed:", entryErr.message);
        }
      }
    } else {
      console.error("No class resolved for student; skipped entry write.");
    }
  }

  // Attach the why-note to their most recent session.
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
}
