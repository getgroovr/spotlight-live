-- ─────────────────────────────────────────────────────────────────────────
-- Migration: is_admin boolean column + admin_settings table
-- Session 67 — dual-role migration
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Add is_admin boolean to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- 2. Create admin_settings singleton
CREATE TABLE IF NOT EXISTS admin_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  warmup_teacher_count integer NOT NULL DEFAULT 1 CHECK (warmup_teacher_count IN (1, 3, 9)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed the singleton row if it doesn't exist
INSERT INTO admin_settings (id, warmup_teacher_count)
VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

-- 3. Update the is_admin() function to check the boolean column
-- instead of role = 'admin'. This is what the admin page and RLS use.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- 4. Set getgroovr as permanent admin
UPDATE profiles
SET is_admin = true
WHERE id IN (
  SELECT p.id FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE u.email = 'getgroovr@yahoo.com'
);

-- 5. RLS policy for admin_settings (admin can read/write, others can read)
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read admin_settings" ON admin_settings;
CREATE POLICY "Anyone can read admin_settings"
  ON admin_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can update admin_settings" ON admin_settings;
CREATE POLICY "Admins can update admin_settings"
  ON admin_settings FOR UPDATE
  USING (public.is_admin());
