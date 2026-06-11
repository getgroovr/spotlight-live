// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/actions.ts   (REPLACES existing)
//
// Slice 1 teacher UI, step 3: saveClassSettings.
//
// Single action backing the class-management header on the students page.
// One Save button → one round trip → one UPDATE on classes. Handles all
// four configurable fields together (name, total_rounds,
// round_duration_hours, game_starts_at).
//
// AUTH PATTERN (matches the rest of the teacher area)
//   - SSR cookie client to resolve auth.uid()
//   - Verify role = 'teacher' on profiles
//   - Verify ownership: UPDATE is scoped by id AND teacher_id, so a teacher
//     can't edit another teacher's class even by crafting the request.
//   - RLS is the second line; the explicit teacher_id filter is the first.
//
// VALIDATION
//   - name:                  required, 1–100 chars after trim
//   - total_rounds:          required, integer 1–100 (matches CHECK on classes)
//   - round_duration_hours:  required, must be in the allowed set below —
//                            MUST match the CHECK constraint on classes.
//   - game_starts_at:        OPTIONAL. Empty/missing → set NULL.
//
// PAST-START WARNING: a start time in the past is ALLOWED but returns a
// warning string the header surfaces above the form. ok stays true.
//
// IMPORTANT — keep ALLOWED_DURATION_HOURS in lockstep with TWO things:
//   1. The CHECK constraint on classes.round_duration_hours
//   2. DURATION_OPTIONS in src/app/teacher/students/class-header.tsx
// If one moves, all three must.
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import type { ActionResult } from "@/app/play/actions";

// Allowed round_duration_hours values. Must match the DB CHECK and the
// dropdown options in class-header.tsx exactly.
const ALLOWED_DURATION_HOURS = [0.25, 0.5, 1, 2, 5, 24, 48, 168] as const;

// Matches the existing CHECK on classes.total_rounds (1..100).
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 100;

// Trim bounds for the class name. Hard upper prevents abuse; lower
// enforces "non-empty after trim."
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

  // ── Auth ────────────────────────────────────────────────────────────
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

  // ── Extract + validate inputs ───────────────────────────────────────
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

  // game_starts_at: optional. Empty string / missing → store NULL.
  // If provided, must parse to a valid Date (datetime-local emits
  // "YYYY-MM-DDTHH:MM" which `new Date(...)` accepts).
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

  // ── Ownership check + UPDATE in one go ───────────────────────────────
  // Filtering by teacher_id makes this idempotent on ownership: if the
  // teacher doesn't own this class, the UPDATE affects 0 rows and we
  // surface a clean "not found / not yours" error.
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

  // Refresh so the header re-reads the new values.
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
