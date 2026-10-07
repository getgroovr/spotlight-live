-- Migration: starter_assignments junction table + recruiting_levels
--
-- Allows sharing starter photos across classes and independent
-- recruiting warmup control per ESL level.
--
-- DESTINATION: supabase/migrations/20260801120000_starter_assignments.sql

-- ── 1. Junction table: share starters across classes ────────────────────
CREATE TABLE IF NOT EXISTS starter_assignments (
  entry_id   UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  class_id   UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, class_id)
);

-- ── 2. Recruiting warmup levels on entries ──────────────────────────────
-- Array of level strings: e.g. {'beginner','advanced'}
-- Controls which anonymous warmups this photo appears in.
ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS recruiting_levels text[] NOT NULL DEFAULT '{}';

-- ── 3. RLS for starter_assignments ──────────────────────────────────────
ALTER TABLE starter_assignments ENABLE ROW LEVEL SECURITY;

-- Teachers can read + manage assignments for their own starters
CREATE POLICY "teacher_own_starter_assignments"
  ON starter_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM entries e
      WHERE e.id = starter_assignments.entry_id
        AND e.student_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM entries e
      WHERE e.id = starter_assignments.entry_id
        AND e.student_id = auth.uid()
    )
  );

-- Service role bypasses RLS, but add a permissive policy for safety
CREATE POLICY "service_role_starter_assignments"
  ON starter_assignments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 4. Backfill: assignment rows for existing starters ──────────────────
-- Every existing starter gets an assignment to its current class.
INSERT INTO starter_assignments (entry_id, class_id, is_active)
SELECT e.id, e.class_id, COALESCE(e.is_active, true)
FROM entries e
WHERE e.is_starter = true
  AND e.class_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── 5. Backfill: recruiting_levels for active starters in recruiting classes
-- If a starter is active (is_active=true) and its class is currently
-- recruiting, add the class's level to the starter's recruiting_levels.
UPDATE entries e
SET recruiting_levels = ARRAY[c.level]
FROM classes c
WHERE e.class_id = c.id
  AND e.is_starter = true
  AND COALESCE(e.is_active, true) = true
  AND c.is_recruiting = true
  AND c.level IS NOT NULL;
