-- Session 81: Class request name + teacher mode preferences
--
-- 1. class_requests.class_name — teacher names their class at request time.
-- 2. teacher_rotation.willing_trio / willing_nine — teacher opts in to
--    trio (3) and/or nine (9) warmup modes. Solo is mandatory (no flag).
--    These determine queue eligibility for multi-teacher warmups.

ALTER TABLE class_requests ADD COLUMN class_name varchar(100);

ALTER TABLE teacher_rotation ADD COLUMN willing_trio boolean NOT NULL DEFAULT false;
ALTER TABLE teacher_rotation ADD COLUMN willing_nine boolean NOT NULL DEFAULT false;
