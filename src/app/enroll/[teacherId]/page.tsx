// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/enroll/[teacherId]/page.tsx   (NEW FILE)
//
// R2 — Teacher Storefront (public).
//
// A visitor can browse this page without logging in. It shows the teacher's
// name + avatar + bio, then a card per available (non-archived, not-full)
// class. Each card has an "Enroll" button that either:
//   • enrolls directly (if the visitor is already logged in), or
//   • prompts for an email, creates the enrollment, and sends a magic link.
//
// Data is fetched with the service-role client so enrollment counts are
// always available regardless of RLS policy on enrollments.
// ─────────────────────────────────────────────────────────────────────────
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { EnrollStorefront } from "./enroll-client";

export type StorefrontClass = {
  id: string;
  name: string;
  capacity: number;
  enrolled: number;
  game_starts_at: string | null;
  total_rounds: number | null;
  round_duration_hours: number | null;
  description: string | null;
  time_slot: string | null;
};

export type StorefrontTeacher = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

export default async function TeacherStorefrontPage({
  params,
}: {
  params: Promise<{ teacherId: string }>;
}) {
  const { teacherId } = await params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Server not configured.</p>
      </div>
    );
  }

  const admin = createServiceClient(supabaseUrl, serviceKey);

  // ── Teacher profile ──────────────────────────────────────────────────
  const { data: teacher } = await admin
    .from("profiles")
    .select("id, display_name, avatar_url, bio")
    .eq("id", teacherId)
    .eq("role", "teacher")
    .maybeSingle();

  if (!teacher) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Teacher not found.</p>
      </div>
    );
  }

  // ── Available classes ────────────────────────────────────────────────
  const { data: rawClasses } = await admin
    .from("classes")
    .select(
      "id, name, capacity, game_starts_at, total_rounds, round_duration_hours, description, time_slot"
    )
    .eq("teacher_id", teacherId)
    .eq("is_archived", false)
    .order("created_at", { ascending: true });

  // Enrollment counts — one query per class is fine (teachers have 1–5).
  const classes: StorefrontClass[] = [];
  for (const cls of rawClasses || []) {
    const { count } = await admin
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("class_id", cls.id)
      .eq("status", "active");
    classes.push({ ...cls, enrolled: count ?? 0 });
  }

  // ── Current visitor session (if any) ─────────────────────────────────
  let currentUserId: string | null = null;
  let currentEmail: string | null = null;
  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      currentUserId = user.id;
      currentEmail = user.email ?? null;
    }
  }

  return (
    <EnrollStorefront
      teacher={teacher as StorefrontTeacher}
      classes={classes}
      currentUserId={currentUserId}
      currentEmail={currentEmail}
    />
  );
}
