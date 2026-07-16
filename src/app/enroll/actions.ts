// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/enroll/actions.ts   (NEW FILE)
//
// R2 — Teacher Storefront enrollment action.
//
// enrollInClass: creates an enrollment for a student in a specific class,
// chosen from the storefront class list. This is the "direct enrollment"
// path — the student picks a class explicitly, as opposed to the warmup
// flow in play/actions.ts where the class is derived from a favorited
// photo.
//
// Two modes:
//   1. Visitor is already logged in (session exists, email matches):
//      → enroll directly, no magic link needed, client redirects to
//        /student/dashboard.
//   2. Visitor is anonymous:
//      → create/find auth user, create enrollment, send magic link.
//        Visitor clicks the link → lands on /student/dashboard.
//
// Guards (same as play/actions.ts enrollStudent):
//   • One active class at a time
//   • Class capacity check
//   • Class must exist and not be archived
//
// Differences from enrollStudent:
//   • No warm-up game_session (no comments/favorites — student hasn't
//     played the warmup round)
//   • Class ID comes from form data directly (no favorite-entry lookup)
//   • Skips magic link when the visitor already has a valid session
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export type EnrollResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function enrollInClass(formData: FormData): Promise<EnrollResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return { ok: false, error: "Server is not configured." };
  }

  // ── Validate inputs ─────────────────────────────────────────────────
  const classId = String(formData.get("classId") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();

  if (!classId) {
    return { ok: false, error: "No class selected." };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  const admin = createServiceClient(supabaseUrl, serviceKey);

  // ── Verify the class ────────────────────────────────────────────────
  const { data: cls } = await admin
    .from("classes")
    .select("id, capacity, is_archived")
    .eq("id", classId)
    .maybeSingle();

  if (!cls) {
    return { ok: false, error: "This class doesn't exist." };
  }
  if (cls.is_archived) {
    return { ok: false, error: "This class is no longer available." };
  }

  // ── Check if visitor has an active session ──────────────────────────
  let authUserId: string | null = null;
  let needsMagicLink = true;

  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && user.email?.toLowerCase() === email) {
      authUserId = user.id;
      needsMagicLink = false;
    }
  }

  // ── Create or find auth user (anonymous visitors) ───────────────────
  if (!authUserId) {
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        email_confirm: false,
      });

    if (created?.user?.id) {
      authUserId = created.user.id;
    } else {
      // Returning visitor — look up via RPC (same as play/actions.ts)
      const { data: existingId, error: rpcErr } = await admin.rpc(
        "get_auth_user_id_by_email",
        { p_email: email }
      );
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
  }

  // ── Ensure students row exists ──────────────────────────────────────
  // Same reconciliation dance as play/actions.ts enrollStudent: if a
  // stale students row has a different id, migrate it in place.
  const { data: existingStudent } = await admin
    .from("students")
    .select("id, name, screen_name")
    .eq("email", email)
    .maybeSingle();

  if (existingStudent && existingStudent.id !== authUserId) {
    const oldId = existingStudent.id as string;
    await admin
      .from("students")
      .update({ email: `stale-${oldId}@removed.local` })
      .eq("id", oldId);
    await admin.from("students").insert({
      id: authUserId,
      email,
      name: (existingStudent.name as string | null) ?? null,
      screen_name: (existingStudent.screen_name as string | null) ?? null,
    });
    await admin
      .from("enrollments")
      .update({ student_id: authUserId })
      .eq("student_id", oldId);
    await admin
      .from("game_sessions")
      .update({ student_id: authUserId })
      .eq("student_id", oldId);
    await admin.from("students").delete().eq("id", oldId);
  } else if (!existingStudent) {
    const { error: stuErr } = await admin
      .from("students")
      .insert({ id: authUserId, email });
    if (stuErr) {
      return {
        ok: false,
        error: `Could not create student record: ${stuErr.message}`,
      };
    }
  }

  const studentId = authUserId;

  // ── GUARD: one ACTIVE class at a time ───────────────────────────────
  const { data: activeRows, error: activeErr } = await admin
    .from("enrollments")
    .select("class_id")
    .eq("student_id", studentId)
    .eq("status", "active");
  if (activeErr) {
    return {
      ok: false,
      error: `Could not check enrollment: ${activeErr.message}`,
    };
  }
  const activeOther = (activeRows || []).find((r) => r.class_id !== classId);
  if (activeOther) {
    return {
      ok: false,
      error:
        "You're already enrolled in a class. You can join a new one once your current class has finished.",
    };
  }

  // ── CLASS SIZE ENFORCEMENT ──────────────────────────────────────────
  const { count: classSize, error: countErr } = await admin
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("class_id", classId)
    .eq("status", "active")
    .neq("student_id", studentId);
  if (countErr) {
    return {
      ok: false,
      error: `Could not check class size: ${countErr.message}`,
    };
  }
  if ((classSize ?? 0) >= cls.capacity) {
    return {
      ok: false,
      error: "This class is full. Please choose a different class.",
    };
  }

  // ── Upsert enrollment ───────────────────────────────────────────────
  const { error: enrollErr } = await admin.from("enrollments").upsert(
    {
      student_id: studentId,
      class_id: classId,
      round: 0,
      status: "active",
    },
    { onConflict: "student_id,class_id" }
  );
  if (enrollErr) {
    return { ok: false, error: `Enrollment failed: ${enrollErr.message}` };
  }

  // ── Send magic link (anonymous visitors only) ───────────────────────
  if (needsMagicLink) {
    const anon = createServiceClient(supabaseUrl, anonKey);
    const { error: otpErr } = await anon.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/student/dashboard`,
      },
    });
    if (otpErr) {
      console.error("[enrollInClass] Magic link send failed:", otpErr.message);
    }
  }

  revalidatePath("/student/dashboard");
  revalidatePath(`/enroll`);
  return {
    ok: true,
    message: needsMagicLink
      ? "You're enrolled! Check your email for a sign-in link."
      : "You're enrolled! Redirecting to your dashboard…",
  };
}
