// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/app/teacher/students/actions.ts   (NEW FILE)
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
//   - round_duration_hours:  required, must be in (0.25, 0.5, 1, 2, 5, 24)
//                            — matches the migration #30 CHECK constraint
//   - game_starts_at:        OPTIONAL. Empty/missing → set NULL (teacher hasn't
//                            picked a start time yet). If provided, must parse
//                            as a valid Date.
//
// PAST-START WARNING (Mike's call):
//   A start time in the past is ALLOWED — backdated configuration is sometimes
//   legitimate ("the game already started, let me record it now"). But it's
//   often a typo, so we save successfully AND return a warning string. The
//   header surfaces the warning above the form so the teacher can confirm or
//   correct. Save state is still ok: true.
//
// RESULT SHAPE
//   Action-local SaveClassSettingsResult = ActionResult | {ok:true, warning}.
//   Keeps the shared ActionResult untouched (only this action needs the
//   warning channel; spreading it across every consumer isn't worth it).
// ─────────────────────────────────────────────────────────────────────────
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import type { ActionResult } from "@/app/play/actions";

// Same six values as the CHECK constraint added in the step-2 migration.
// Keep this array and the SQL in lockstep — if one moves, both must.
const ALLOWED_DURATION_HOURS = [0.25, 0.5, 1, 2, 5, 24] as const;

// Matches the existing CHECK on classes.total_rounds (1..100).
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 100;

// Trim bounds for the class name. Hard upper bound prevents abuse; the lower
// bound just enforces "non-empty after trim."
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
        "Round duration must be one of: 15 min, 30 min, 1 hour, 2 hours, 5 hours, 1 day.",
    };
  }

  // game_starts_at: optional. Empty string / missing → store NULL.
  // If provided, must parse to a valid Date (HTML datetime-local inputs
  // emit "YYYY-MM-DDTHH:MM" which `new Date(...)` accepts).
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
  // teacher doesn't own this class, the UPDATE simply affects 0 rows and
  // we surface a clean "not found / not yours" error.
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

  // Refresh the students page so the header re-reads the new values.
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
