-- ─────────────────────────────────────────────────────────────────────────
-- create-class-requests-table.sql
--
-- Migration: class_requests table for C4 — teacher → admin class request
-- workflow. Teachers click "Request new class", admin sees it and
-- approves (auto-creates class) or denies.
--
-- Run this once in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS class_requests (
  id            UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id    UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status        TEXT         NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'denied')),
  requested_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  reviewed_by   UUID         REFERENCES profiles(id),
  reviewed_at   TIMESTAMPTZ,
  admin_note    TEXT,
  created_class_id UUID      REFERENCES classes(id)
);

-- Index for fast lookups by teacher + status
CREATE INDEX IF NOT EXISTS idx_class_requests_teacher
  ON class_requests(teacher_id, status);

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE class_requests ENABLE ROW LEVEL SECURITY;

-- Teachers can see their own requests
CREATE POLICY "Teachers view own requests"
  ON class_requests FOR SELECT
  USING (auth.uid() = teacher_id);

-- Teachers can insert their own requests
CREATE POLICY "Teachers insert own requests"
  ON class_requests FOR INSERT
  WITH CHECK (auth.uid() = teacher_id);

-- Admins can do everything
CREATE POLICY "Admins manage all requests"
  ON class_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );
