// ─────────────────────────────────────────────────────────────────────────
// DESTINATION: src/lib/round-timing.ts   (NEW FILE)
//
// Single home for class-timing math. Extracted from three sites that had
// drifted on naming (handoff #30 Priority 4 carry-over):
//
//   src/lib/student-archive.ts        — used `TimingShape` + `computeIsGameOver`
//   src/app/student/results/page.tsx  — used `TimingShape` + `computeIsGameOver`
//   src/app/play/actions.ts           — used `ClassTiming` + `isGameOver` (+ `isRoundLocked`)
//
// Standardized on the play/actions.ts names because `ClassTiming` is more
// descriptive than `TimingShape`, and `isGameOver` matches the shape of
// `isRoundLocked` already in use. The play file also had a third helper
// (`isRoundLocked`) that the other two didn't — lifted here because the
// teacher UI (next slice) will need it to render per-round lock states.
//
// MATH (unchanged from the originals — bit-identical):
//   - currentRound = 0  if pre-game (no timing, or now < game_starts_at)
//   - currentRound = N  if now is inside round N's window
//                       (start + (N-1)*hours ≤ now < start + N*hours)
//   - currentRound = total_rounds + 1  if the game is over (capped)
//   - isGameOver   = currentRound > total_rounds (false if total_rounds is null)
//   - isRoundLocked(N) = N ≤ currentRound
//
// NOTE on round_duration_hours values:
//   Migration #26 added a CHECK constraint `round_duration_hours IN (1, 24, 168)`.
//   The teacher UI work in this slice will introduce fractional values
//   (0.25, 0.5, 2, 5) per Mike's preferred pulldown options. The CHECK
//   constraint will need to be relaxed or dropped in that migration.
//   The math in this file already handles fractional hours correctly —
//   no change needed here when the constraint moves.
// ─────────────────────────────────────────────────────────────────────────

export type ClassTiming = {
  total_rounds: number | null;
  game_starts_at: string | null;       // ISO timestamp
  round_duration_hours: number | null;
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
