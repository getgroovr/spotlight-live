-- ═══════════════════════════════════════════════════════════════════════
-- SEED MULTI-TEACHER GAME — creates an active game visible on /play
-- Destination: sql/seed-multi-game.sql
--
-- Run AFTER all-in-one-setup-v9.sql + populate-seed-voter-sessions.sql
-- Run BEFORE or AFTER any jump-to script (independent of solo class state)
--
-- Creates:
--   • 2 extra teacher accounts (if they don't exist)
--   • 1 multi-teacher game with status='active', 3 rounds
--   • 3 participants (getgroovr + 2 seed teachers)
--   • 3 rounds with topics
--   • 9 photos (3 per teacher, 1 per round) using seed-photos bucket
--   • Round 1 set as active
-- ═══════════════════════════════════════════════════════════════════════

-- ── Step 1: Ensure seed teacher accounts exist ──────────────────────

DO $$
DECLARE
  v_teacher2_id uuid;
  v_teacher3_id uuid;
  v_getgroovr_id uuid;
  v_game_id uuid := gen_random_uuid();
  v_round1_id uuid := gen_random_uuid();
  v_round2_id uuid := gen_random_uuid();
  v_round3_id uuid := gen_random_uuid();
  v_bucket text := 'seed-photos';
  v_supabase_url text;
BEGIN
  -- Get Supabase URL for photo URLs
  -- Adjust if your bucket URL pattern is different
  SELECT decrypted_secret INTO v_supabase_url
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_url'
  LIMIT 1;

  -- Fallback: construct from project ref
  IF v_supabase_url IS NULL THEN
    v_supabase_url := 'https://ilctdtppstvmpvuvdqvf.supabase.co';
  END IF;

  -- Get getgroovr's ID
  SELECT id INTO v_getgroovr_id
  FROM auth.users
  WHERE email = 'getgroovr@yahoo.com';

  IF v_getgroovr_id IS NULL THEN
    RAISE EXCEPTION 'getgroovr@yahoo.com not found — run all-in-one-setup first';
  END IF;

  -- Create seed teacher 2 (if not exists)
  SELECT id INTO v_teacher2_id
  FROM auth.users
  WHERE email = 'seed-teacher-2@test.local';

  IF v_teacher2_id IS NULL THEN
    v_teacher2_id := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_user_meta_data, raw_app_meta_data, aud, role,
      created_at, updated_at, confirmation_token
    ) VALUES (
      v_teacher2_id, '00000000-0000-0000-0000-000000000000',
      'seed-teacher-2@test.local',
      crypt('password', gen_salt('bf')),
      NOW(),
      '{"display_name":"PhotoPanda"}'::jsonb,
      '{"provider":"email","providers":["email"]}'::jsonb,
      'authenticated', 'authenticated',
      NOW(), NOW(), ''
    );

    INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    VALUES (v_teacher2_id, v_teacher2_id, 'seed-teacher-2@test.local', 'email',
      jsonb_build_object('sub', v_teacher2_id, 'email', 'seed-teacher-2@test.local'),
      NOW(), NOW(), NOW());
  END IF;

  -- Create seed teacher 3 (if not exists)
  SELECT id INTO v_teacher3_id
  FROM auth.users
  WHERE email = 'seed-teacher-3@test.local';

  IF v_teacher3_id IS NULL THEN
    v_teacher3_id := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_user_meta_data, raw_app_meta_data, aud, role,
      created_at, updated_at, confirmation_token
    ) VALUES (
      v_teacher3_id, '00000000-0000-0000-0000-000000000000',
      'seed-teacher-3@test.local',
      crypt('password', gen_salt('bf')),
      NOW(),
      '{"display_name":"SnapFox"}'::jsonb,
      '{"provider":"email","providers":["email"]}'::jsonb,
      'authenticated', 'authenticated',
      NOW(), NOW(), ''
    );

    INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    VALUES (v_teacher3_id, v_teacher3_id, 'seed-teacher-3@test.local', 'email',
      jsonb_build_object('sub', v_teacher3_id, 'email', 'seed-teacher-3@test.local'),
      NOW(), NOW(), NOW());
  END IF;

  -- Ensure profiles exist for seed teachers
  INSERT INTO profiles (id, role, display_name, username, is_public)
  VALUES
    (v_teacher2_id, 'teacher', 'PhotoPanda', 'photopanda', false),
    (v_teacher3_id, 'teacher', 'SnapFox', 'snapfox', false)
  ON CONFLICT (id) DO UPDATE SET
    role = 'teacher',
    display_name = EXCLUDED.display_name;

  -- ── Step 2: Create the multi-teacher game ─────────────────────────

  INSERT INTO multi_teacher_games (
    id, topic, status, total_rounds, created_by, created_at
  ) VALUES (
    v_game_id,
    'City Life — Street Photography',
    'active',
    3,
    v_getgroovr_id,
    NOW() - interval '2 hours'
  );

  -- ── Step 3: Add participants ──────────────────────────────────────

  INSERT INTO multi_teacher_participants (game_id, teacher_id, participant_status, joined_at)
  VALUES
    (v_game_id, v_getgroovr_id, 'active', NOW() - interval '2 hours'),
    (v_game_id, v_teacher2_id,  'active', NOW() - interval '1 hour 50 minutes'),
    (v_game_id, v_teacher3_id,  'active', NOW() - interval '1 hour 40 minutes');

  -- ── Step 4: Create rounds with topics ─────────────────────────────

  INSERT INTO multi_game_rounds (id, game_id, round_number, topic, status)
  VALUES
    (v_round1_id, v_game_id, 1, 'Morning commute',  'active'),
    (v_round2_id, v_game_id, 2, 'Street food',      'pending'),
    (v_round3_id, v_game_id, 3, 'After dark',       'pending');

  -- ── Step 5: Add photos (3 per teacher, 1 per round) ───────────────
  -- Uses the same seed-photos bucket images as the solo deck.
  -- Adjust filenames if your bucket has different images.

  -- getgroovr's photos
  INSERT INTO multi_teacher_photos (game_id, teacher_id, round_number, photo_url, description_text, uploaded_at)
  VALUES
    (v_game_id, v_getgroovr_id, 1,
     v_supabase_url || '/storage/v1/object/public/' || v_bucket || '/mountain-lake.jpg',
     'The 6am bus stop — nobody talks, everybody thinks.', NOW() - interval '1 hour'),
    (v_game_id, v_getgroovr_id, 2,
     v_supabase_url || '/storage/v1/object/public/' || v_bucket || '/forest-path.jpg',
     'Taco cart on 5th — the line tells you everything.', NOW() - interval '55 minutes'),
    (v_game_id, v_getgroovr_id, 3,
     v_supabase_url || '/storage/v1/object/public/' || v_bucket || '/sunset-beach.jpg',
     'Neon reflections on wet pavement.', NOW() - interval '50 minutes');

  -- PhotoPanda's photos
  INSERT INTO multi_teacher_photos (game_id, teacher_id, round_number, photo_url, description_text, uploaded_at)
  VALUES
    (v_game_id, v_teacher2_id, 1,
     v_supabase_url || '/storage/v1/object/public/' || v_bucket || '/autumn-park.jpg',
     'Rush hour from above — patterns in the crowd.', NOW() - interval '45 minutes'),
    (v_game_id, v_teacher2_id, 2,
     v_supabase_url || '/storage/v1/object/public/' || v_bucket || '/city-night.jpg',
     'Grilled cheese window, steam rising.', NOW() - interval '40 minutes'),
    (v_game_id, v_teacher2_id, 3,
     v_supabase_url || '/storage/v1/object/public/' || v_bucket || '/flower-close.jpg',
     'Jazz club doorway — just a hint of saxophone.', NOW() - interval '35 minutes');

  -- SnapFox's photos
  INSERT INTO multi_teacher_photos (game_id, teacher_id, round_number, photo_url, description_text, uploaded_at)
  VALUES
    (v_game_id, v_teacher3_id, 1,
     v_supabase_url || '/storage/v1/object/public/' || v_bucket || '/old-door.jpg',
     'Bicycle messenger weaving through gridlock.', NOW() - interval '30 minutes'),
    (v_game_id, v_teacher3_id, 2,
     v_supabase_url || '/storage/v1/object/public/' || v_bucket || '/rainy-street.jpg',
     'Fruit stand colors against grey concrete.', NOW() - interval '25 minutes'),
    (v_game_id, v_teacher3_id, 3,
     v_supabase_url || '/storage/v1/object/public/' || v_bucket || '/stone-bridge.jpg',
     'Last call — the bartender''s view at closing.', NOW() - interval '20 minutes');

  RAISE NOTICE 'Multi-teacher game created: %', v_game_id;
  RAISE NOTICE 'Topic: City Life — Street Photography';
  RAISE NOTICE 'Teachers: getgroovr + PhotoPanda + SnapFox';
  RAISE NOTICE 'Rounds: 3 (Morning commute / Street food / After dark)';
  RAISE NOTICE 'Photos: 9 total (3 per teacher)';

END $$;

-- ── Verify ──────────────────────────────────────────────────────────

SELECT g.id, g.topic, g.status, g.total_rounds,
       (SELECT COUNT(*) FROM multi_teacher_participants tp
        WHERE tp.game_id = g.id AND tp.participant_status = 'active') AS teachers,
       (SELECT COUNT(*) FROM multi_teacher_photos ph
        WHERE ph.game_id = g.id) AS photos,
       (SELECT topic FROM multi_game_rounds r
        WHERE r.game_id = g.id AND r.round_number = 1) AS round_1_topic
FROM multi_teacher_games g
WHERE g.status = 'active'
ORDER BY g.created_at DESC
LIMIT 3;
