-- Session 79: Class archiving
-- Adds is_archived flag and archived_at timestamp to classes table.
-- Supports manual archive/unarchive by teacher and auto-archive on game completion.

ALTER TABLE classes ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE classes ADD COLUMN archived_at timestamptz;
