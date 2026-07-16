-- ═══════════════════════════════════════════════════════════════
-- B59: Add UNIQUE constraint to game_sessions
-- Destination: supabase/migrations/20260625140000_b59_game_sessions_unique.sql
--
-- Problem: Without uniqueness on (student_id, class_id, round),
-- duplicate sessions inflate vote counts (28 voters instead of 9).
-- The ON CONFLICT DO NOTHING in jump-to / fast-path scripts
-- silently fails without this constraint.
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Remove any existing duplicates (keep the one with lowest id)
DELETE FROM game_sessions a
USING game_sessions b
WHERE a.student_id = b.student_id
  AND a.class_id   = b.class_id
  AND a.round      = b.round
  AND a.id > b.id;

-- Step 2: Add the constraint (safe to re-run — DO NOTHING if exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_sessions_student_class_round_unique'
  ) THEN
    ALTER TABLE game_sessions
    ADD CONSTRAINT game_sessions_student_class_round_unique
    UNIQUE (student_id, class_id, round);
  END IF;
END $$;
