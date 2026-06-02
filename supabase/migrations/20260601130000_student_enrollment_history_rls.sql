-- ─────────────────────────────────────────────────────────────────────────
-- 20260601130000_student_enrollment_history_rls.sql
--
-- SLICE 1 (cohorts foundation), Part 1 of 2 — student multi-cohort reads.
--
-- WHY THIS EXISTS
--   my_class_id() returns ONE uuid: the student's *current* class
--   (profiles.class_id). Student-read RLS compared rows against it, so a
--   student could only ever read their current class. For multi-cohort we
--   need students to read EVERY class they've ever enrolled in (their
--   history strip + expanding a past class). enrollments already records
--   every student<->class link, so that table is the source of truth.
--
--   This migration adds is_enrolled_in(class_id) — "has the current student
--   ever enrolled in this class?" — and swaps the three student-read RLS
--   branches that used `= my_class_id()` over to it. Every OTHER branch in
--   those policies (own-row, owns_class teacher branch) is preserved exactly.
--
--   my_class_id() is NOT dropped — it still means "current class" and is
--   used by the deck/write paths and by the /auth/confirm class propagation
--   (the app-code half of this slice).
--
-- SAFETY
--   - SECURITY DEFINER + STABLE + locked search_path, mirroring owns_class().
--   - Each policy is recreated with the SAME name and SAME non-student
--     branches; only the single student-read branch changes. No table is
--     opened up beyond "your own enrollments."
-- ─────────────────────────────────────────────────────────────────────────

-- 1) The helper: true if the current auth user has any enrollment in cid.
--    Joins enrollments -> students -> auth.users by email, matching how the
--    rest of the app resolves a logged-in student to their student row.
create or replace function public.is_enrolled_in(cid uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.enrollments e
    join public.students s on s.id = e.student_id
    join auth.users u on lower(u.email) = lower(s.email)
    where u.id = auth.uid()
      and e.class_id = cid
  );
$function$;

-- 2) classes: teacher reads own  (student branch widened to history)
drop policy if exists "classes: teacher reads own" on public.classes;
create policy "classes: teacher reads own"
  on public.classes
  for select
  using (
    (teacher_id = (select auth.uid()))
    or is_enrolled_in(id)
  );

-- 3) entries: read  (student branch widened to history; live-only preserved)
drop policy if exists "entries: read" on public.entries;
create policy "entries: read"
  on public.entries
  for select
  using (
    (student_id = (select auth.uid()))
    or owns_class(class_id)
    or (status = 'live'::entry_status and is_enrolled_in(class_id))
  );

-- 4) peer_comments: read  (student branch widened to history; approved-only preserved)
drop policy if exists "peer_comments: read" on public.peer_comments;
create policy "peer_comments: read"
  on public.peer_comments
  for select
  using (
    (author_id = (select auth.uid()))
    or owns_class(class_id)
    or (status = 'approved'::moderation_status and is_enrolled_in(class_id))
  );
