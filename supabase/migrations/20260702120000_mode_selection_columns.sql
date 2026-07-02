-- ─────────────────────────────────────────────────────────────────────────
-- Migration: per-mode photo selection columns
-- Session 70 — multi-mode teacher deck selection
-- ─────────────────────────────────────────────────────────────────────────

-- Teachers pre-select which photos appear in each warm-up mode:
--   selected_solo = true → included when admin sets Solo mode (9 per teacher)
--   selected_trio = true → included when admin sets Trio mode (3 per teacher)
--   selected_full = true → included when admin sets Full mode (1 per teacher)
-- A photo can be selected for multiple modes simultaneously.

ALTER TABLE entries ADD COLUMN IF NOT EXISTS selected_solo boolean NOT NULL DEFAULT false;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS selected_trio boolean NOT NULL DEFAULT false;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS selected_full boolean NOT NULL DEFAULT false;

-- Migrate existing active starters into solo mode to preserve current behavior
UPDATE entries
SET selected_solo = true
WHERE is_starter = true
  AND is_active = true;
