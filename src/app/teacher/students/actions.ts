// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/actions.ts   (REPLACES existing)
//
// Server actions for the teacher students page:
//
//   1. saveClassSettings — class management header (slice 1, step 3)
//   2. approveEntry      — approve a pending student submission
//   3. rejectEntry        — reject a pending submission with a reason
//
// AUTH PATTERN (all three):
//   - SSR cookie client to resolve auth.uid()
//   - Verify role = 'teacher' on profiles
//   - Verify ownership (class belongs to this teacher)
//
// approveEntry / rejectEntry work the same way:
//   - Verify the entry exists, is 'pending', and belongs to a class
//     this teacher owns.
//   - UPDATE entries: set status, reviewed_by, reviewed_at.
//   - rejectEntry also stores the rejection_reason text.
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { ActionResult } from "@/app/play/actions";

// ── saveClassSettings ─────────────────────────────────────────────────────

const ALLOWED_DURATION_HOURS = [0.25, 0.5, 1, 2, 5, 24, 48, 168] as const;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 100;
const NAME_MIN = 1;
const NAME_MAX = 100;

export type SaveClassSettingsResult =
  | ActionResult
  | { ok: true; warning: string };

export async function saveClassSettings(
  _prevState: SaveClassSettingsResult | null,
  formData: FormData,
): Promise<SaveClassSettingsResult> {
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
    return { ok: false, error: "Only teachers can change class settings." };
  }

  const classId = String(formData.get("class_id") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const totalRoundsRaw = String(formData.get("total_rounds") || "").trim();
  const durationRaw = String(formData.get("round_duration_hours") || "").trim();
  const startRaw = String(formData.get("game_starts_at") || "").trim();

  if (!classId) {
    return { ok: false, error: "Missing class id." };
  }

  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return {
      ok: false,
      error: `Class name must be ${NAME_MIN}–${NAME_MAX} characters.`,
    };
  }

  const totalRounds = parseInt(totalRoundsRaw, 10);
  if (
    !Number.isFinite(totalRounds) ||
    totalRounds < MIN_ROUNDS ||
    totalRounds > MAX_ROUNDS
  ) {
    return {
      ok: false,
      error: `Rounds must be a whole number between ${MIN_ROUNDS} and ${MAX_ROUNDS}.`,
    };
  }

  const durationHours = parseFloat(durationRaw);
  if (
    !Number.isFinite(durationHours) ||
    !(ALLOWED_DURATION_HOURS as readonly number[]).includes(durationHours)
  ) {
    return {
      ok: false,
      error:
        "Round duration must be one of: 15 min, 30 min, 1 hour, 2 hours, 5 hours, 1 day, 2 days, 1 week.",
    };
  }

  let gameStartsAtIso: string | null = null;
  let startInPast = false;
  if (startRaw.length > 0) {
    const parsed = new Date(startRaw);
    if (isNaN(parsed.getTime())) {
      return { ok: false, error: "Start time isn't a valid date." };
    }
    gameStartsAtIso = parsed.toISOString();
    startInPast = parsed.getTime() < Date.now();
  }

  const { data: updated, error: updErr } = await supabase
    .from("classes")
    .update({
      name,
      total_rounds: totalRounds,
      round_duration_hours: durationHours,
      game_starts_at: gameStartsAtIso,
    })
    .eq("id", classId)
    .eq("teacher_id", user.id)
    .select("id");

  if (updErr) {
    return { ok: false, error: `Could not save settings: ${updErr.message}` };
  }
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: "Class not found or you don't own it.",
    };
  }

  revalidatePath("/teacher/students");

  if (startInPast) {
    return {
      ok: true,
      warning:
        "Start time is in the past — the game is already underway. If that wasn't intentional, edit the start time and save again.",
    };
  }
  return { ok: true };
}

// ── Shared helper: verify teacher + get admin client ──────────────────────

async function getTeacherAdmin(): Promise<
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

// Verify the entry is pending and belongs to a class this teacher owns.
async function verifyEntryOwnership(
  admin: ReturnType<typeof createServiceClient>,
  entryId: string,
  teacherId: string,
): Promise<
  | { ok: false; error: string }
  | { ok: true; entryClassId: string }
> {
  const { data: entry } = await admin
    .from("entries")
    .select("id, class_id, status")
    .eq("id", entryId)
    .maybeSingle();

  if (!entry) return { ok: false, error: "Entry not found." };
  if (entry.status !== "pending") {
    return { ok: false, error: "This entry has already been reviewed." };
  }

  const { data: cls } = await admin
    .from("classes")
    .select("id")
    .eq("id", entry.class_id)
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (!cls) return { ok: false, error: "You don't own this class." };
  return { ok: true, entryClassId: entry.class_id };
}

// ── approveEntry ──────────────────────────────────────────────────────────

export async function approveEntry(entryId: string): Promise<ActionResult> {
  const auth = await getTeacherAdmin();
  if (!auth.ok) return auth;

  const ownership = await verifyEntryOwnership(auth.admin, entryId, auth.userId);
  if (!ownership.ok) return ownership;

  const { error: updErr } = await auth.admin
    .from("entries")
    .update({
      status: "live",
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", entryId);

  if (updErr) {
    return { ok: false, error: `Could not approve: ${updErr.message}` };
  }

  revalidatePath("/teacher/students");
  return { ok: true };
}

// ── rejectEntry ───────────────────────────────────────────────────────────

export async function rejectEntry(
  entryId: string,
  reason: string,
): Promise<ActionResult> {
  if (!reason || reason.trim().length === 0) {
    return { ok: false, error: "Please provide a reason for the rejection." };
  }

  const auth = await getTeacherAdmin();
  if (!auth.ok) return auth;

  const ownership = await verifyEntryOwnership(auth.admin, entryId, auth.userId);
  if (!ownership.ok) return ownership;

  const { error: updErr } = await auth.admin
    .from("entries")
    .update({
      status: "rejected",
      rejection_reason: reason.trim(),
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", entryId);

  if (updErr) {
    return { ok: false, error: `Could not reject: ${updErr.message}` };
  }

  revalidatePath("/teacher/students");
  return { ok: true };
}
