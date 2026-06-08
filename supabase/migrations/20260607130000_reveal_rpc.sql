-- ─────────────────────────────────────────────────────────────────────────
-- 20260607130000_reveal_rpc.sql
--
-- The end-of-game reveal RPC for /student/results.
--
-- Design (locked in the 2026-06-03 "Resolving round pointer source-of-truth"
-- session and revisited in handoff #28):
--   • No per-round winners. One reveal at the end of the game.
--   • Top 3 students by total favorites RECEIVED across all rounds.
--   • Each top-3 student gets two panels:
--       Panel A — their posted pic that was favorited most across all rounds,
--                 shown with comments from ONLY the students who favorited it
--                 (not every comment).
--       Panel B — their OWN taste: their favorites across rounds, with their
--                 own comments on each, chronological by round.
--   • Tier-based truncation of Panel B (gold=all, silver=2/3, bronze=1/3) is
--     INTENTIONALLY a UI-side rule. The RPC returns the full list per
--     winner; the page picks how many to show by placement. This lets the
--     gradient be tuned without a DB change, and survives variable
--     total_rounds (the original 9/6/3 spec assumed 9 rounds).
--
-- AUTHORIZATION:
--   SECURITY DEFINER with self-authorization via is_enrolled_in(p_class_id).
--   Students see the reveal for any class they're enrolled in. The
--   SECURITY DEFINER stripe is required because we aggregate across every
--   student's game_sessions + entries, which student-scoped RLS otherwise
--   hides.
--
-- WHERE THE DATA LIVES (after the social-slice drop in 20260607120000):
--   • Photos:      public.entries           keyed by profiles.id (auth uid)
--   • Favorites:   public.game_sessions.favorites jsonb {entryId: bool}
--                  — one row per (student_id, class_id, round). One favorite
--                  per row in practice; we count all "true" entries to be
--                  defensive.
--   • Comments:    public.game_sessions.comments jsonb {entryId: text}
--                  — one row per (student_id, class_id, round). The comment
--                  someone wrote about an entry they viewed.
--
-- THE TWO-IDENTITY BRIDGE:
--   entries.student_id is profiles.id (= auth.users.id), while
--   game_sessions.student_id is students.id (email-bridged). To rank
--   "favorites received per STUDENT", we resolve each favorited entry to
--   its owning student row via:
--     entries.student_id → auth.users.id → auth.users.email → students.email
--   This is the same bridge the now-dropped my_student_id() used in the
--   social slice. Centralized here so callers never see it. Once the two
--   identity worlds are unified (documented debt — see student-archive.ts
--   header), this collapses to a single FK lookup.
--
-- STARTERS:
--   Teacher-uploaded starters live in entries with is_starter = true. They
--   can be favorited by students, but those favorites must NOT count toward
--   any student's ranking. The favorites_resolved CTE filters
--   is_starter = false before the owner join.
--
-- TIES, MISSING DATA, AND EDGE CASES:
--   • Tie-break for top-3: total_favorites DESC, owner_student_id ASC.
--     Placeholder rule — if multiple students tie for 3rd, only one gets
--     bronze (lowest student_id). Refine when it matters.
--   • Tie-break for Panel A entry: fav_count DESC, entry_id ASC. Same
--     placeholder logic.
--   • If fewer than 3 students were ever favorited, the winners array has
--     1 or 2 elements. The UI must handle 0..3.
--   • If a winner's Panel A entry has no commenters who favorited it, the
--     comments_from_favoriters array is empty (not null).
--   • Empty-string comments are filtered out of Panel A.
--   • Game-over gating: NONE in the RPC. The page is responsible. Calling
--     this pre-game returns whatever data exists (likely empty winners).
--
-- Run in: Supabase SQL Editor. Then save at:
--   supabase/migrations/20260607130000_reveal_rpc.sql
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.class_top_three_reveal(p_class_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_class_name   text;
  v_total_rounds int;
  v_result       jsonb;
begin
  -- ── Authorize ─────────────────────────────────────────────────────────
  if not public.is_enrolled_in(p_class_id) then
    raise exception 'not authorized for class %', p_class_id
      using errcode = 'insufficient_privilege';
  end if;

  -- ── Class metadata (for the page header / UI sanity) ──────────────────
  select c.name, c.total_rounds
    into v_class_name, v_total_rounds
    from public.classes c
   where c.id = p_class_id;

  -- ── Build the reveal payload ──────────────────────────────────────────
  with favorites_given as (
    -- One row per favorite act: (voter, round, favorited_entry).
    -- game_sessions.favorites is {entryId: bool}; count only the trues.
    select
      gs.student_id                as voter_student_id,
      gs.round                     as round_num,
      (f.key)::uuid                as favorited_entry_id
    from public.game_sessions gs,
         lateral jsonb_each(gs.favorites) f
    where gs.class_id = p_class_id
      and f.value::text = 'true'
  ),
  favorites_resolved as (
    -- Resolve favorited entry → its OWNER as a students.id (via email bridge).
    -- Starters excluded: their owner is the teacher, who isn't in the ranking.
    select
      fg.voter_student_id,
      fg.round_num,
      fg.favorited_entry_id        as entry_id,
      e.round_number               as entry_round,
      e.media_url                  as entry_media_url,
      e.description_text           as entry_description,
      s_owner.id                   as owner_student_id,
      s_owner.name                 as owner_name,
      s_owner.screen_name          as owner_screen_name
    from favorites_given fg
    join public.entries e
      on e.id = fg.favorited_entry_id
     and e.is_starter = false
    join auth.users u
      on u.id = e.student_id
    join public.students s_owner
      on lower(s_owner.email) = lower(u.email)
  ),
  entry_fav_counts as (
    -- How many times each entry was favorited (cached so Panel A doesn't
    -- recompute per row).
    select
      entry_id,
      owner_student_id,
      count(*) as fav_count
    from favorites_resolved
    group by entry_id, owner_student_id
  ),
  top_three as (
    -- Top 3 owners by total favorites received.
    -- Tie-break: owner_student_id ASC (placeholder; refine when it matters).
    select
      owner_student_id,
      owner_name,
      owner_screen_name,
      count(*)                                                       as total_favorites,
      row_number() over (order by count(*) desc, owner_student_id)   as placement
    from favorites_resolved
    group by owner_student_id, owner_name, owner_screen_name
    order by total_favorites desc, owner_student_id
    limit 3
  ),
  panel_a_entries as (
    -- For each top-3 winner: their most-favorited entry.
    -- Tie-break: entry_id ASC.
    select distinct on (efc.owner_student_id)
      efc.owner_student_id,
      efc.entry_id,
      efc.fav_count,
      e.round_number     as entry_round,
      e.media_url        as entry_media_url,
      e.description_text as entry_description
    from entry_fav_counts efc
    join public.entries e on e.id = efc.entry_id
    where efc.owner_student_id in (select owner_student_id from top_three)
    order by efc.owner_student_id, efc.fav_count desc, efc.entry_id
  ),
  panel_a_comments as (
    -- For each Panel A entry: comments BY students who favorited it,
    -- ON that entry. We look in the favoriter's game_sessions row for
    -- the round they favorited in.
    select
      pa.owner_student_id,
      fr.voter_student_id                                  as author_id,
      s_voter.name                                         as author_name,
      s_voter.screen_name                                  as author_screen_name,
      gs_voter.comments ->> (pa.entry_id::text)            as comment_text
    from panel_a_entries pa
    join favorites_resolved fr
      on fr.entry_id = pa.entry_id
    join public.students s_voter
      on s_voter.id = fr.voter_student_id
    join public.game_sessions gs_voter
      on gs_voter.student_id = fr.voter_student_id
     and gs_voter.class_id   = p_class_id
     and gs_voter.round      = fr.round_num
    where gs_voter.comments ? (pa.entry_id::text)
      and length(coalesce(gs_voter.comments ->> (pa.entry_id::text), '')) > 0
  ),
  panel_b_favorites as (
    -- For each top-3 winner: THEIR OWN favorites (= they were the voter),
    -- with their own comment on each. Chronological by round in the agg.
    select
      fr.voter_student_id                                  as winner_student_id,
      fr.round_num,
      fr.entry_id,
      fr.entry_media_url,
      fr.entry_description,
      fr.owner_name                                        as fav_owner_name,
      fr.owner_screen_name                                 as fav_owner_screen_name,
      gs.comments ->> (fr.entry_id::text)                  as winner_comment
    from favorites_resolved fr
    join public.game_sessions gs
      on gs.student_id = fr.voter_student_id
     and gs.class_id   = p_class_id
     and gs.round      = fr.round_num
    where fr.voter_student_id in (select owner_student_id from top_three)
  )
  select jsonb_build_object(
    'class_name',   v_class_name,
    'total_rounds', v_total_rounds,
    'winners', coalesce(
      (select jsonb_agg(
         jsonb_build_object(
           'placement',           t3.placement,
           'student_id',          t3.owner_student_id,
           'student_name',        t3.owner_name,
           'student_screen_name', t3.owner_screen_name,
           'total_favorites',     t3.total_favorites,
           'panel_a', (
             select case when pa.entry_id is null then null else
               jsonb_build_object(
                 'entry_id',          pa.entry_id,
                 'round',             pa.entry_round,
                 'media_url',         pa.entry_media_url,
                 'description_text',  pa.entry_description,
                 'fav_count',         pa.fav_count,
                 'comments_from_favoriters', coalesce(
                   (select jsonb_agg(
                      jsonb_build_object(
                        'author_id',          pac.author_id,
                        'author_name',        pac.author_name,
                        'author_screen_name', pac.author_screen_name,
                        'comment',            pac.comment_text
                      )
                    )
                    from panel_a_comments pac
                    where pac.owner_student_id = t3.owner_student_id),
                   '[]'::jsonb)
               )
             end
             from panel_a_entries pa
             where pa.owner_student_id = t3.owner_student_id
           ),
           'panel_b', jsonb_build_object(
             'favorites', coalesce(
               (select jsonb_agg(
                  jsonb_build_object(
                    'round',                pbf.round_num,
                    'entry_id',             pbf.entry_id,
                    'media_url',            pbf.entry_media_url,
                    'description_text',     pbf.entry_description,
                    'owner_name',           pbf.fav_owner_name,
                    'owner_screen_name',    pbf.fav_owner_screen_name,
                    'own_comment',          pbf.winner_comment
                  ) order by pbf.round_num
                )
                from panel_b_favorites pbf
                where pbf.winner_student_id = t3.owner_student_id),
               '[]'::jsonb)
           )
         ) order by t3.placement
       )
       from top_three t3),
      '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

comment on function public.class_top_three_reveal(uuid) is
  'End-of-game reveal payload for /student/results. Top 3 students by favorites received, with Panel A (their best-favorited pic + favoriters'' comments) and Panel B (their own favorites + comments). SECURITY DEFINER, self-authorizes via is_enrolled_in().';

grant execute on function public.class_top_three_reveal(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- PROOF QUERIES — run after; verify before declaring done.
-- ─────────────────────────────────────────────────────────────────────────
-- 1) Function exists and is grantable:
--   select proname, pg_get_function_identity_arguments(oid) as args
--     from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname = 'class_top_three_reveal';
--   -- expect 1 row: class_top_three_reveal | p_class_id uuid
--
-- 2) Calling it against a class the caller is enrolled in returns jsonb
--    with class_name + winners array (possibly empty if no favorites yet):
--   -- Grab a class id you ARE enrolled in:
--   select id, name from public.classes order by created_at limit 5;
--   -- Then:
--   select public.class_top_three_reveal('<cid>'::uuid);
--
-- 3) Calling it against a class you're NOT enrolled in raises:
--    "not authorized for class ..."
--
-- 4) Smoke-test the shape (run against the test class with favorites):
--   select jsonb_pretty(public.class_top_three_reveal('<cid>'::uuid));
-- ─────────────────────────────────────────────────────────────────────────
