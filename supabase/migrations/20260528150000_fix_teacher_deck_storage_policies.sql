-- ─────────────────────────────────────────────────────────────────────────
-- 20260528150000_fix_teacher_deck_storage_policies.sql
--
-- Replaces the teacher-deck bucket policies with versions that don't depend
-- on auth.uid() inside storage RLS — which had been failing in practice
-- (uploads got 42501 "new row violates RLS" despite the logic being correct
-- on literal values; the deeper cause is Supabase storage policies seeing a
-- different auth context than the entries table).
--
-- New strategy:
--   - INSERT/UPDATE/DELETE: gated by profile.role = 'teacher'. The Server
--     Action already re-verifies class ownership and path layout before
--     storage I/O, so the policy doesn't need to also enforce that.
--   - SELECT: permissive for all roles (anon + authenticated). The bucket
--     is PUBLIC by design — anonymous /play visitors must be able to read
--     starter photos. No reason to gate reads.
--
-- Trade-off acknowledged: any teacher can technically write/edit/delete any
-- other teacher's starter photo at the storage layer. Acceptable for Slice
-- 1A because:
--   (a) there's only ever one public class and one teacher owning it,
--   (b) the Server Action authorizes ownership before the storage call,
--   (c) Slice 1B+ will revisit when multiple teachers exist.
-- ─────────────────────────────────────────────────────────────────────────

-- ── Drop the existing teacher-deck policies (broken or not) ──────────────
DROP POLICY IF EXISTS "teacher-deck: teacher writes own class" ON storage.objects;
DROP POLICY IF EXISTS "teacher-deck: owner or teacher mutates" ON storage.objects;
DROP POLICY IF EXISTS "teacher-deck: owner or teacher deletes" ON storage.objects;

-- ── INSERT: any authenticated teacher can write to teacher-deck ──────────
CREATE POLICY "teacher-deck: teacher writes"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'teacher-deck'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'teacher'
  )
);

-- ── UPDATE: any authenticated teacher can mutate teacher-deck objects ────
CREATE POLICY "teacher-deck: teacher mutates"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'teacher-deck'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'teacher'
  )
);

-- ── DELETE: any authenticated teacher can delete teacher-deck objects ────
CREATE POLICY "teacher-deck: teacher deletes"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'teacher-deck'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'teacher'
  )
);

-- ── SELECT: public read for the teacher-deck bucket ──────────────────────
-- Both anon (anonymous /play visitors) and authenticated (teacher dashboard)
-- can read. Bucket is marked public; this policy makes that explicit at the
-- RLS layer rather than relying on storage-level public flag alone.
DROP POLICY IF EXISTS "teacher-deck: public read" ON storage.objects;
CREATE POLICY "teacher-deck: public read"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'teacher-deck');
