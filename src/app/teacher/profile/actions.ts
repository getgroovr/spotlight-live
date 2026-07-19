// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/profile/actions.ts   (NEW FILE)
//
// Session 95 — Server actions for teacher profile editing.
//
//   1. saveTeacherProfile — updates bio, teaching_style, is_public
//
// AUTH PATTERN: SSR cookie client for auth.uid(), verify teacher role,
// service client for mutations (bypasses RLS).
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

type Result = { ok: true } | { ok: false; error: string };

export async function saveTeacherProfile(
  _prevState: Result | null,
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, error: "Server isn't configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your sign-in expired. Please sign in again." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "teacher") {
    return { ok: false, error: "Only teachers can edit a teacher profile." };
  }

  // Read form values
  const bio = (formData.get("bio") as string)?.trim() || null;
  const teachingStyle =
    (formData.get("teaching_style") as string)?.trim() || null;
  const isPublic = formData.get("is_public") === "on";

  // Validate
  if (bio && bio.length > 2000) {
    return { ok: false, error: "Bio must be 2000 characters or fewer." };
  }
  if (teachingStyle && teachingStyle.length > 500) {
    return {
      ok: false,
      error: "Teaching style must be 500 characters or fewer.",
    };
  }

  // Save via service client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: "Server config error." };
  }
  const admin = createServiceClient(supabaseUrl, serviceKey);

  const { error } = await admin
    .from("profiles")
    .update({
      bio,
      teaching_style: teachingStyle,
      is_public: isPublic,
    })
    .eq("id", user.id);

  if (error) {
    return { ok: false, error: "Failed to save: " + error.message };
  }

  revalidatePath("/teacher/profile");
  revalidatePath(`/teachers/${user.id}`);
  revalidatePath("/play");

  return { ok: true };
}
