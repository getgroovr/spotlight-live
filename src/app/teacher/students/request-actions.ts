// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/request-actions.ts   (REPLACES)
//
// Session 81 — Chunk 1.5: Server actions for class request flow.
// Session 82 — Chunk C: requestNewClass accepts requested_capacity.
//
//   1. requestNewClass     — teacher requests a new class (with name + size)
//   2. saveModePreferences — teacher updates trio/nine willingness
//
// AUTH PATTERN: SSR cookie client for auth.uid(), verify teacher role,
// service client for mutations (bypasses RLS).
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

type Result = { ok: true } | { ok: false; error: string };

// ── Shared: get authenticated teacher + admin client ──────────────────────

async function getTeacher(): Promise<
  | { ok: false; error: string }
  | { ok: true; userId: string; admin: ReturnType<typeof createServiceClient> }
> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Server isn't configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign-in expired." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "teacher") {
    return { ok: false, error: "Only teachers can do this." };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: "Server config error." };
  }

  return {
    ok: true,
    userId: user.id,
    admin: createServiceClient(supabaseUrl, serviceKey),
  };
}

// ── requestNewClass ───────────────────────────────────────────────────────
//
// Inserts a row into class_requests with the teacher's chosen class name
// and requested capacity (9, 16, or 25).
// Checks for an existing pending request first — one at a time.

export async function requestNewClass(
  className: string,
  requestedCapacity: number = 9,
): Promise<Result> {
  const name = className.trim();
  if (!name) return { ok: false, error: "Enter a class name." };
  if (name.length > 100) return { ok: false, error: "Class name must be 100 characters or fewer." };

  if (![9, 16, 25].includes(requestedCapacity)) {
    return { ok: false, error: "Class size must be 9, 16, or 25." };
  }

  const auth = await getTeacher();
  if (!auth.ok) return auth;

  // Check for existing pending request
  const { data: existing } = await auth.admin
    .from("class_requests")
    .select("id")
    .eq("teacher_id", auth.userId)
    .eq("status", "pending")
    .limit(1);

  if (existing && existing.length > 0) {
    return { ok: false, error: "You already have a pending class request." };
  }

  const { error: insErr } = await auth.admin
    .from("class_requests")
    .insert({
      teacher_id: auth.userId,
      status: "pending",
      class_name: name,
      requested_capacity: requestedCapacity,
      requested_at: new Date().toISOString(),
    });

  if (insErr) {
    return { ok: false, error: `Could not submit request: ${insErr.message}` };
  }

  revalidatePath("/teacher/students");
  revalidatePath("/admin");
  return { ok: true };
}

// ── saveModePreferences ───────────────────────────────────────────────────
//
// Upserts willing_trio / willing_nine on the teacher_rotation row.
// teacher_rotation.teacher_id is UNIQUE, so we upsert on conflict.

export async function saveModePreferences(
  willingTrio: boolean,
  willingNine: boolean,
): Promise<Result> {
  const auth = await getTeacher();
  if (!auth.ok) return auth;

  const { error: upsErr } = await auth.admin
    .from("teacher_rotation")
    .upsert(
      {
        teacher_id: auth.userId,
        willing_trio: willingTrio,
        willing_nine: willingNine,
      },
      { onConflict: "teacher_id" },
    );

  if (upsErr) {
    return { ok: false, error: `Could not save preferences: ${upsErr.message}` };
  }

  revalidatePath("/teacher/students");
  return { ok: true };
}
