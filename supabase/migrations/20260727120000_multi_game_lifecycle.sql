-- ─────────────────────────────────────────────────────────────────────────
-- Migration: Multi-game lifecycle (Phase 7-8)
--
-- 1. participant_status on multi_teacher_participants (active/waiting)
-- 2. archive_after on multi_teacher_games (auto-archive deadline)
-- 3. replay_of on multi_teacher_games (link to parent game for replays)
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Waiting list support
ALTER TABLE multi_teacher_participants
  ADD COLUMN IF NOT EXISTS participant_status text NOT NULL DEFAULT 'active';

COMMENT ON COLUMN multi_teacher_participants.participant_status
  IS 'active = playing, waiting = on the waiting list for a spot';

-- 2. Auto-archive deadline (set at game creation, NULL = no deadline)
ALTER TABLE multi_teacher_games
  ADD COLUMN IF NOT EXISTS archive_after timestamptz DEFAULT NULL;

COMMENT ON COLUMN multi_teacher_games.archive_after
  IS 'If the game is still forming after this time, auto-archive it';

-- 3. Replay link (which completed game this one replays)
ALTER TABLE multi_teacher_games
  ADD COLUMN IF NOT EXISTS replay_of uuid DEFAULT NULL
    REFERENCES multi_teacher_games(id) ON DELETE SET NULL;

COMMENT ON COLUMN multi_teacher_games.replay_of
  IS 'If this game is a replay, points to the original completed game';

-- Done
