-- Session 95: Teacher profiles for public browsing
--
-- Adds columns to `profiles` for teacher profile pages:
--   - teaching_style: short description of teaching approach
--   - is_public: whether the teacher's profile appears on the browse page
--
-- Note: `bio` and `avatar_url` already exist on profiles from the
-- original schema. We reuse them rather than adding duplicates.
--
-- Safe to re-run.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS teaching_style text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
