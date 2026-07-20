-- ─────────────────────────────────────────────────────────────────────────
-- DESTINATION: sql/20260719000000_multi_teacher_games.sql
--
-- Session 98: Multi-teacher game tables.
--
-- multi_teacher_games — a game that multiple teachers participate in
-- multi_teacher_participants — which teachers have joined each game
-- multi_teacher_photos — photos uploaded by teachers for a specific game
--
-- Safe to re-run: uses IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────

-- ── Games ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS multi_teacher_games (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic                 text NOT NULL,
  total_rounds          integer NOT NULL DEFAULT 3,
  round_duration_hours  numeric,
  game_phase_hours      numeric,
  review_phase_hours    numeric,
  created_by            uuid NOT NULL REFERENCES profiles(id),
  status                text NOT NULL DEFAULT 'forming'
                        CHECK (status IN ('forming', 'ready', 'active', 'complete')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ── Participants ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS multi_teacher_participants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     uuid NOT NULL REFERENCES multi_teacher_games(id) ON DELETE CASCADE,
  teacher_id  uuid NOT NULL REFERENCES profiles(id),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, teacher_id)
);

-- ── Photos ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS multi_teacher_photos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id           uuid NOT NULL REFERENCES multi_teacher_games(id) ON DELETE CASCADE,
  teacher_id        uuid NOT NULL REFERENCES profiles(id),
  media_url         text NOT NULL,
  description_text  text,
  round_number      integer NOT NULL DEFAULT 1,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mtg_status ON multi_teacher_games(status);
CREATE INDEX IF NOT EXISTS idx_mtg_created_by ON multi_teacher_games(created_by);
CREATE INDEX IF NOT EXISTS idx_mtp_game ON multi_teacher_participants(game_id);
CREATE INDEX IF NOT EXISTS idx_mtp_teacher ON multi_teacher_participants(teacher_id);
CREATE INDEX IF NOT EXISTS idx_mtph_game ON multi_teacher_photos(game_id);
CREATE INDEX IF NOT EXISTS idx_mtph_teacher ON multi_teacher_photos(teacher_id);

-- ── RLS (basic — admin and participants can see their games) ─────────────
ALTER TABLE multi_teacher_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_teacher_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_teacher_photos ENABLE ROW LEVEL SECURITY;

-- Teachers can see all forming/ready games (to browse and join)
-- and games they participate in regardless of status
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mtg_select_policy'
  ) THEN
    CREATE POLICY mtg_select_policy ON multi_teacher_games
      FOR SELECT USING (
        status IN ('forming', 'ready')
        OR created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM multi_teacher_participants
          WHERE game_id = multi_teacher_games.id
          AND teacher_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Teachers can create games
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mtg_insert_policy'
  ) THEN
    CREATE POLICY mtg_insert_policy ON multi_teacher_games
      FOR INSERT WITH CHECK (created_by = auth.uid());
  END IF;
END $$;

-- Creator can update their game
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mtg_update_policy'
  ) THEN
    CREATE POLICY mtg_update_policy ON multi_teacher_games
      FOR UPDATE USING (created_by = auth.uid());
  END IF;
END $$;

-- Participants: teachers can join games and see participants
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mtp_select_policy'
  ) THEN
    CREATE POLICY mtp_select_policy ON multi_teacher_participants
      FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mtp_insert_policy'
  ) THEN
    CREATE POLICY mtp_insert_policy ON multi_teacher_participants
      FOR INSERT WITH CHECK (teacher_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mtp_delete_policy'
  ) THEN
    CREATE POLICY mtp_delete_policy ON multi_teacher_participants
      FOR DELETE USING (teacher_id = auth.uid());
  END IF;
END $$;

-- Photos: teachers manage their own photos
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mtph_select_policy'
  ) THEN
    CREATE POLICY mtph_select_policy ON multi_teacher_photos
      FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mtph_insert_policy'
  ) THEN
    CREATE POLICY mtph_insert_policy ON multi_teacher_photos
      FOR INSERT WITH CHECK (teacher_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mtph_delete_policy'
  ) THEN
    CREATE POLICY mtph_delete_policy ON multi_teacher_photos
      FOR DELETE USING (teacher_id = auth.uid());
  END IF;
END $$;
