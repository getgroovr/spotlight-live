-- Migration: Phase 4 — Student play tables
-- multi_game_students, multi_game_votes, multi_game_comments
-- 2026-07-25

-- ── multi_game_students ───────────────────────────────────────────────────
-- Students who joined a multi-teacher game event.
-- PK is (game_id, student_id) — one row per student per game.
CREATE TABLE IF NOT EXISTS multi_game_students (
  game_id    uuid NOT NULL REFERENCES multi_teacher_games(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  is_flagged boolean NOT NULL DEFAULT false,
  flagged_by uuid REFERENCES profiles(id),
  flagged_reason text,
  PRIMARY KEY (game_id, student_id)
);

ALTER TABLE multi_game_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on multi_game_students"
  ON multi_game_students FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── multi_game_votes ──────────────────────────────────────────────────────
-- Student ranked votes per round: 1st (3pts), 2nd (2pts), 3rd (1pt).
-- UNIQUE (round_id, student_id, rank) — one pick per rank per round.
CREATE TABLE IF NOT EXISTS multi_game_votes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    uuid NOT NULL REFERENCES multi_teacher_games(id) ON DELETE CASCADE,
  round_id   uuid NOT NULL REFERENCES multi_game_rounds(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  photo_id   uuid NOT NULL REFERENCES multi_teacher_photos(id) ON DELETE CASCADE,
  rank       integer NOT NULL CHECK (rank >= 1 AND rank <= 3),
  voted_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, student_id, rank)
);

-- Also prevent a student from voting for the same photo twice in one round
CREATE UNIQUE INDEX IF NOT EXISTS multi_game_votes_round_student_photo_unique
  ON multi_game_votes (round_id, student_id, photo_id);

ALTER TABLE multi_game_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on multi_game_votes"
  ON multi_game_votes FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── multi_game_comments ───────────────────────────────────────────────────
-- Comments on photos. Student comments are private to student + photo's teacher.
-- is_favorite_comment = true for comments left during the favorite pick phase.
-- is_approved: NULL = not reviewed, true = approved for reveal, false = rejected.
CREATE TABLE IF NOT EXISTS multi_game_comments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id            uuid NOT NULL REFERENCES multi_teacher_photos(id) ON DELETE CASCADE,
  author_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id           uuid REFERENCES multi_game_comments(id) ON DELETE CASCADE,
  body                text NOT NULL,
  author_role         text NOT NULL DEFAULT 'student' CHECK (author_role IN ('student', 'teacher', 'peer_teacher')),
  is_favorite_comment boolean NOT NULL DEFAULT false,
  is_approved         boolean,  -- NULL = not yet reviewed
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE multi_game_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on multi_game_comments"
  ON multi_game_comments FOR ALL
  USING (true)
  WITH CHECK (true);
