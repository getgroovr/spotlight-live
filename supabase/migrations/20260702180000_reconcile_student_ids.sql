-- ═══════════════════════════════════════════════════════════════
-- Session 72 migration: reconcile students.id with auth.users.id
--
-- Backfills the ID invariant enforced by the new enrollStudent code:
--   students.id == auth.users.id == profiles.id  (per email)
--
-- Before this fix, enrollStudent inserted students with a random UUID
-- so any student who enrolled through /play (rather than through the
-- setup SQL for seed voters) has a mismatched id. That breaks the
-- dashboard's enrollment lookup — see Session 72 for the full story.
--
-- For every students row where id differs from the matching auth.users
-- row, this migration:
--   1. Renames the stale row's email to a sentinel so the unique
--      constraint releases
--   2. Inserts a fresh students row keyed to auth.users.id, carrying
--      over name / screen_name / photo_url
--   3. Re-points enrollments.student_id and game_sessions.student_id
--   4. Deletes the stale row
--
-- Idempotent: rows already in sync are skipped. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_row       RECORD;
  v_fixed     int := 0;
  v_skipped   int := 0;
  v_orphaned  int := 0;
BEGIN
  FOR v_row IN
    SELECT s.id       AS stale_id,
           s.email    AS email,
           s.name     AS name,
           s.screen_name AS screen_name,
           s.photo_url   AS photo_url,
           u.id       AS auth_id
    FROM students s
    JOIN auth.users u ON u.email = s.email
    WHERE s.id <> u.id
  LOOP
    -- 1. Free the email on the stale row
    UPDATE students
       SET email = 'stale-' || v_row.stale_id::text || '@removed.local'
     WHERE id = v_row.stale_id;

    -- 2. Insert the fresh row keyed to auth.users.id
    --    If a row with auth_id already exists (rare — implies duplicate
    --    student records), update it in place with the carried-over fields.
    INSERT INTO students (id, email, name, screen_name, photo_url)
    VALUES (v_row.auth_id, v_row.email, v_row.name, v_row.screen_name, v_row.photo_url)
    ON CONFLICT (id) DO UPDATE SET
      email       = EXCLUDED.email,
      name        = COALESCE(students.name, EXCLUDED.name),
      screen_name = COALESCE(students.screen_name, EXCLUDED.screen_name),
      photo_url   = COALESCE(students.photo_url, EXCLUDED.photo_url);

    -- 3. Migrate FK references
    UPDATE enrollments   SET student_id = v_row.auth_id WHERE student_id = v_row.stale_id;
    UPDATE game_sessions SET student_id = v_row.auth_id WHERE student_id = v_row.stale_id;

    -- 4. Delete the stale row
    DELETE FROM students WHERE id = v_row.stale_id;

    v_fixed := v_fixed + 1;
    RAISE NOTICE '  reconciled: % (% → %)', v_row.email, v_row.stale_id, v_row.auth_id;
  END LOOP;

  -- Also count students rows with no matching auth.users row — these
  -- are true orphans (email never registered with auth). Left alone.
  SELECT COUNT(*)
    INTO v_orphaned
    FROM students s
   WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.email = s.email)
     AND s.email NOT LIKE 'stale-%@removed.local';

  SELECT COUNT(*)
    INTO v_skipped
    FROM students s
    JOIN auth.users u ON u.email = s.email
   WHERE s.id = u.id;

  RAISE NOTICE '──────────────────────────────────────';
  RAISE NOTICE 'Reconcile summary:';
  RAISE NOTICE '  rows fixed              : %', v_fixed;
  RAISE NOTICE '  rows already in sync    : %', v_skipped;
  RAISE NOTICE '  rows with no auth match : % (left alone)', v_orphaned;
END $$;

-- ═════════════════════════════════════════════════════════════
-- VERIFICATION — every students row with a matching auth email
-- must have students.id = auth.users.id
-- ═════════════════════════════════════════════════════════════

SELECT
  'reconciled students'   AS check,
  COUNT(*)::text          AS value
FROM students s
JOIN auth.users u ON u.email = s.email
WHERE s.id = u.id

UNION ALL

SELECT
  'still mismatched (should be 0)',
  COUNT(*)::text
FROM students s
JOIN auth.users u ON u.email = s.email
WHERE s.id <> u.id

UNION ALL

SELECT
  'sentinel rows (safe to delete later)',
  COUNT(*)::text
FROM students
WHERE email LIKE 'stale-%@removed.local';
