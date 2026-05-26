-- ════════════════════════════════════════════════════════════════════════
-- Migration 08 — storage buckets + storage RLS
-- ════════════════════════════════════════════════════════════════════════
-- Purpose:
--   Two buckets, because privacy differs (KICKOFF "Storage"):
--     media          — submission photos/short videos + optional reply clips.
--                      Readable by classmates (it IS the game).
--     reading-audio   — TEACHER-ONLY. The student reading their description
--                      aloud. Locked so only the class's teacher and the owning
--                      student can read. Desktop honor-system privacy made real.
--
--   Path convention (so RLS can authorize by path):
--     media/<class_id>/<student_id>/<filename>
--     reading-audio/<class_id>/<student_id>/<filename>
--   The first path segment is the class_id; the second is the owning student.
--
-- Notes:
--   * Buckets are also declared in supabase/config.toml for `supabase start`.
--     Creating them here too (idempotent) means a remote `db push` provisions
--     them without a separate dashboard step. Both are PRIVATE — media is
--     served via signed URLs so non-classmates can't hotlink.
--   * storage.objects RLS uses storage.foldername(name) to read path segments.
-- ════════════════════════════════════════════════════════════════════════

-- ── Create buckets (idempotent) ───────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('reading-audio', 'reading-audio', false)
on conflict (id) do nothing;

-- ── media bucket policies ──────────────────────────────────────────────────
-- READ: the owning student, any classmate in the same class, or the owning
-- teacher. Path: media/<class_id>/<student_id>/...
drop policy if exists "media: read by class" on storage.objects;
create policy "media: read by class"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'media'
    and (
      -- classmate (or owner): first folder = caller's class_id
      (storage.foldername(name))[1] = public.my_class_id()::text
      -- owning teacher of that class
      or public.owns_class(((storage.foldername(name))[1])::uuid)
    )
  );

-- WRITE: a student uploads only under their own class/student path.
drop policy if exists "media: student writes own" on storage.objects;
create policy "media: student writes own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = public.my_class_id()::text
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- WRITE (teacher seed): teacher may upload into classes they own.
drop policy if exists "media: teacher writes own class" on storage.objects;
create policy "media: teacher writes own class"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and public.owns_class(((storage.foldername(name))[1])::uuid)
  );

-- UPDATE/DELETE on media: owning student or owning teacher.
drop policy if exists "media: owner or teacher mutates" on storage.objects;
create policy "media: owner or teacher mutates"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'media'
    and (
      (storage.foldername(name))[2] = (select auth.uid())::text
      or public.owns_class(((storage.foldername(name))[1])::uuid)
    )
  );

-- ── reading-audio bucket policies (TEACHER-ONLY + owning student) ──────────
-- READ: ONLY the owning student (their own practice file) and the owning
-- teacher. Classmates get NOTHING here — this is the teacher-only seam.
drop policy if exists "reading-audio: teacher or owner reads" on storage.objects;
create policy "reading-audio: teacher or owner reads"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'reading-audio'
    and (
      (storage.foldername(name))[2] = (select auth.uid())::text
      or public.owns_class(((storage.foldername(name))[1])::uuid)
    )
  );

-- WRITE: a student uploads their own reading-audio under their own path.
drop policy if exists "reading-audio: student writes own" on storage.objects;
create policy "reading-audio: student writes own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'reading-audio'
    and (storage.foldername(name))[1] = public.my_class_id()::text
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- UPDATE/DELETE: owning student or owning teacher.
drop policy if exists "reading-audio: owner or teacher mutates" on storage.objects;
create policy "reading-audio: owner or teacher mutates"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'reading-audio'
    and (
      (storage.foldername(name))[2] = (select auth.uid())::text
      or public.owns_class(((storage.foldername(name))[1])::uuid)
    )
  );
