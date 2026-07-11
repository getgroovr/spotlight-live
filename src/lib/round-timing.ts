// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/lib/round-timing.ts   (REPLACES existing file)
//
// Single home for class-timing math.
//
// Session 84: Chunk D1 — Added computeCurrentPhase() for game/review
//   phase detection. ClassTiming extended with optional game_phase_hours
//   and review_phase_hours. Existing math unchanged — round_duration_hours
//   remains the total (game + review), so computeCurrentRound and
//   isGameOver are backward-compatible.
//
// Session 84: Chunk D2 — Added per-round phase helpers for student-side
//   enforcement: isSubmissionsClosed, getGamePhaseDeadline, getRoundStart,
//   isInReviewPhase, getRoundPhase. All use round_duration_hours for round
//   boundaries (consistent with the original design) and game_phase_hours
//   for the phase cutoff within a round.
// ─────────────────────────────────────────────────────────────────────────

export type ClassTiming = {
  total_rounds: number | null;
  game_starts_at: string | null;       // ISO timestamp
  round_duration_hours: number | null;
  game_phase_hours?: number | null;    // D1: how long submissions are open
  review_phase_hours?: number | null;  // D1: how long teacher reviews
};

// "Current round" — the round in flight RIGHT NOW.
//   - 0 if pre-game (no timing configured, or now < game_starts_at).
//   - N if now is inside round N's window
//     (game_starts_at + (N-1)*hours  ≤  now  <  game_starts_at + N*hours).
//   - total_rounds + 1 if the game is over (capped, so callers don't see
//     unbounded values).
export function computeCurrentRound(
  timing: ClassTiming,
  now: Date = new Date(),
): number {
  const { game_starts_at, round_duration_hours, total_rounds } = timing;
  if (!game_starts_at || !round_duration_hours) return 0;
  const start = new Date(game_starts_at);
  if (now < start) return 0;
  const elapsedMs = now.getTime() - start.getTime();
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  const computed = Math.floor(elapsedHours / round_duration_hours) + 1;
  if (total_rounds !== null && computed > total_rounds) return total_rounds + 1;
  return computed;
}

// A round is LOCKED once it has started. Round N is locked iff N ≤ currentRound.
export function isRoundLocked(
  roundNumber: number,
  timing: ClassTiming,
  now: Date = new Date(),
): boolean {
  return roundNumber <= computeCurrentRound(timing, now);
}

export function isGameOver(
  timing: ClassTiming,
  now: Date = new Date(),
): boolean {
  if (timing.total_rounds === null) return false;
  return computeCurrentRound(timing, now) > timing.total_rounds;
}

// ─────────────────────────────────────────────────────────────────────────
// D1: Phase detection within the current round.
//
// Each round is split into:
//   - Game phase:   round_start → round_start + game_phase_hours
//   - Review phase: round_start + game_phase_hours → round_start + total
//
// Returns "game" if submissions are still open for the current round,
// "review" if the game phase has ended and the teacher should be reviewing.
// Returns null if:
//   - No timing configured (pre-game or missing data)
//   - game_phase_hours is not set (old data without the D1 split)
//   - Game is over
// ─────────────────────────────────────────────────────────────────────────
export function computeCurrentPhase(
  timing: ClassTiming,
  now: Date = new Date(),
): "game" | "review" | null {
  const { game_starts_at, round_duration_hours, game_phase_hours } = timing;

  // Need all three values to compute phase
  if (!game_starts_at || !round_duration_hours || game_phase_hours == null) {
    return null;
  }

  const start = new Date(game_starts_at);
  if (now < start) return null; // Pre-game

  if (isGameOver(timing, now)) return null; // Past all rounds

  const currentRound = computeCurrentRound(timing, now);
  if (currentRound === 0) return null;

  // Compute how far into the current round we are
  const roundStartMs = start.getTime() + (currentRound - 1) * round_duration_hours * 3600000;
  const elapsedInRoundMs = now.getTime() - roundStartMs;
  const elapsedInRoundHours = elapsedInRoundMs / 3600000;

  if (elapsedInRoundHours < game_phase_hours) {
    return "game";
  }
  return "review";
}

// ─────────────────────────────────────────────────────────────────────────
// D2: Per-round phase helpers for student-side enforcement.
//
// These complement computeCurrentPhase (which works on the CURRENT round)
// by answering phase questions about a SPECIFIC round number. Used by
// server actions to enforce submission deadlines and by the awards gate.
// ─────────────────────────────────────────────────────────────────────────

const MS_PER_HOUR = 3_600_000;

// Start time of a specific round.
// Returns null if timing isn't configured.
export function getRoundStart(
  round: number,
  timing: ClassTiming,
): Date | null {
  if (!timing.game_starts_at || !timing.round_duration_hours) return null;
  const startMs =
    new Date(timing.game_starts_at).getTime() +
    (round - 1) * timing.round_duration_hours * MS_PER_HOUR;
  return new Date(startMs);
}

// The moment when submissions close for a specific round.
// = roundStart + game_phase_hours.
// Returns null if game_phase_hours isn't configured (legacy mode).
export function getGamePhaseDeadline(
  round: number,
  timing: ClassTiming,
): Date | null {
  if (timing.game_phase_hours == null) return null;
  const start = getRoundStart(round, timing);
  if (!start) return null;
  return new Date(start.getTime() + timing.game_phase_hours * MS_PER_HOUR);
}

// True when the game phase for a specific round has ended (now >= deadline).
// In legacy mode (no game_phase_hours), returns false — submissions stay
// open for the whole round, preserving existing behavior.
export function isSubmissionsClosed(
  round: number,
  timing: ClassTiming,
  now: Date = new Date(),
): boolean {
  const deadline = getGamePhaseDeadline(round, timing);
  if (!deadline) return false;
  return now.getTime() >= deadline.getTime();
}

// True when now is in the review window for a specific round (between
// game phase deadline and round end).
export function isInReviewPhase(
  round: number,
  timing: ClassTiming,
  now: Date = new Date(),
): boolean {
  const gameDeadline = getGamePhaseDeadline(round, timing);
  if (!gameDeadline) return false;
  const start = getRoundStart(round, timing);
  if (!start || !timing.round_duration_hours) return false;
  const roundEndMs = start.getTime() + timing.round_duration_hours * MS_PER_HOUR;
  const t = now.getTime();
  return t >= gameDeadline.getTime() && t < roundEndMs;
}

// Phase label for a specific round. Useful for UI display.
export type RoundPhaseLabel = "future" | "game" | "review" | "complete";

export function getRoundPhase(
  round: number,
  timing: ClassTiming,
  now: Date = new Date(),
): RoundPhaseLabel {
  const start = getRoundStart(round, timing);
  if (!start || now.getTime() < start.getTime()) return "future";

  if (!timing.round_duration_hours) return "game";
  const roundEndMs = start.getTime() + timing.round_duration_hours * MS_PER_HOUR;

  // If game_phase_hours is configured, distinguish game vs review.
  if (timing.game_phase_hours != null) {
    const gameDeadlineMs = start.getTime() + timing.game_phase_hours * MS_PER_HOUR;
    if (now.getTime() < gameDeadlineMs) return "game";
    if (now.getTime() < roundEndMs) return "review";
    return "complete";
  }

  // Legacy mode: just started vs complete.
  return now.getTime() < roundEndMs ? "game" : "complete";
}
