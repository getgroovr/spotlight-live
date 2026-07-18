-- ─────────────────────────────────────────────────────────────────────────
-- Migration: Add levels and recruiting support
-- DESTINATION: Run in Supabase SQL Editor
--
-- Session 93: Each class has a level (beginner/intermediate/advanced).
-- Teachers recruit per-level. Starter photos are per-level.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Add level to classes
ALTER TABLE classes ADD COLUMN IF NOT EXISTS level text
  CHECK (level IN ('beginner', 'intermediate', 'advanced'));

-- 2. Add is_recruiting to classes (kept for future per-class control)
ALTER TABLE classes ADD COLUMN IF NOT EXISTS is_recruiting boolean DEFAULT false;

-- 3. Add level to entries (for grouping starter photos by level)
ALTER TABLE entries ADD COLUMN IF NOT EXISTS level text
  CHECK (level IN ('beginner', 'intermediate', 'advanced'));

-- 4. Add recruiting flags to profiles (per-level toggle)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS recruiting_beginner boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS recruiting_intermediate boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS recruiting_advanced boolean DEFAULT false;

-- 5. Default existing classes and starters to 'beginner'
UPDATE classes SET level = 'beginner' WHERE level IS NULL;
UPDATE entries SET level = 'beginner' WHERE is_starter = true AND level IS NULL;

-- 6. Index for fast lookup: teacher's starters by level
CREATE INDEX IF NOT EXISTS idx_entries_starter_level
  ON entries (student_id, level)
  WHERE is_starter = true AND status = 'live';
