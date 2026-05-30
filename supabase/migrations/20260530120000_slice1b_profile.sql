-- ─────────────────────────────────────────────────────────────────────
-- Slice 1B profile groundwork
--   • students.screen_name        — public display name (classmates see this)
--   • students.name               — now optional at the front door; the
--                                   student fills it in on their profile
--   • game_sessions.favorite_comment — the "why was this your favorite?" note
--   • teacher_comments            — teacher → student notes. Created empty
--                                   now so the profile has something to read;
--                                   the teacher dashboard writes to it next slice.
-- ─────────────────────────────────────────────────────────────────────

-- 1. Profile fields on students
alter table public.students
  add column if not exists screen_name text;

-- name is collected on the profile now, not at the front door
alter table public.students
  alter column name drop not null;

-- 2. The favorite "why" note lives on the round's session row
alter table public.game_sessions
  add column if not exists favorite_comment text;

-- 3. Teacher → student notes
create table if not exists public.teacher_comments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id)  on delete cascade,
  class_id    uuid not null references public.classes(id)   on delete cascade,
  round       int,                       -- null = general / welcome note
  body        text not null,
  created_at  timestamptz not null default now()
);

alter table public.teacher_comments enable row level security;

-- Student can read notes addressed to them (their email → their student row)
create policy "student reads own teacher comments"
  on public.teacher_comments for select
  using (
    student_id in (select s.id from public.students s where s.email = auth.email())
  );

-- Teacher can read notes for students in classes they own
create policy "teacher reads class teacher comments"
  on public.teacher_comments for select
  using (
    class_id in (select c.id from public.classes c where c.teacher_id = auth.uid())
  );

-- Teacher can write notes for students in classes they own
create policy "teacher writes class teacher comments"
  on public.teacher_comments for insert
  with check (
    class_id in (select c.id from public.classes c where c.teacher_id = auth.uid())
  );
