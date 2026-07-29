-- ─────────────────────────────────────────────────────────────────────────
-- Migration: Comment review workflow
-- DESTINATION: supabase/migrations/20260726120000_comment_review_status.sql
--
-- Session 105 (Phase 5): Adds a review_status column to multi_game_comments
-- so teachers can approve/reject favorite-linked comments for the reveal.
--
-- Matches the existing pattern: entries.status and
-- game_sessions.favorite_comment_status both use
-- ('pending','approved','rejected').
-- ─────────────────────────────────────────────────────────────────────────

-- Add review_status to multi_game_comments
ALTER TABLE multi_game_comments
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending';

-- Add constraint (safe: only applies to new/updated rows)
ALTER TABLE multi_game_comments
  DROP CONSTRAINT IF EXISTS multi_game_comments_review_status_check;
ALTER TABLE multi_game_comments
  ADD CONSTRAINT multi_game_comments_review_status_check
  CHECK (review_status IN ('pending', 'approved', 'rejected'));

-- Add reviewed_at and reviewed_by for audit trail
ALTER TABLE multi_game_comments
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE multi_game_comments
  ADD COLUMN IF NOT EXISTS reviewed_by UUID;

-- Migrate existing data: is_approved=true → 'approved'
UPDATE multi_game_comments
  SET review_status = 'approved'
  WHERE is_approved = true AND review_status = 'pending';
