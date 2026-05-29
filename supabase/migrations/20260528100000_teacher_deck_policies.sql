-- ════════════════════════════════════════════════════════════════════════
-- Migration 10 (policies-only half) — teacher-deck RLS policies
-- ════════════════════════════════════════════════════════════════════════
-- Run this AFTER creating the `teacher-deck` bucket via the Supabase
-- Storage dashboard (Storage → New bucket → name: teacher-deck, Public: ON,
-- file size: 8 MiB, MIME types: image/jpeg, image/png, image/webp).
--
-- Bucket creation via raw SQL is rejected by Supabase's permissions model
-- (ERROR 42501: must be owner of relation buckets). Policies on
-- storage.objects are permitted, so this half of the migration is SQL.
--
-- See migration 08 in the project for the original handoff doc explaining
-- the full rationale of the bucket split (private `media` for student
-- uploads, public `teacher-deck` for starter content).
-- ════════════════════════════════════════════════════════════════════════

-- ── RLS policies on storage.objects for teacher-deck ──────────────────────
-- SELECT: no policy needed. Public buckets are world-readable by URL; that
-- is the whole point of this bucket.
--
-- INSERT/UPDATE/DELETE: scoped to teachers who own the target class. The
-- path convention <class_id>/<teacher_id>/<filename> means the first folder
-- of the storage path is the class id, which we use in the check.

drop policy if exists "teacher-deck: teacher writes own class" on storage.objects;
create policy "teacher-deck: teacher writes own class"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'teacher-deck'
    and exists (
      select 1
      from public.classes c
      where (c.id)::text = (storage.foldername(name))[1]
        and c.teacher_id = (select auth.uid())
    )
  );

drop policy if exists "teacher-deck: owner or teacher mutates" on storage.objects;
create policy "teacher-deck: owner or teacher mutates"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'teacher-deck'
    and exists (
      select 1
      from public.classes c
      where (c.id)::text = (storage.foldername(name))[1]
        and c.teacher_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'teacher-deck'
    and exists (
      select 1
      from public.classes c
      where (c.id)::text = (storage.foldername(name))[1]
        and c.teacher_id = (select auth.uid())
    )
  );

drop policy if exists "teacher-deck: owner or teacher deletes" on storage.objects;
create policy "teacher-deck: owner or teacher deletes"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'teacher-deck'
    and exists (
      select 1
      from public.classes c
      where (c.id)::text = (storage.foldername(name))[1]
        and c.teacher_id = (select auth.uid())
    )
  );
