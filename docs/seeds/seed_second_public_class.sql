-- ─────────────────────────────────────────────────────────────────────────
-- seed_second_public_class.sql
--
-- Seeds a SECOND public class so the mixed deck (deck.ts) and the upcoming
-- student history strip (Part 2) have real multi-cohort data to show.
--
-- Approach (per Mike's call: "no reason to have different fotos"):
--   • Reuse the EXISTING teacher (18f23db0…) as both class teacher and the
--     starter rows' student_id — starters are teacher-owned.
--   • Reuse class 1's image PATHS verbatim. Starter media lives in the public
--     `teacher-deck` bucket; deck.ts builds the URL via getPublicUrl(path),
--     so the same media_url renders the same image with zero file movement.
--   • The NEW class_id is the only thing that distinguishes the cohort.
--
-- Idempotent: guarded so re-running won't create a duplicate class or a
-- second set of entries.
--
-- Run in: Supabase SQL Editor.  Keep file at: docs/seeds/seed_second_public_class.sql
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_teacher    uuid := '18f23db0-0b2f-4f30-914a-233c3a73c305';  -- existing teacher
  v_src_class  uuid := 'd9ce91d4-793f-4ed9-81ea-201c0d15602e';  -- class 1 (source)
  v_new_class  uuid;
  v_new_name   text := 'Spotlight — Back Door';
BEGIN
  -- 1) Create the class once (matched by name + teacher).
  SELECT id INTO v_new_class
  FROM public.classes
  WHERE name = v_new_name AND teacher_id = v_teacher;

  IF v_new_class IS NULL THEN
    INSERT INTO public.classes (id, teacher_id, name, is_public)
    VALUES (gen_random_uuid(), v_teacher, v_new_name, true)
    RETURNING id INTO v_new_class;
    RAISE NOTICE 'Created class % (%).', v_new_name, v_new_class;
  ELSE
    RAISE NOTICE 'Class % already exists (%); not recreating.', v_new_name, v_new_class;
  END IF;

  -- 2) Clone class 1's live starters into the new class, once.
  IF NOT EXISTS (SELECT 1 FROM public.entries WHERE class_id = v_new_class) THEN
    INSERT INTO public.entries
      (id, student_id, class_id, media_url, media_type,
       description_text, status, uploaded_at, is_starter)
    SELECT
      gen_random_uuid(),       -- fresh entry id (this is the id favorites is keyed by)
      v_teacher,               -- teacher-owned starter
      v_new_class,             -- the new cohort
      media_url,               -- SAME image path → same picture, no upload
      media_type,
      description_text,        -- same captions; see note in chat re: testability
      'live',
      now(),
      true
    FROM public.entries
    WHERE class_id = v_src_class
      AND is_starter = true
      AND status = 'live';

    RAISE NOTICE 'Seeded % starter entries into %.',
      (SELECT count(*) FROM public.entries WHERE class_id = v_new_class), v_new_name;
  ELSE
    RAISE NOTICE 'Entries already present for %; not reseeding.', v_new_name;
  END IF;
END $$;
