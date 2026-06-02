-- ─────────────────────────────────────────────────────────────────────────
-- 20260602120000_social_slice_foundation.sql
--
-- SOCIAL SLICE (the peer-content / "Round 2" arc) — STEP 1 of 4: DATA ONLY.
-- Build order (HANDOFF #14): schema → teacher approval surface → combined
-- student screen → tally/reveal. THIS IS THE SCHEMA STEP.
--
-- No game logic lives here. Round counts, the one-win-per-student cap, the
-- grand-total class winner, the 24/22/24 daily clock, and the reveal are RULES
-- that belong in server actions, not in this schema. These tables store
-- NEUTRAL FACTS; the rules read them. (This keeps a future "copy the whole
-- project and re-skin it" path clean — the tables travel generic, the
-- Spotlight rules are the code you'd rewrite anyway.)
--
-- WORLD: built in the LIVE-GAME identity world (students / enrollments /
-- game_sessions, email-keyed), NOT the engine world (profiles / entries,
-- auth.uid()-keyed) — because rounds, enrollment status, and the entry-round
-- favoriting already live there. The engine world's entries / peer_comments /
-- approve_entry() approval machinery is a REFERENCE design mirrored here, not a
-- dependency. Unifying the two identity worlds is documented debt, not this
-- slice's job. (Teacher identity is still the engine world: a teacher is a
-- profiles row, owns classes via classes.teacher_id = auth.uid(); that's why
-- reviewed_by → profiles and the teacher policies reuse owns_class().)
--
-- WHAT THIS ADDS
--   • submission_status enum             pending | approved | rejected
--   • public.submissions                 per-round student pic + description +
--                                        upload-gate approval
--   • public.submission_comments         peer comments on a submission +
--                                        comment-gate approval (reveal reads
--                                        'approved' only)
--   • public.submission_favorites        one favorite per student per round,
--                                        pointing at a submission (cross-student
--                                        tally SUBSTRATE; the tally LOGIC is Step 4)
--   • public.my_student_id()             caller's students.id (RLS helper,
--                                        parallel to my_class_id())
--   • enrollments.status CHECK widened   active | completed | dropped
--
-- DELIBERATELY NOT HERE (later passes — "just the basics now"):
--   • the round state machine + daily clock (24/22/24) + reveal trigger
--   • per-round miss tracking / two-consecutive-miss drop logic
--   • storage bucket + path/RLS for submission pics (media_url is just text;
--     where the bytes live is settled with the upload screen, Step 3)
--   • the 18+ attestation column (a one-liner; add with the enrollment screen)
--   • the tally RPC that crowns round/class winners + auto-completion (Step 4)
--
-- Run in: Supabase SQL Editor. Then save at:
--   supabase/migrations/20260602120000_social_slice_foundation.sql
-- ─────────────────────────────────────────────────────────────────────────

-- ── 0. Status enum (shared by uploads and peer comments) ──────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'submission_status') then
    create type public.submission_status as enum ('pending', 'approved', 'rejected');
  end if;
end $$;

-- ── 1. RLS helper: the caller's own students.id ───────────────────────────
-- Bridges auth.uid() → auth.users.email → students.email, the same bridge
-- is_enrolled_in() already uses. SECURITY DEFINER so the policy can read
-- students/auth.users; STABLE; locked search_path. Returns null for a caller
-- with no student row (e.g. a teacher), which makes the student branches below
-- simply not match — the desired behavior.
create or replace function public.my_student_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.students s
  join auth.users u on lower(u.email) = lower(s.email)
  where u.id = auth.uid()
  limit 1;
$$;

grant execute on function public.my_student_id() to authenticated;

comment on function public.my_student_id() is
  'The caller''s own students.id (live-game identity), or null if they have no student row. RLS helper, parallel to my_class_id().';

-- ── 2. submissions — per-round student pic + description + upload gate ─────
create table if not exists public.submissions (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students (id) on delete cascade,
  class_id     uuid not null references public.classes  (id) on delete cascade,
  round        int  not null,
  media_url    text not null,                    -- the pic uploaded for this round
  description  text not null default '',          -- REQUIRED at the screen ("no pic
                                                  -- without its words"); DB-permissive
                                                  -- so a draft/resubmit isn't blocked.
  status       public.submission_status not null default 'pending',  -- the upload gate
  reviewed_by  uuid references public.profiles (id),                 -- approving teacher
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  -- One pic per student per round. A REJECTED pic is resubmitted by UPDATING
  -- this same row back to 'pending' (not by inserting a second row).
  unique (student_id, class_id, round)
);

create index if not exists submissions_class_round_status_idx
  on public.submissions (class_id, round, status);
create index if not exists submissions_student_idx
  on public.submissions (student_id);

alter table public.submissions enable row level security;

comment on table public.submissions is
  'One student pic per round (+ its description), gated by teacher approval (the upload gate). status: pending → approved (votable) / rejected (resubmit). Live-game world; mirrors entries'' approval pattern without depending on it.';

-- READ: a student reads APPROVED submissions in any class they're enrolled in
-- (the deck they vote on) + ALL of their own (any status, to see/resubmit a
-- rejected pic). The owning teacher reads everything in their classes.
drop policy if exists "submissions: read" on public.submissions;
create policy "submissions: read"
  on public.submissions for select
  to authenticated
  using (
    student_id = public.my_student_id()
    or public.owns_class(class_id)
    or (status = 'approved' and public.is_enrolled_in(class_id))
  );

-- INSERT: a student inserts their OWN pic, in a class they're enrolled in, and
-- only as 'pending' (they cannot self-approve into the deck).
drop policy if exists "submissions: student inserts own pending" on public.submissions;
create policy "submissions: student inserts own pending"
  on public.submissions for insert
  to authenticated
  with check (
    student_id = public.my_student_id()
    and public.is_enrolled_in(class_id)
    and status = 'pending'
  );

-- UPDATE (student resubmit): edit own pic/description and move pending|rejected
-- back to pending. Cannot self-approve.
drop policy if exists "submissions: student resubmits own" on public.submissions;
create policy "submissions: student resubmits own"
  on public.submissions for update
  to authenticated
  using (
    student_id = public.my_student_id()
    and status in ('pending', 'rejected')
  )
  with check (
    student_id = public.my_student_id()
    and status = 'pending'
  );

-- UPDATE (teacher): approve / reject / edit any submission in a class they own.
drop policy if exists "submissions: teacher moderates own class" on public.submissions;
create policy "submissions: teacher moderates own class"
  on public.submissions for update
  to authenticated
  using (public.owns_class(class_id))
  with check (public.owns_class(class_id));

-- ── 3. submission_comments — peer comments + the comment gate ─────────────
-- Distinct object from teacher_comments (teacher → student notes). HANDOFF #14:
-- keep peer comments and teacher feedback as TWO objects even though they share
-- an approve gesture, so the reveal gates on the right comments. Default
-- 'pending' (BLOCKING) — the reveal shows 'approved' only.
create table if not exists public.submission_comments (
  id                uuid primary key default gen_random_uuid(),
  submission_id     uuid not null references public.submissions (id) on delete cascade,
  author_student_id uuid not null references public.students    (id) on delete cascade,
  class_id          uuid not null references public.classes     (id) on delete cascade,
  round             int  not null,
  body              text not null,
  status            public.submission_status not null default 'pending',  -- the comment gate
  reviewed_by       uuid references public.profiles (id),
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists submission_comments_submission_idx
  on public.submission_comments (submission_id, status);
create index if not exists submission_comments_class_round_idx
  on public.submission_comments (class_id, round, status);

alter table public.submission_comments enable row level security;

comment on table public.submission_comments is
  'Peer comments on a student submission, gated by teacher approval (the comment gate). The reveal reads status=''approved'' only. Separate object from teacher_comments by design (HANDOFF #14).';

-- NOTE (app-layer integrity): class_id/round are carried for cheap RLS and
-- per-round queries; nothing in the DB forces them to match the parent
-- submission's class_id/round. The insert path must set them from the
-- submission. A later trigger can harden this if needed — not for the basics.

drop policy if exists "submission_comments: read" on public.submission_comments;
create policy "submission_comments: read"
  on public.submission_comments for select
  to authenticated
  using (
    author_student_id = public.my_student_id()
    or public.owns_class(class_id)
    or (status = 'approved' and public.is_enrolled_in(class_id))
  );

drop policy if exists "submission_comments: student inserts own pending" on public.submission_comments;
create policy "submission_comments: student inserts own pending"
  on public.submission_comments for insert
  to authenticated
  with check (
    author_student_id = public.my_student_id()
    and public.is_enrolled_in(class_id)
    and status = 'pending'
  );

drop policy if exists "submission_comments: teacher moderates own class" on public.submission_comments;
create policy "submission_comments: teacher moderates own class"
  on public.submission_comments for update
  to authenticated
  using (public.owns_class(class_id))
  with check (public.owns_class(class_id));

-- ── 4. submission_favorites — one vote per student per round ──────────────
-- The cross-student tally SUBSTRATE. Today's game_sessions.favorites is jsonb
-- keyed by a teacher entryId, per student, never aggregated. This is a real
-- table so the tally is a clean GROUP BY (the tally LOGIC / winners is Step 4).
create table if not exists public.submission_favorites (
  id               uuid primary key default gen_random_uuid(),
  voter_student_id uuid not null references public.students    (id) on delete cascade,
  submission_id    uuid not null references public.submissions (id) on delete cascade,
  class_id         uuid not null references public.classes     (id) on delete cascade,
  round            int  not null,
  created_at       timestamptz not null default now(),
  -- One favorite per student per round (re-favoriting UPDATES this row).
  unique (voter_student_id, class_id, round)
);

create index if not exists submission_favorites_submission_idx
  on public.submission_favorites (submission_id);
create index if not exists submission_favorites_class_round_idx
  on public.submission_favorites (class_id, round);

alter table public.submission_favorites enable row level security;

comment on table public.submission_favorites is
  'One favorite per student per round, pointing at a submission. The cross-student tally substrate (round winner = most favorites; class winner = grand total). Tally logic lives in server actions / a Step-4 RPC, not here.';

-- READ: a student sees their own vote; the owning teacher sees all votes in
-- their classes. (Raw votes are not student-visible; winners are computed and
-- shown at reveal — Step 4.)
drop policy if exists "submission_favorites: read" on public.submission_favorites;
create policy "submission_favorites: read"
  on public.submission_favorites for select
  to authenticated
  using (
    voter_student_id = public.my_student_id()
    or public.owns_class(class_id)
  );

drop policy if exists "submission_favorites: student votes own" on public.submission_favorites;
create policy "submission_favorites: student votes own"
  on public.submission_favorites for insert
  to authenticated
  with check (
    voter_student_id = public.my_student_id()
    and public.is_enrolled_in(class_id)
  );

drop policy if exists "submission_favorites: student changes own vote" on public.submission_favorites;
create policy "submission_favorites: student changes own vote"
  on public.submission_favorites for update
  to authenticated
  using (voter_student_id = public.my_student_id())
  with check (voter_student_id = public.my_student_id());

-- ── 5. enrollments.status: add 'dropped' ──────────────────────────────────
-- The one_active_enrollment_per_student partial index (migration
-- 20260601180000) is WHERE status='active', so 'dropped' is automatically
-- excluded — a dropped student can hold a NEW active enrollment in a different
-- class. (Re-activating the SAME class after a drop is an UPDATE of the dropped
-- row, not a second insert, because of unique(student_id, class_id). Noted; the
-- two-consecutive-miss drop logic itself is a later pass.)
alter table public.enrollments
  drop constraint if exists enrollments_status_check;
alter table public.enrollments
  add constraint enrollments_status_check
  check (status in ('active', 'completed', 'dropped'));

-- ─────────────────────────────────────────────────────────────────────────
-- PROOF QUERIES — run after; verify before declaring done.
-- ─────────────────────────────────────────────────────────────────────────
-- 1) The three tables exist + the enum has the right values:
--   select table_name from information_schema.tables
--    where table_schema='public'
--      and table_name in ('submissions','submission_comments','submission_favorites');
--   -- expect 3 rows.
--   select unnest(enum_range(null::public.submission_status)) as v;
--   -- expect: pending, approved, rejected.
--
-- 2) RLS is enabled on all three:
--   select relname, relrowsecurity from pg_class
--    where relname in ('submissions','submission_comments','submission_favorites');
--   -- expect relrowsecurity = true for all three.
--
-- 3) 'dropped' is accepted and the one-active guard is intact:
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname='enrollments_status_check';
--   -- expect: CHECK (status = ANY (ARRAY['active','completed','dropped']))
--   select indexdef from pg_indexes
--    where indexname='one_active_enrollment_per_student';
--   -- expect: ... WHERE (status = 'active'::text)  → 'dropped' excluded.
--
-- 4) Policy count sanity (4 on submissions, 3 each on comments/favorites):
--   select tablename, count(*) from pg_policies
--    where tablename in ('submissions','submission_comments','submission_favorites')
--    group by tablename order by tablename;
--
-- 5) The helper resolves (run as a logged-in student via the app, or impersonate
--    a student's auth.uid() in the dashboard):
--   select public.my_student_id();   -- expect that student's students.id.
-- ─────────────────────────────────────────────────────────────────────────
