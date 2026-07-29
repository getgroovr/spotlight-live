-- ─────────────────────────────────────────────────────────────────────────
-- DESTINATION: supabase/migrations/20260720000000_multi_game_rounds.sql
--
-- Session 99: Per-round structure for multi-teacher games.
--
-- multi_game_rounds — one row per round per game. Stores per-round topic,
-- status, and timing. Created automatically when a game is created.
--
-- Safe to re-run: uses IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS multi_game_rounds (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       uuid NOT NULL REFERENCES multi_teacher_games(id) ON DELETE CASCADE,
  round_number  integer NOT NULL,
  topic         text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'upcoming'
                CHECK (status IN ('upcoming', 'active', 'closed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, round_number)
);

-- ── Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mgr_game ON multi_game_rounds(game_id);
CREATE INDEX IF NOT EXISTS idx_mgr_status ON multi_game_rounds(status);

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE multi_game_rounds ENABLE ROW LEVEL SECURITY;

-- All teachers can see rounds for games they can see
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mgr_select_policy'
  ) THEN
    CREATE POLICY mgr_select_policy ON multi_game_rounds
      FOR SELECT USING (true);
  END IF;
END $$;

-- Game creator can insert rounds (auto-created on game creation)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mgr_insert_policy'
  ) THEN
    CREATE POLICY mgr_insert_policy ON multi_game_rounds
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM multi_teacher_games
          WHERE id = multi_game_rounds.game_id
          AND created_by = auth.uid()
        )
      );
  END IF;
END $$;

-- Game creator can update rounds (edit topics)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mgr_update_policy'
  ) THEN
    CREATE POLICY mgr_update_policy ON multi_game_rounds
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM multi_teacher_games
          WHERE id = multi_game_rounds.game_id
          AND created_by = auth.uid()
        )
      );
  END IF;
END $$;

-- ── Backfill: create round rows for any existing games that lack them ────
INSERT INTO multi_game_rounds (game_id, round_number, topic)
SELECT g.id, r.n, g.topic
FROM multi_teacher_games g
CROSS JOIN generate_series(1, g.total_rounds) AS r(n)
WHERE NOT EXISTS (
  SELECT 1 FROM multi_game_rounds mgr
  WHERE mgr.game_id = g.id AND mgr.round_number = r.n
);
