-- ─────────────────────────────────────────────────────────────────────────
-- 20260607120000_drop_social_slice.sql
--
-- Removes the SOCIAL SLICE surface introduced by:
--   • 20260602120000_social_slice_foundation.sql
--   • 20260602130000_social_slice_logic.sql
--
-- WHY:
--   The social slice was scaffolded as a parallel content/approval stack
--   (submissions / submission_comments / submission_favorites + 7 RPCs +
--   my_student_id() helper) in the LIVE-GAME identity world. It was a
--   REFERENCE design — explicitly called out as "not a dependency" by its
--   own header comment — meant to be wired up alongside the upload screen.
--
--   That wiring never landed. In the intervening sessions the engine-world
--   stack (entries + game_sessions, with round_number added in #27) has
--   absorbed every requirement the social slice was going to serve:
--     – per-round student photos                → entries.round_number
--     – teacher approval gate                   → entries.status
--     – per-round favoriting + comments         → game_sessions.{favorites,comments} jsonb
--   The end-of-game reveal (the only remaining consumer of the social
--   slice's tally RPCs) is now built against entries + game_sessions in
--   the same slice that runs this migration.
--
--   Keeping the dead surface is worse than removing it: /teacher/social
--   loads cleanly and returns zero rows on every query, which is an
--   attractive nuisance for future work. Drop it.
--
-- WHAT THIS DOES NOT DROP:
--   • enrollments.status CHECK widening to include 'dropped'. That change
--     was introduced by social_slice_foundation but is INDEPENDENT of the
--     tables — it stands on its own and supports the future two-consecutive-
--     miss drop logic. Kept on purpose.
--
-- COMPANION CLEANUP (done by hand alongside this migration):
--   • Delete src/app/teacher/social/ (page.tsx, actions.ts, social-client.tsx).
--     Those files call the RPCs and read the tables this migration drops;
--     leaving them would produce build errors / runtime exceptions.
--
-- SAFETY:
--   The first block counts rows in all three tables and RAISEs if any are
--   non-zero. This protects against a future case where someone wires a
--   write path between sessions and forgets to update this plan — the
--   migration aborts cleanly (transaction rolls back) before any drops run.
--   On 2026-06-07 the only rows present were two manual seed inserts from
--   2026-06-02 ("SEED A r1", "SEED A r2"); both were deleted before this
--   migration was applied.
--
-- Run in: Supabase SQL Editor. Then save at:
--   supabase/migrations/20260607120000_drop_social_slice.sql
-- ─────────────────────────────────────────────────────────────────────────

-- ── 0. Safety check ──────────────────────────────────────────────────────
-- If any of the three tables has data, abort. Better a clean fail than a
-- silent destruction.
do $$
declare
  n_subs       bigint;
  n_comments   bigint;
  n_favorites  bigint;
begin
  select count(*) into n_subs       from public.submissions;
  select count(*) into n_comments   from public.submission_comments;
  select count(*) into n_favorites  from public.submission_favorites;

  if n_subs > 0 or n_comments > 0 or n_favorites > 0 then
    raise exception
      'Refusing to drop: submissions=%, submission_comments=%, submission_favorites=% (expected all 0). Inspect rows before proceeding.',
      n_subs, n_comments, n_favorites;
  end if;
end $$;

-- ── 1. Drop the 7 SECURITY DEFINER RPCs (the "logic layer") ──────────────
-- Functions don't reference each other; any order is fine. IF EXISTS so
-- re-running this migration is harmless.
drop function if exists public.approve_submission(uuid);
drop function if exists public.reject_submission(uuid);
drop function if exists public.approve_comment(uuid);
drop function if exists public.reject_comment(uuid);
drop function if exists public.tally_round(uuid, int);
drop function if exists public.class_round_winners(uuid);
drop function if exists public.class_grand_totals(uuid);

-- ── 2. Drop the three tables in dependency order ─────────────────────────
-- submission_favorites and submission_comments both FK to submissions
-- (ON DELETE CASCADE), so drop the children first. Dropping each table
-- automatically drops its RLS policies and indexes.
drop table if exists public.submission_favorites;
drop table if exists public.submission_comments;
drop table if exists public.submissions;

-- ── 3. Drop the RLS helper my_student_id() ───────────────────────────────
-- It was introduced solely to support the policies on the three tables
-- above. With those policies gone, nothing else calls it (verified by
-- grep across all migrations 2026-05-26 through 2026-06-06: the only
-- matches were in the social-slice files themselves).
drop function if exists public.my_student_id();

-- ── 4. Drop the submission_status enum ───────────────────────────────────
-- No remaining columns reference it (the only users were the three tables
-- just dropped). Use IF EXISTS in case it's already gone.
drop type if exists public.submission_status;

-- ─────────────────────────────────────────────────────────────────────────
-- PROOF QUERIES — run after; verify before declaring done.
-- ─────────────────────────────────────────────────────────────────────────
-- 1) The tables and enum are gone:
--   select table_name from information_schema.tables
--    where table_schema='public'
--      and table_name in ('submissions','submission_comments','submission_favorites');
--   -- expect 0 rows.
--   select 1 from pg_type where typname = 'submission_status';
--   -- expect 0 rows.
--
-- 2) The 7 RPCs + my_student_id are gone:
--   select proname from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('approve_submission','reject_submission','approve_comment',
--                      'reject_comment','tally_round','class_round_winners',
--                      'class_grand_totals','my_student_id');
--   -- expect 0 rows.
--
-- 3) enrollments.status is INTACT and still accepts 'dropped':
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname='enrollments_status_check';
--   -- expect: CHECK (status = ANY (ARRAY['active','completed','dropped']))
--
-- 4) The one-active partial index is intact (independent of the rest):
--   select indexdef from pg_indexes
--    where indexname='one_active_enrollment_per_student';
--   -- expect: ... WHERE (status = 'active'::text)
-- ─────────────────────────────────────────────────────────────────────────
