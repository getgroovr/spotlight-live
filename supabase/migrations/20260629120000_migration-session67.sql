-- ═══════════════════════════════════════════════════════════════
-- MIGRATION — Session 67: Dual-role fix + admin_settings
-- Run in Supabase SQL Editor (single paste)
--
-- What this does:
--   1. Adds is_admin boolean to profiles (default false)
--   2. Changes any role='admin' users back to 'teacher' + is_admin=true
--   3. Updates is_admin() function to check the boolean
--   4. Creates admin_settings singleton table (warmup_teacher_count)
--   5. Adds RLS policies for admin_settings
--
-- After this:
--   • Mike is role='teacher' again → deck page + teacher pages work
--   • Mike has is_admin=true → admin dashboard still works
--   • role='admin' is retired — boolean is source of truth
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Add is_admin boolean ────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- ─── 2. Fix dual-role: admin → teacher + flag ───────────────────
UPDATE profiles
SET role = 'teacher', is_admin = true
WHERE role = 'admin';

-- ─── 3. Update is_admin() function ──────────────────────────────
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND is_admin = true
  );
$$;

-- ─── 4. Create admin_settings table ─────────────────────────────
CREATE TABLE IF NOT EXISTS admin_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  warmup_teacher_count integer NOT NULL DEFAULT 1
    CHECK (warmup_teacher_count IN (1, 3, 9)),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert singleton row (skip if exists)
INSERT INTO admin_settings (id, warmup_teacher_count)
VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

-- ─── 5. RLS on admin_settings ───────────────────────────────────
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "admin_settings_admin_all"
  ON admin_settings FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Any logged-in user can read (deck page needs warmup config)
CREATE POLICY "admin_settings_authenticated_read"
  ON admin_settings FOR SELECT
  USING (auth.role() = 'authenticated');

-- ─── 6. Update RLS policies that reference role='admin' ─────────
-- The existing policies from session 65 use is_admin() function,
-- which we just updated above. They should work automatically.
-- No policy changes needed.

-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════
SELECT 'profiles.is_admin column' AS check,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'profiles' AND column_name = 'is_admin'
       ) THEN '✓ exists' ELSE '✗ missing' END AS status

UNION ALL
SELECT 'Mike is teacher+admin',
       CASE WHEN EXISTS (
         SELECT 1 FROM profiles
         WHERE role = 'teacher' AND is_admin = true
       ) THEN '✓ yes' ELSE '✗ no' END

UNION ALL
SELECT 'No role=admin left',
       CASE WHEN NOT EXISTS (
         SELECT 1 FROM profiles WHERE role = 'admin'
       ) THEN '✓ clean' ELSE '✗ still has admin role' END

UNION ALL
SELECT 'admin_settings exists',
       CASE WHEN EXISTS (
         SELECT 1 FROM admin_settings WHERE id = 1
       ) THEN '✓ row exists' ELSE '✗ missing' END

UNION ALL
SELECT 'warmup_teacher_count',
       warmup_teacher_count::text
FROM admin_settings WHERE id = 1;
