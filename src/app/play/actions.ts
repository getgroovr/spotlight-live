// ─────────────────────────────────────────────────────────────────────────
// src/app/play/actions.ts — Server Actions for the /play surface and profile
//
// Slice 1 (cohorts foundation):
//   - enrollStudent now derives the class from the FAVORITED ENTRY rather
//     than a hardcoded NEXT_PUBLIC_DEMO_CLASS_ID. The deck mixes starters
//     across public classes; whichever pic the visitor favorited determines
//     which cohort they join. The favorite's entry id is the key in the
//     `favorites` map ({ "<entryId>": true }); we look up that entry's
//     class_id and enroll there.
//
// Slice 1B (Profile v1):
//   - enrollStudent : called at end of game when a student chooses to join.
//                     Collects EMAIL ONLY. Creates (or reuses) a student row,
//                     an enrollment, and a round-1 game_session holding the
//                     nine comments + the chosen favorite, then sends a
//                     magic-link email. Name / screen name / the "why" note
//                     are gathered later, on the profile.
//   - saveProfile   : called from the profile page's form once the student is
//                     logged in. Saves real name + screen name onto the
//                     student row and the "why was this your favorite?" note
//                     onto their most recent game_session.
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
  // favorites is { "<entryId>": true }. The favorited entry's class_id is
  // the cohort the visitor joins. (Multiple keys shouldn't happen given the
  // single-favorite game flow, but if they do we take the first truthy one.)
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

  // ── Upsert enrollment ─────────────────────────────────────────────────
  const { error: enrollErr } = await admin
    .from("enrollments")
    .upsert(
      { student_id: studentId, class_id: classId, round: 1 },
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
  // Uses an anon-key client so signInWithOtp actually emails the user.
  // emailRedirectTo points at /auth/confirm, which exchanges the token_hash
  // for a session cookie and forwards to the profile.
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
//   • game_sessions.favorite_comment on their most recent round (the "why")
//
// The form enforces required + minLength in the browser; we re-check here so
// nothing thin slips through. On success we revalidate so the page re-renders
// in its completed state.
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

  // Defensive — the form already enforces these.
  if (!name || !screenName || why.length < 15) return;

  const admin = createServiceClient(supabaseUrl, serviceKey);

  const { data: student } = await admin
    .from("students")
    .select("id")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  if (!student) return;

  await admin
    .from("students")
    .update({ name, screen_name: screenName })
    .eq("id", student.id);

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
