-- ─────────────────────────────────────────────────────────────────────────
-- Session 94: Add round_prompts to classes
--
-- Parallel to round_topics (which stores per-round topic/title selections),
-- round_prompts stores per-round teacher prompts shown to students.
-- Key "0" = warmup round prompt. Keys "1","2",… = game round prompts.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE classes ADD COLUMN IF NOT EXISTS round_prompts jsonb;
