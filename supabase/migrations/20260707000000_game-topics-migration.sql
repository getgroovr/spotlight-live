-- ─────────────────────────────────────────────────────────────────────────
-- Game Topics — migration
-- Session 78: Topic field for games
--
-- 1. game_topics table: master list of topic presets (admin-seeded,
--    teacher-suggested). Teachers pick from approved topics or suggest
--    new ones that go to admin for approval.
--
-- 2. classes.round_topics: jsonb column storing per-round topic
--    assignments. Map keyed by round number string:
--      {"1": "Nature", "2": "Friendship", "3": null}
--    null or missing key = no topic for that round.
--
-- Service-role client bypasses RLS in the app code, so RLS policies
-- are belt-and-suspenders safety for direct DB access.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Master topic list
CREATE TABLE IF NOT EXISTS game_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_text text NOT NULL,
  status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved', 'pending')),
  suggested_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(topic_text)
);

-- 2. Per-round topic assignments on classes
ALTER TABLE classes ADD COLUMN IF NOT EXISTS round_topics jsonb;

-- 3. Seed starter topics
INSERT INTO game_topics (topic_text) VALUES
  ('Nature'),
  ('Friendship'),
  ('My Neighborhood'),
  ('Food & Cooking'),
  ('Something That Made Me Smile'),
  ('A Favorite Place'),
  ('Something Old'),
  ('Something New'),
  ('Colors'),
  ('Patterns'),
  ('Animals'),
  ('Weather'),
  ('Family'),
  ('Music'),
  ('Sports & Games'),
  ('Fashion & Style'),
  ('Art & Creativity'),
  ('Technology'),
  ('Seasons'),
  ('Water')
ON CONFLICT (topic_text) DO NOTHING;
