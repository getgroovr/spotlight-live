-- ─────────────────────────────────────────────────────────────────────────
-- Phase 3.5 — Avatar Assignment migration
-- DESTINATION: supabase/migrations/20260724120000_monster_avatars.sql
--
-- Session 102: Three additions:
--   1. monster_avatars — persistent identity for the 9 monsters (seeded)
--   2. avatar_mode column on multi_teacher_games ('single' | 'rotating')
--   3. multi_game_avatar_assignments — which teacher got which monster
-- ─────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. monster_avatars — one row per monster, seeded below
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS monster_avatars (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  monster_index integer     NOT NULL UNIQUE CHECK (monster_index BETWEEN 0 AND 8),
  name          text        NOT NULL,
  body_color    text        NOT NULL,
  accent_color  text        NOT NULL,
  belly_color   text        NOT NULL,
  horn_color    text        NOT NULL,
  personality   text        NOT NULL DEFAULT '',
  teaching_style text,       -- nullable, future enrichment
  learning_style text,       -- nullable, future enrichment
  games_played  integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Seed all 9 monsters. Colors match MONSTERS array in monsters.jsx exactly.
INSERT INTO monster_avatars (monster_index, name, body_color, accent_color, belly_color, horn_color, personality)
VALUES
  (0, 'Gorp',   '#6BBF59', '#4A9A3A', '#8DD67A', '#D98A2B',
   'Laid-back and goofy. Gorp trips over things a lot but always lands smiling. Thinks every photo tells a story worth hearing.'),
  (1, 'Pip',    '#9B6EC5', '#7A4FA8', '#B98EDB', '#E8C547',
   'Quietly observant with one big eye that misses nothing. Pip notices the little details everyone else scrolls past.'),
  (2, 'Fizz',   '#E8843A', '#C66A25', '#F0A868', '#C04040',
   'Energetic and fuzzy. Fizz vibrates with excitement about literally everything and has strong opinions about breakfast.'),
  (3, 'Bloop',  '#4AADCF', '#2E8AAF', '#7CC8E0', '#D98A2B',
   'Enthusiastic and loud. Bloop''s mouth is always open because there''s always something to say. Biggest cheerleader in any room.'),
  (4, 'Sprout', '#E06888', '#C04A6A', '#EE96B0', '#9B6EC5',
   'Warm and encouraging. Sprout waves at everyone and blushes easily. Leaves little notes of encouragement wherever they go.'),
  (5, 'Zap',    '#E0C840', '#B8A020', '#ECE080', '#E8843A',
   'Electric and impulsive. Zap has ideas at the speed of lightning and sometimes forgets to explain them before moving on.'),
  (6, 'Nubs',   '#3DC5B8', '#2A9A8F', '#6FD9CF', '#E06888',
   'Chill and wide-set. Nubs has three bumps, big cheeks, and zero stress. The kind of friend who always has snacks.'),
  (7, 'Dottie', '#E87E6E', '#C45E50', '#F2A89E', '#4AADCF',
   'Sparkly and polka-dotted. Dottie accessorizes everything and believes presentation is half the fun. Floppy ears, big heart.'),
  (8, 'Munch',  '#7EC88A', '#5AA868', '#A8DDB2', '#9B6EC5',
   'Always hungry, always happy. Munch chews on ideas the way they chew on everything else — thoroughly and with enthusiasm.')
ON CONFLICT (monster_index) DO NOTHING;

-- RLS: monster_avatars is public read, no user writes
ALTER TABLE monster_avatars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read monsters"
  ON monster_avatars FOR SELECT
  USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. avatar_mode column on multi_teacher_games
-- ═══════════════════════════════════════════════════════════════════════════
-- 'single' = same monster all rounds (second spin confirms it)
-- 'rotating' = different monster each round (used monsters greyed out)
-- Default 'single' — only the game creator sees/sets this value.
ALTER TABLE multi_teacher_games
  ADD COLUMN IF NOT EXISTS avatar_mode text NOT NULL DEFAULT 'single'
  CHECK (avatar_mode IN ('single', 'rotating'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. multi_game_avatar_assignments — teacher ↔ monster per round
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS multi_game_avatar_assignments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id      uuid        NOT NULL REFERENCES multi_teacher_games(id) ON DELETE CASCADE,
  teacher_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  round_number integer     NOT NULL,
  monster_id   uuid        NOT NULL REFERENCES monster_avatars(id) ON DELETE CASCADE,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, teacher_id, round_number)
);

-- Index for quick lookups: "what avatar does this teacher have for this game?"
CREATE INDEX IF NOT EXISTS idx_avatar_assignments_game_teacher
  ON multi_game_avatar_assignments (game_id, teacher_id);

-- RLS: teachers can read their own assignments + assignments in games they participate in
ALTER TABLE multi_game_avatar_assignments ENABLE ROW LEVEL SECURITY;

-- Teachers can read assignments for games they're in
CREATE POLICY "Teachers read own game assignments"
  ON multi_game_avatar_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM multi_teacher_participants
      WHERE multi_teacher_participants.game_id = multi_game_avatar_assignments.game_id
        AND multi_teacher_participants.teacher_id = auth.uid()
    )
  );

-- Teachers can insert their own assignments (the server action enforces
-- the business rules — mode, greying out, etc.)
CREATE POLICY "Teachers insert own assignments"
  ON multi_game_avatar_assignments FOR INSERT
  WITH CHECK (teacher_id = auth.uid());
