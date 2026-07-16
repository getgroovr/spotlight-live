-- ─────────────────────────────────────────────────────────────────────────
-- Session 90: Chunk J + Chunk K
--
-- Chunk J: Adds thread_context to messages for scoped threads
--          (e.g. 'schedule' for game schedule coordination).
--
-- Chunk K: Adds is_archived to messages so archiving a class can
--          also archive its associated messages.
--
-- Safe to re-run (IF NOT EXISTS / IF NOT).
-- ─────────────────────────────────────────────────────────────────────────

-- Chunk J: thread context for scoped message threads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'thread_context'
  ) THEN
    ALTER TABLE messages ADD COLUMN thread_context varchar(50) DEFAULT NULL;
  END IF;
END $$;

-- Chunk K: message archiving
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'is_archived'
  ) THEN
    ALTER TABLE messages ADD COLUMN is_archived boolean DEFAULT false;
  END IF;
END $$;
