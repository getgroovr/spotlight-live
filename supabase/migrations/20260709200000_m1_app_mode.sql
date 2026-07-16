-- ═══════════════════════════════════════════════════════════════
-- M1: Add app_mode column to admin_settings
-- Destination: supabase/migrations/20260709200000_m1_app_mode.sql
--
-- Supports standard vs multi mode. Default is 'standard'.
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_settings' AND column_name = 'app_mode'
  ) THEN
    ALTER TABLE admin_settings ADD COLUMN app_mode varchar(10) DEFAULT 'standard';
  END IF;
END $$;
