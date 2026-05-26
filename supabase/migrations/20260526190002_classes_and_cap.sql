-- ════════════════════════════════════════════════════════════════════════
-- Migration 02 — classes + the 9-student cap
-- ════════════════════════════════════════════════════════════════════════
-- Purpose:
--   A class is a deck owned by a teacher (BUILD_PLAN #1: a teacher owns one or
--   more classes; each class is its own deck). A student belongs to exactly one
--   class (#3), modeled as profiles.class_id — NOT a many-to-many table. The
--   3x3 grid is baked into the engine, so "at most 9 students per class" is a
--   real invariant we enforce in the DB (#2), not a UI nicety.
--
-- Affected objects:
--   - table public.classes               (new)
--   - column public.profiles.class_id     (new FK -> classes)
--   - function public.enforce_class_cap() + trigger on profiles (new)
--
-- Notes:
--   * className in the engine maps to classes.name; the engine's single TEACHER
--     becomes one classes row owned by a teacher profile.
--   * The cap is enforced on the student side (profiles.class_id) because that
--     is where membership actually lives in this one-class-per-student model.
-- ════════════════════════════════════════════════════════════════════════

-- ── classes ───────────────────────────────────────────────────────────────
create table if not exists public.classes (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles (id) on delete cascade,
  name        text not null,            -- engine's className, e.g. "ESL Conversation — Spring"
  created_at  timestamptz not null default now()
);

create index if not exists classes_teacher_id_idx on public.classes (teacher_id);

comment on table  public.classes is
  'A teacher-owned deck of up to nine student submissions. Maps to the engine''s single TEACHER + className.';
comment on column public.classes.teacher_id is 'Owning teacher (profiles.id with role=teacher; enforced by policy/trigger).';
comment on column public.classes.name       is 'Human class name (engine `className`).';

alter table public.classes enable row level security;

-- ── profiles.class_id (the one-class-per-student link) ────────────────────
alter table public.profiles
  add column if not exists class_id uuid references public.classes (id) on delete set null;

create index if not exists profiles_class_id_idx on public.profiles (class_id);

comment on column public.profiles.class_id is
  'The single class this student belongs to (one-class-per-student, BUILD_PLAN #3). Null for teachers and unassigned students.';

-- ── 9-students-per-class invariant ────────────────────────────────────────
-- Enforced via trigger because a plain CHECK can't count sibling rows.
-- Counts only STUDENT profiles against the cap; teachers don't occupy a slot.
create or replace function public.enforce_class_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cnt integer;
begin
  -- Only relevant when a student is being placed into a class.
  if new.class_id is null then
    return new;
  end if;

  -- On UPDATE, if class_id didn't change, no need to re-check.
  if tg_op = 'UPDATE'
     and old.class_id is not distinct from new.class_id then
    return new;
  end if;

  select count(*) into cnt
  from public.profiles p
  where p.class_id = new.class_id
    and p.role = 'student'
    and p.id <> new.id;

  if cnt >= 9 then
    raise exception
      'class % is full: a class may hold at most 9 students', new.class_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_class_cap on public.profiles;
create trigger profiles_class_cap
  before insert or update of class_id on public.profiles
  for each row execute function public.enforce_class_cap();
