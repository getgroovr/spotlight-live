-- ═══════════════════════════════════════════════════════════════
-- Fix: class_requests.created_class_id FK — ON DELETE SET NULL
--
-- Problem: Deleting a class fails with:
--   "violates foreign key constraint class_requests_created_class_id_fkey"
--   because class_requests rows reference the class being deleted.
--
-- Fix: Drop the existing FK and re-add with ON DELETE SET NULL.
--   When a class is deleted, any class_request that pointed to it
--   simply gets its created_class_id set to NULL — the request
--   record is preserved (for history) but no longer blocks deletion.
--
-- Safe to run multiple times (idempotent).
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE class_requests
  DROP CONSTRAINT IF EXISTS class_requests_created_class_id_fkey;

ALTER TABLE class_requests
  ADD CONSTRAINT class_requests_created_class_id_fkey
  FOREIGN KEY (created_class_id)
  REFERENCES classes(id)
  ON DELETE SET NULL;
