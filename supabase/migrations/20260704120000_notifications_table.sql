-- ─────────────────────────────────────────────────────────────────────────
-- Migration: Notification Notes (Session 75 — C5)
--
-- One-way notes between teachers/admin ↔ students. No threading.
-- Notes appear as a badge + list on the recipient's dashboard.
-- read_at NULL = unread; timestamped = read.
--
-- Sender/recipient are both profiles.id (auth user UUIDs).
-- class_id is optional context — scopes the note to a class so the
-- recipient's dashboard can group or filter by class.
-- note_type lets the UI render different styles (general note vs
-- system-generated notifications like entry rejection).
-- ─────────────────────────────────────────────────────────────────────────

-- ── Table ────────────────────────────────────────────────────────────────

CREATE TABLE notifications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id      uuid        REFERENCES classes(id) ON DELETE SET NULL,
  body          text        NOT NULL CHECK (char_length(body) <= 500),
  note_type     text        NOT NULL DEFAULT 'general'
                            CHECK (note_type IN (
                              'general',            -- free-form note
                              'entry_rejected',     -- auto: photo was rejected
                              'entry_approved',     -- auto: photo was approved
                              'comment_rejected',   -- auto: favorite comment rejected
                              'comment_approved',   -- auto: favorite comment approved
                              'class_approved',     -- auto: class request approved
                              'class_denied'        -- auto: class request denied
                            )),
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────

-- Recipient inbox: unread first, newest first
CREATE INDEX idx_notifications_recipient
  ON notifications (recipient_id, read_at NULLS FIRST, created_at DESC);

-- Sender outbox (admin/teacher reviewing sent notes)
CREATE INDEX idx_notifications_sender
  ON notifications (sender_id, created_at DESC);

-- Class-scoped lookups
CREATE INDEX idx_notifications_class
  ON notifications (class_id, created_at DESC)
  WHERE class_id IS NOT NULL;

-- ── RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Recipients can read their own notifications
CREATE POLICY "Recipients can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = recipient_id);

-- Senders can view notes they sent
CREATE POLICY "Senders can view own sent notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = sender_id);

-- Teachers can send to students in their classes;
-- admins can send to anyone.
-- (INSERT enforced at the application layer via server actions,
-- not wide-open RLS. Service role key bypasses RLS anyway.)
CREATE POLICY "Authenticated users can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Recipients can mark their own notifications as read
CREATE POLICY "Recipients can mark as read"
  ON notifications FOR UPDATE
  USING (auth.uid() = recipient_id)
  WITH CHECK (
    auth.uid() = recipient_id
    -- Only allow updating read_at (not body, sender, etc.)
    -- Supabase UPDATE policies can't restrict columns directly,
    -- so the server action should only SET read_at.
  );

-- No one deletes notifications (admin can via service role)
-- If you want recipients to dismiss: add a dismissed_at column instead.


-- ═════════════════════════════════════════════════════════════════════════
-- HOW TO RUN
-- ═════════════════════════════════════════════════════════════════════════
--
-- Option A — Supabase Dashboard:
--   SQL Editor → paste this file → Run
--
-- Option B — CLI:
--   supabase db reset   (if local)
--   supabase migration new create-notifications-table
--   paste into the generated file, then: supabase db push
--
-- ═════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ═════════════════════════════════════════════════════════════════════════
--
-- After running, confirm:
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name = 'notifications'
--   ORDER BY ordinal_position;
--
-- Expected: id, sender_id, recipient_id, class_id, body, note_type,
--           read_at, created_at
-- ═════════════════════════════════════════════════════════════════════════
