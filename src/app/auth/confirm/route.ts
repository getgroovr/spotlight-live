// ─────────────────────────────────────────────────────────────────────────
// src/app/auth/confirm/route.ts — magic-link landing endpoint.
//
// The enrollment email points HERE (not straight at the dashboard).
// Supabase puts a one-time token_hash in the link; we exchange it for a
// real auth session cookie via verifyOtp, THEN redirect to the dashboard.
//
// Why this exists: the old link dropped the token into the URL #hash
// fragment, which a server component can never read — so the dashboard
// always thought nobody was logged in. token_hash arrives as a normal
// query param the server CAN read, which fixes that.
//
// Slice 1 (cohorts foundation) — CLOSE THE profiles.class_id GAP:
//   handle_new_user creates the profile row but never sets class_id, and
//   enrollStudent can't (no auth user exists at enroll time). So
//   profiles.class_id was NULL for everyone, leaving my_class_id() NULL and
//   the student "current class" write/scope path dormant. This was masked by
//   the single-class setup. Here — the one moment the profile is guaranteed
//   to exist (right after verifyOtp) — we copy the student's most-recent
//   enrollment class onto profiles.class_id. my_class_id() now returns the
//   correct current cohort. (History reads use is_enrolled_in, not this.)
// ─────────────────────────────────────────────────────────────────────────
import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Sets profiles.class_id to the student's most-recent enrollment class.
// Best-effort: failures are logged, never fatal — a missing current-class
// only affects write/scope paths, not the magic-link sign-in itself.
async function syncCurrentClass(userId: string, email: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;
  const admin = createServiceClient(supabaseUrl, serviceKey);

  // student row -> their most recent enrollment -> that class is "current".
  const { data: student } = await admin
    .from("students")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (!student) return;

  const { data: enrollment } = await admin
    .from("enrollments")
    .select("class_id, enrolled_at")
    .eq("student_id", student.id)
    .order("enrolled_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!enrollment?.class_id) return;

  const { error } = await admin
    .from("profiles")
    .update({ class_id: enrollment.class_id })
    .eq("id", userId);
  if (error) {
    console.error("[auth/confirm] profiles.class_id sync failed:", error.message);
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/student/dashboard";

  if (token_hash && type) {
    const supabase = await createClient();
    if (supabase) {
      // verifyOtp returns the verified user directly. Use that rather than a
      // follow-up getUser() — within this same request the freshly-set session
      // cookie isn't reliably re-readable yet, so getUser() can return null and
      // the class sync would silently skip. The verifyOtp response always has it.
      const { data, error } = await supabase.auth.verifyOtp({ type, token_hash });
      if (!error) {
        const user = data.user;
        if (user?.email) {
          await syncCurrentClass(user.id, user.email);
        }
        // Session cookie is now set — go to the dashboard.
        redirect(next);
      }
    }
  }

  // Missing/expired token, or verification failed — back to /play.
  redirect("/play");
}
