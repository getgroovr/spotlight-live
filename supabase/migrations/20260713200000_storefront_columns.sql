-- R2: Teacher Storefront — add display columns to classes
-- description: free-text blurb the teacher writes (shown on storefront cards)
-- time_slot:   human-readable schedule label like "Mon/Wed 3–4 PM" (shown on storefront cards)
-- Both are optional; the storefront renders fine without them.

ALTER TABLE classes ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS time_slot text;
