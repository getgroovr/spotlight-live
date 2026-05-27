-- ════════════════════════════════════════════════════════════════════════
-- Migration 10 — public decks and teacher-owned starter entries
-- ════════════════════════════════════════════════════════════════════════
-- Purpose:
--   Slice 1A introduces the always-on generic deck — a "public class" anyone
--   (including anonymous visitors) can play. Two things were missing:
--
--   1. A way to mark a class as publicly playable. We add `classes.is_public`
--      so the front door can find the deck without coupling code to a UUID
--      in env vars, and so the RLS policy stays declarative.
--
--   2. A way to put MULTIPLE teacher-owned items into a single class. The
--      `entries_one_live_per_student_class` partial unique index (migration 03)
--      enforces exactly one live row per (student, class) — correct for student
--      submissions, but it blocks the teacher from seating nine starter photos
--      in the demo class. We add `entries.is_starter` and amend the index to
--      ignore starters, so the "one live per student" invariant still holds
--      for actual student submissions while teacher-owned starters can stack.
--
--   The deck-read policy is also amended so anon visitors can SELECT live
--   entries belonging to a public class. The existing policy required
--   `authenticated`; we add a parallel policy that's narrower (only live, only
--   public class) and granted to `anon`. `authenticated` users still go through
--   the original policy.
--
-- Affected objects:
--   - column public.classes.is_public        (new, default false)
--   - column public.entries.is_starter        (new, default false)
--   - index entries_one_live_per_student_class (amended: excludes starters)
--   - policy "entries: read public deck (anon)" on public.entries (new)
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Public-deck flag on classes ────────────────────────────────────────
alter table public.classes
  add column if not exists is_public boolean not null default false;

comment on column public.classes.is_public is
  'True for the always-on generic deck(s) that anyone can play without a class '
  'membership. The /play front door looks up public classes; everything else '
  'remains code/membership-gated.';

-- A class can be marked public at most by its teacher. We do not need a
-- separate RLS policy for this flag — the existing "teacher manages own class"
-- update policy on classes (migration 07) covers it.

-- ── 2. Starter flag on entries ────────────────────────────────────────────
alter table public.entries
  add column if not exists is_starter boolean not null default false;

comment on column public.entries.is_starter is
  'True for teacher-seeded items in the deck (e.g. the public deck''s starter '
  'photos). Starters are owned by the teacher (student_id = teacher_id) and '
  'are exempt from the one-live-per-student invariant so the teacher can seat '
  'multiple starters in one class. They are otherwise normal entries.';

-- ── 3. Amend the one-live-per-student invariant to ignore starters ────────
-- The original index from migration 03 only constrained student submissions
-- implicitly (because is_starter did not exist). Now that we have starters,
-- we explicitly carve them out of the invariant.
drop index if exists public.entries_one_live_per_student_class;
create unique index entries_one_live_per_student_class
  on public.entries (student_id, class_id)
  where status = 'live' and not is_starter;

-- ── 4. Anon read of live entries in a public class ────────────────────────
-- The existing "entries: read" policy (migration 07) is `to authenticated` and
-- the conditions are: own row, teacher of class, or (live and in caller's class).
-- None of those fire for anon — `auth.uid()` is null. So we add a parallel
-- policy granting anon SELECT on live rows of public classes only. This is the
-- minimum widening needed for the always-on front door.
--
-- The `entries_public` view (migration 07) has `security_invoker = on`, so it
-- inherits this policy. The game reads the view; reading_audio_url stays
-- column-omitted as before.
drop policy if exists "entries: read public deck (anon)" on public.entries;
create policy "entries: read public deck (anon)"
  on public.entries for select
  to anon
  using (
    status = 'live'
    and exists (
      select 1 from public.classes c
      where c.id = public.entries.class_id
        and c.is_public = true
    )
  );

-- Also grant authenticated users the same broadened read for public decks —
-- a logged-in student who has not yet joined a class needs to play the
-- generic deck too. The existing "entries: read" policy doesn't cover them
-- because they have no `my_class_id()` match.
drop policy if exists "entries: read public deck (authenticated)" on public.entries;
create policy "entries: read public deck (authenticated)"
  on public.entries for select
  to authenticated
  using (
    status = 'live'
    and exists (
      select 1 from public.classes c
      where c.id = public.entries.class_id
        and c.is_public = true
    )
  );

-- ── 5. Grant SELECT on the view to anon ───────────────────────────────────
-- RLS authorizes the rows; we also need the role grant on the view itself.
-- (Authenticated already has it from default grants in earlier migrations.)
grant select on public.entries_public to anon;

-- ── 6. Anon needs to look up the public class to find its id ──────────────
-- The adapter queries `classes` for `is_public = true` rows before reading the
-- deck. Add a narrow anon-read policy that exposes only public classes.
drop policy if exists "classes: read public (anon)" on public.classes;
create policy "classes: read public (anon)"
  on public.classes for select
  to anon
  using (is_public = true);

drop policy if exists "classes: read public (authenticated)" on public.classes;
create policy "classes: read public (authenticated)"
  on public.classes for select
  to authenticated
  using (is_public = true);

grant select on public.classes to anon;

-- ── 7. Anon read of media files in public classes ─────────────────────────
-- The "media: read by class" policy (migration 08) is `to authenticated` and
-- gates on `my_class_id()` / `owns_class()`. Neither helps an anon visitor.
-- Add a narrow anon-read policy on storage.objects for files under the
-- `media/<class_id>/...` paths where that class is public.
--
-- This is the storage-layer counterpart of the entries-read policy above.
-- Combined, they let an anon visitor (a) see live entries of a public class
-- and (b) load their photos. Nothing else is exposed.
drop policy if exists "media: read public-class (anon)" on storage.objects;
create policy "media: read public-class (anon)"
  on storage.objects for select
  to anon
  using (
    bucket_id = 'media'
    and exists (
      select 1 from public.classes c
      where c.id::text = (storage.foldername(name))[1]
        and c.is_public = true
    )
  );

-- And the matching authenticated-but-not-classmate case (e.g. a logged-in
-- visitor who hasn't joined a class). The original policy doesn't cover them.
drop policy if exists "media: read public-class (authenticated)" on storage.objects;
create policy "media: read public-class (authenticated)"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'media'
    and exists (
      select 1 from public.classes c
      where c.id::text = (storage.foldername(name))[1]
        and c.is_public = true
    )
  );

-- ── 8. Storage DELETE on media (missing from migration 08) ────────────────
-- Migration 08 set up INSERT, SELECT, and UPDATE on storage.objects for the
-- media bucket but never wrote a DELETE policy. That leaves the teacher
-- unable to clean up media files when a starter is removed (and, later, when
-- a student submission is rejected). Add the policy so deletes are scoped to
-- the file's owner or the class's owning teacher — mirroring the UPDATE rule.
drop policy if exists "media: owner or teacher deletes" on storage.objects;
create policy "media: owner or teacher deletes"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (
      (storage.foldername(name))[2] = (select auth.uid())::text
      or public.owns_class(((storage.foldername(name))[1])::uuid)
    )
  );
