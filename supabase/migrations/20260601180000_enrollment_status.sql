-- ─────────────────────────────────────────────────────────────────────────
-- 20260601180000_enrollment_status.sql
--
-- Adds a lifecycle flag to enrollments so the app can enforce "a student is in
-- at most ONE active class at a time" (World B). Past classes accumulate as
-- 'completed' and feed the student's history strip; only one may be 'active'.
--
-- WHAT MOVES active → completed: manual for now (SQL or dashboard). Auto-
-- completion (a set number of rounds, or a teacher "close class" action) is a
-- later slice once round-advancement / teacher UI exist. This migration only
-- introduces the flag + a guard-friendly partial index; the enrollStudent
-- server action enforces the rule on the write path.
--
-- Run in: Supabase SQL Editor. Keep file at:
--   supabase/migrations/20260601180000_enrollment_status.sql
-- ─────────────────────────────────────────────────────────────────────────

-- 1) The column. Default 'active' so every existing row backfills to active
--    (today every enrollment IS the student's one live class).
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- 2) Constrain to the two known states. (Drop-then-add so re-running is safe.)
ALTER TABLE public.enrollments
  DROP CONSTRAINT IF EXISTS enrollments_status_check;
ALTER TABLE public.enrollments
  ADD CONSTRAINT enrollments_status_check
  CHECK (status IN ('active', 'completed'));

-- 3) Belt-and-suspenders at the DB level: a student can have at most ONE
--    active enrollment, regardless of class. The app guard is the friendly
--    first line (returns a clear message); this partial unique index is the
--    hard backstop so a race or a direct insert can't create two active rows.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_enrollment_per_student
  ON public.enrollments (student_id)
  WHERE status = 'active';

-- Proof queries (run after):
--   select status, count(*) from public.enrollments group by status;
--   -- expect everything 'active' on first run.
