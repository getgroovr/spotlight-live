-- ─────────────────────────────────────────────────────────────────────────
-- CHUNK D1 MIGRATION: Round phase timing
--
-- Splits round_duration_hours into game_phase_hours + review_phase_hours.
-- Both admin_settings (multi-teacher push source) and classes (per-class
-- actual values) get the new columns.
--
-- games.current_round_phase tracks whether a round is in the game or
-- review phase. Values: 'game' (submissions open), 'review' (teacher
-- reviewing).
--
-- Run this in the Supabase SQL Editor BEFORE deploying the updated code.
-- ─────────────────────────────────────────────────────────────────────────

-- Admin settings: source of truth for multi-teacher mode push
ALTER TABLE admin_settings ADD COLUMN game_phase_hours numeric;
ALTER TABLE admin_settings ADD COLUMN review_phase_hours numeric;

-- Classes: per-class values (populated by admin push or solo teacher save)
ALTER TABLE classes ADD COLUMN game_phase_hours numeric;
ALTER TABLE classes ADD COLUMN review_phase_hours numeric;

-- Games: track current round phase
ALTER TABLE games ADD COLUMN current_round_phase varchar(10) DEFAULT 'game';
-- Values: 'game' (submissions open), 'review' (teacher reviewing)
