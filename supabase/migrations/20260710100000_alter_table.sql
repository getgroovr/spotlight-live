-- Migration: Chunk 1.5 — Class request flow + mode preferences
-- Destination: supabase/migrations/20260709100000_class_request_and_mode_prefs.sql

-- Add class name to class requests so teachers can name their class when requesting
ALTER TABLE class_requests ADD COLUMN IF NOT EXISTS class_name varchar(100);

-- Add mode preference flags to teacher_rotation
-- Solo is mandatory (no column needed). Trio and nine are opt-in.
ALTER TABLE teacher_rotation ADD COLUMN IF NOT EXISTS willing_trio boolean NOT NULL DEFAULT false;
ALTER TABLE teacher_rotation ADD COLUMN IF NOT EXISTS willing_nine boolean NOT NULL DEFAULT false;
