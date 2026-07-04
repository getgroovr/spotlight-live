-- ─────────────────────────────────────────────────────────────────────────
-- DESTINATION: supabase/migrations/20260702130000_teacher_archiving.sql
--
-- Session 71: Teacher archiving.
--
-- Adds is_archived boolean to profiles. Archived teachers are hidden from
-- the active roster on the admin dashboard but their past classes and
-- student data are preserved. Archiving also removes the teacher from the
-- warm-up rotation queue (if present) so they can't accidentally end up
-- recruiting while archived.
--
-- Safe to run on existing data — defaults to false (all teachers active).
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Add the column with a safe default.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- 2. Index for fast filtering on the admin page (most teachers are active,
--    so a partial index on archived teachers is tiny and fast for the
--    archive section query).
CREATE INDEX IF NOT EXISTS idx_profiles_is_archived
  ON profiles (is_archived)
  WHERE is_archived = true;
