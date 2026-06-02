-- ─────────────────────────────────────────────────────────────────────────
-- 20260602130000_social_slice_logic.sql
--
-- SOCIAL SLICE — the LOGIC LAYER that sits between Step 1 (tables) and the
-- teacher approval surface. All SQL, all teacher-verifiable, no front-end
-- needed. Mirrors the engine world's approve_entry() pattern but for the
-- live-game world (students/enrollments) and without the archive dance —
-- submissions has unique(student_id, class_id, round), so there's at most one
-- pic per student per round and nothing to displace.
--
-- Every function is SECURITY DEFINER (so it can aggregate across all students'
-- favorites, which RLS otherwise hides) and SELF-AUTHORIZES via owns_class():
-- only the owning teacher can call them. Safe to grant to `authenticated`.
--
-- WHAT THIS ADDS
--   GATES (writes):
--     approve_submission(uuid) / reject_submission(uuid)  — the upload gate
--     approve_comment(uuid)    / reject_comment(uuid)      — the comment gate
--   TALLY (pure reads — store facts, compute rules):
--     tally_round(class, round)     — raw favorite counts per submission
--     class_round_winners(class)    — round winners WITH the one-win-per-student
--                                     cap + runner-up reassignment (the RULE,
--                                     in code, recomputed from favorites)
--     class_grand_totals(class)     — favorites per student across all rounds;
--                                     top row = class winner (no exclusions)
--
-- NOT HERE (later passes, by design):
--   • the round state machine: "reveal = teacher approves the final comment"
--     ORCHESTRATION, the 24/22/24 clock, next-round advance, auto-completion.
--     These functions are the PRIMITIVES that orchestration will call.
--   • per-round miss tracking / the two-consecutive-miss drop logic.
--
-- TIE-BREAKS & RULES are deliberately simple and live HERE in code so they're
-- cheap to change: round winner ties break on earliest submission (longest up),
-- then id; grand-total ties break on student id. Swap freely later.
--
-- Run in: Supabase SQL Editor. Then save at:
--   supabase/migrations/20260602130000_social_slice_logic.sql
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. approve_submission — the upload gate (approve) ─────────────────────
create or replace function public.approve_submission(p_submission_id uuid)
returns public.submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.submissions;
  result public.submissions;
begin
  select * into s from public.submissions where id = p_submission_id;
  if not found then
    raise exception 'submission % not found', p_submission_id using errcode = 'no_data_found';
  end if;
  if not public.owns_class(s.class_id) then
    raise exception 'not authorized to moderate submissions in this class'
      using errcode = 'insufficient_privilege';
  end if;
  if s.status <> 'pending' then
    raise exception 'submission % is not pending (status=%)', p_submission_id, s.status
      using errcode = 'check_violation';
  end if;

  update public.submissions
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_submission_id
  returning * into result;
  return result;
end;
$$;

comment on function public.approve_submission(uuid) is
  'Owning teacher approves a pending submission (the upload gate). pending → approved (votable).';

-- ── 2. reject_submission — the upload gate (reject / pull) ────────────────
-- Permissive: a teacher may reject a pending submission OR pull an already-
-- approved one. The student resubmits by updating the row back to pending
-- (RLS policy "submissions: student resubmits own").
create or replace function public.reject_submission(p_submission_id uuid)
returns public.submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.submissions;
  result public.submissions;
begin
  select * into s from public.submissions where id = p_submission_id;
  if not found then
    raise exception 'submission % not found', p_submission_id using errcode = 'no_data_found';
  end if;
  if not public.owns_class(s.class_id) then
    raise exception 'not authorized to moderate submissions in this class'
      using errcode = 'insufficient_privilege';
  end if;

  update public.submissions
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_submission_id
  returning * into result;
  return result;
end;
$$;

comment on function public.reject_submission(uuid) is
  'Owning teacher rejects/pulls a submission → rejected. Student resubmits via the resubmit RLS path.';

-- ── 3. approve_comment / reject_comment — the comment gate ────────────────
create or replace function public.approve_comment(p_comment_id uuid)
returns public.submission_comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.submission_comments;
  result public.submission_comments;
begin
  select * into c from public.submission_comments where id = p_comment_id;
  if not found then
    raise exception 'comment % not found', p_comment_id using errcode = 'no_data_found';
  end if;
  if not public.owns_class(c.class_id) then
    raise exception 'not authorized to moderate comments in this class'
      using errcode = 'insufficient_privilege';
  end if;
  if c.status <> 'pending' then
    raise exception 'comment % is not pending (status=%)', p_comment_id, c.status
      using errcode = 'check_violation';
  end if;

  update public.submission_comments
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_comment_id
  returning * into result;
  return result;
end;
$$;

comment on function public.approve_comment(uuid) is
  'Owning teacher approves a pending peer comment (the comment gate). The reveal reads approved comments only.';

create or replace function public.reject_comment(p_comment_id uuid)
returns public.submission_comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.submission_comments;
  result public.submission_comments;
begin
  select * into c from public.submission_comments where id = p_comment_id;
  if not found then
    raise exception 'comment % not found', p_comment_id using errcode = 'no_data_found';
  end if;
  if not public.owns_class(c.class_id) then
    raise exception 'not authorized to moderate comments in this class'
      using errcode = 'insufficient_privilege';
  end if;

  update public.submission_comments
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_comment_id
  returning * into result;
  return result;
end;
$$;

comment on function public.reject_comment(uuid) is
  'Owning teacher rejects/removes a peer comment → rejected. The reveal will not show it.';

-- ── 4. tally_round — raw favorite counts per submission (pure read) ───────
-- The neutral facts: who got how many favorites this round. No cap, no winner
-- logic — just counts, ordered. approved submissions only (only those are
-- votable). Includes 0-vote submissions (left join) so the teacher sees the
-- whole field.
create or replace function public.tally_round(p_class_id uuid, p_round int)
returns table (submission_id uuid, student_id uuid, favorite_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.owns_class(p_class_id) then
    raise exception 'not authorized for class %', p_class_id using errcode = 'insufficient_privilege';
  end if;

  return query
    select s.id, s.student_id, count(f.id)
    from public.submissions s
    left join public.submission_favorites f
      on f.submission_id = s.id and f.class_id = p_class_id and f.round = p_round
    where s.class_id = p_class_id
      and s.round    = p_round
      and s.status   = 'approved'
    group by s.id, s.student_id
    order by count(f.id) desc, s.created_at asc, s.id asc;
end;
$$;

comment on function public.tally_round(uuid, int) is
  'Raw favorite counts per approved submission for one round (no cap, no winner logic). The neutral facts the winner rule reads.';

-- ── 5. class_round_winners — the one-win cap + runner-up reassignment ─────
-- THE RULE, in code. Walks rounds in order; each round the crown goes to the
-- highest-voted student who has NOT already won an earlier round (runner-up
-- reassignment). A round with no votes has no winner. A winner must have > 0
-- favorites. Recomputed from favorites every call — nothing is stored, so a
-- vote correction or a re-approval just changes the answer.
create or replace function public.class_round_winners(p_class_id uuid)
returns table (round int, submission_id uuid, student_id uuid, favorite_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r   record;
  w   record;
  won uuid[] := '{}';   -- students who have already taken a round crown
begin
  if not public.owns_class(p_class_id) then
    raise exception 'not authorized for class %', p_class_id using errcode = 'insufficient_privilege';
  end if;

  for r in
    select distinct sf.round as rnd
    from public.submission_favorites sf
    where sf.class_id = p_class_id
    order by sf.round
  loop
    select s.id as sub_id, s.student_id as stu_id, count(f.id) as fav
    into w
    from public.submissions s
    left join public.submission_favorites f
      on f.submission_id = s.id and f.class_id = p_class_id and f.round = r.rnd
    where s.class_id = p_class_id
      and s.round    = r.rnd
      and s.status   = 'approved'
      and not (s.student_id = any(won))
    group by s.id, s.student_id, s.created_at
    having count(f.id) > 0
    order by count(f.id) desc, s.created_at asc, s.id asc
    limit 1;

    if found then
      won := won || w.stu_id;
      round          := r.rnd;
      submission_id  := w.sub_id;
      student_id     := w.stu_id;
      favorite_count := w.fav;
      return next;
    end if;
  end loop;
  return;
end;
$$;

comment on function public.class_round_winners(uuid) is
  'Round winners for a class with the one-win-per-student cap + runner-up reassignment. Pure read, recomputed from favorites. The rule lives here, not in the schema.';

-- ── 6. class_grand_totals — favorites per student, all rounds (pure read) ─
-- The class winner = the top row. Grand total counts EVERY favorite a student
-- received, no exclusions (so it can differ from round-win counts). Ties break
-- on student id (placeholder rule, change freely).
create or replace function public.class_grand_totals(p_class_id uuid)
returns table (student_id uuid, total_favorites bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.owns_class(p_class_id) then
    raise exception 'not authorized for class %', p_class_id using errcode = 'insufficient_privilege';
  end if;

  return query
    select s.student_id, count(f.id)
    from public.submissions s
    left join public.submission_favorites f on f.submission_id = s.id
    where s.class_id = p_class_id
      and s.status   = 'approved'
    group by s.student_id
    order by count(f.id) desc, s.student_id asc;
end;
$$;

comment on function public.class_grand_totals(uuid) is
  'Total favorites per student across all rounds (no exclusions). Top row = class winner. Pure read.';

-- ── 7. Grants (functions self-authorize via owns_class) ───────────────────
grant execute on function public.approve_submission(uuid)   to authenticated;
grant execute on function public.reject_submission(uuid)    to authenticated;
grant execute on function public.approve_comment(uuid)      to authenticated;
grant execute on function public.reject_comment(uuid)       to authenticated;
grant execute on function public.tally_round(uuid, int)     to authenticated;
grant execute on function public.class_round_winners(uuid)  to authenticated;
grant execute on function public.class_grand_totals(uuid)   to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- PROOF QUERIES — run after; verify before declaring done.
-- ─────────────────────────────────────────────────────────────────────────
-- 1) All seven functions exist:
--   select proname, pg_get_function_identity_arguments(oid) as args
--     from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('approve_submission','reject_submission','approve_comment',
--                      'reject_comment','tally_round','class_round_winners',
--                      'class_grand_totals')
--    order by proname;
--   -- expect 7 rows.
--
-- 2) The reads run (return 0 rows on empty data, no error). Grab a class id:
--   select id, name from public.classes order by created_at limit 5;
--   -- then, with one of those ids as :cid —
--   select * from public.tally_round('<cid>'::uuid, 1);
--   select * from public.class_round_winners('<cid>'::uuid);
--   select * from public.class_grand_totals('<cid>'::uuid);
--   -- all succeed; empty until there are approved submissions + favorites.
--
-- 3) Auth guard bites: calling with a class you DON'T own raises
--    'not authorized for class ...'. (Run as the owning teacher to see rows;
--    the dashboard 'postgres' role owns everything, so to test the guard,
--    impersonate a non-owner auth.uid().)
--
-- NEXT (next session): the teacher approval SURFACE (the screen that calls
-- approve_submission / approve_comment and closes a round), then the combined
-- student screen, then the reveal orchestration that ties approving-the-last-
-- comment to class_round_winners + class_grand_totals + auto-completion.
-- Bring the repo tree + teacher-side code so the screen matches conventions.
-- ─────────────────────────────────────────────────────────────────────────
