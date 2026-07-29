-- ─────────────────────────────────────────────────────────────────────────
-- DESTINATION: supabase/migrations/20260725120000_cleanup_dead_tables_columns.sql
--
-- Session 104: Cleanup pass
--   1. Drop teacher_rotation table — nothing references it since Session 98
--   2. Drop stale columns on entries — selected_solo, selected_trio,
--      selected_full are no longer read by any code
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Drop the teacher_rotation table (cascade in case of lingering FKs/policies)
DROP TABLE IF EXISTS teacher_rotation CASCADE;

-- 2. Drop stale mode-selection columns from entries
ALTER TABLE entries DROP COLUMN IF EXISTS selected_solo;
ALTER TABLE entries DROP COLUMN IF EXISTS selected_trio;
ALTER TABLE entries DROP COLUMN IF EXISTS selected_full;
