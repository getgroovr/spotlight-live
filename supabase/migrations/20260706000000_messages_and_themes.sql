-- ─────────────────────────────────────────────────────────────────────────
-- Migration: messages table + game theme columns
-- Destination: supabase/migrations/20260706000000_messages_and_themes.sql
-- Session 77
-- ─────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════
-- 1. MESSAGES TABLE
-- ═══════════════════════════════════════════════════════════════════════
-- One-way short notes between users. No threading.
-- sender/recipient are profiles.id (= auth.users.id).
-- class_id gives context (which class this message relates to).
-- body limited to 280 chars at the app level.

CREATE TABLE IF NOT EXISTS messages (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id    uuid REFERENCES classes(id) ON DELETE SET NULL,
  body        text NOT NULL CHECK (char_length(body) <= 280),
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for fast inbox queries (recipient's unread, then all).
CREATE INDEX idx_messages_recipient ON messages (recipient_id, is_read, created_at DESC);

-- Index for sent-messages queries.
CREATE INDEX idx_messages_sender ON messages (sender_id, created_at DESC);

-- RLS: users can read messages they sent or received, insert messages
-- where they are the sender.
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY messages_select ON messages
  FOR SELECT USING (
    auth.uid() = sender_id OR auth.uid() = recipient_id
  );

CREATE POLICY messages_insert ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
  );

CREATE POLICY messages_update ON messages
  FOR UPDATE USING (
    auth.uid() = recipient_id
  )
  WITH CHECK (
    auth.uid() = recipient_id
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 2. GAME THEME COLUMNS
-- ═══════════════════════════════════════════════════════════════════════
-- Per-round themes on the games table. NULL = no theme for that round.
-- Teacher sets these in game config. Editable until a student submits
-- a photo for that round.

ALTER TABLE games ADD COLUMN IF NOT EXISTS theme_r1 text;
ALTER TABLE games ADD COLUMN IF NOT EXISTS theme_r2 text;
ALTER TABLE games ADD COLUMN IF NOT EXISTS theme_r3 text;
