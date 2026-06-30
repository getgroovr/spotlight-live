-- ═══════════════════════════════════════════════════════════════
-- Migration: Add games table + game_id FK on entries/game_sessions
-- Slice 2 step 1 — the multi-teacher foundation.
--
-- A "game" is one instance of the Spotlight photo game, owned by
-- a teacher, tied to a class. Today: one game per class.
-- Tomorrow: a teacher runs multiple games across classes.
--
-- game_id is NULLABLE on entries/game_sessions so the migration
-- doesn't break existing data. Seed SQL v4+ always sets it.
-- A future migration makes it NOT NULL after backfill.
--
-- Save to: supabase/migrations/20260625120000_add_games_table.sql
-- ═══════════════════════════════════════════════════════════════

-- ── 1. games table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.games (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id      uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  name          text NOT NULL DEFAULT 'Game 1',
  status        text NOT NULL DEFAULT 'setup'
                CHECK (status IN ('setup', 'active', 'complete', 'archived')),
  round_count   int NOT NULL DEFAULT 3,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One non-archived game per class at a time.
CREATE UNIQUE INDEX IF NOT EXISTS games_one_active_per_class
  ON public.games (class_id) WHERE status != 'archived';

CREATE INDEX IF NOT EXISTS games_teacher_idx ON public.games (teacher_id);

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.games IS
  'One Spotlight game instance per class. Owned by a teacher. Organizes entries + sessions under a game_id for multi-teacher / multi-game support.';

-- ── 2. games RLS ────────────────────────────────────────────────
-- Everyone signed in can read games (students need to resolve their game).
DROP POLICY IF EXISTS "games: read for authenticated" ON public.games;
CREATE POLICY "games: read for authenticated"
  ON public.games FOR SELECT TO authenticated USING (true);

-- Teachers insert their own games.
DROP POLICY IF EXISTS "games: teacher insert own" ON public.games;
CREATE POLICY "games: teacher insert own"
  ON public.games FOR INSERT TO authenticated
  WITH CHECK (teacher_id = auth.uid());

-- Teachers update/delete their own games.
DROP POLICY IF EXISTS "games: teacher update own" ON public.games;
CREATE POLICY "games: teacher update own"
  ON public.games FOR UPDATE TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "games: teacher delete own" ON public.games;
CREATE POLICY "games: teacher delete own"
  ON public.games FOR DELETE TO authenticated
  USING (teacher_id = auth.uid());

-- ── 3. Add game_id FK to entries ────────────────────────────────
ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id);

CREATE INDEX IF NOT EXISTS entries_game_idx
  ON public.entries (game_id);

-- ── 4. Add game_id FK to game_sessions ──────────────────────────
ALTER TABLE public.game_sessions
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id);

CREATE INDEX IF NOT EXISTS game_sessions_game_idx
  ON public.game_sessions (game_id);

-- ── 5. Helper: resolve the active game for a class ──────────────
CREATE OR REPLACE FUNCTION public.active_game_id(p_class_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.games
  WHERE class_id = p_class_id AND status != 'archived'
  ORDER BY created_at DESC LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.active_game_id(uuid) TO authenticated;

COMMENT ON FUNCTION public.active_game_id(uuid) IS
  'Returns the active (non-archived) game_id for a class. Used by data-layer queries to scope entries and sessions.';

-- ── VERIFICATION ────────────────────────────────────────────────
-- Run after applying:
--
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema = 'public' AND table_name = 'games';
-- -- expect: 1 row
--
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'entries' AND column_name = 'game_id';
-- -- expect: 1 row
--
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'game_sessions' AND column_name = 'game_id';
-- -- expect: 1 row
--
-- SELECT public.active_game_id('00000000-0000-0000-0000-000000000000'::uuid);
-- -- expect: NULL (no game for that class)
