-- ════════════════════════════════════════════════════════════════════════
-- Migration 01 — profiles + role layer
-- ════════════════════════════════════════════════════════════════════════
-- Purpose:
--   Adapt the leftover groovr-creator `profiles` table into the Spotlight
--   shape. Adds the role layer (teacher | student) that BUILD_PLAN decision #1
--   requires ("MULTIPLE teachers"), the engine's per-student `color` and `bio`,
--   and the `class_id` that ties a student to exactly one class (decision #3,
--   "one class per student"). Carries the 18+ affirmation the signup gate
--   already collects (decision #4, adult-affirmation moderation model).
--
-- Affected objects:
--   - type  public.user_role  (new)
--   - table public.profiles   (adapted: add columns, keep existing data shape)
--   - function public.handle_new_user() + trigger on auth.users (new)
--
-- Notes:
--   * The existing groovr `profiles` already carries id, display_name, bio,
--     avatar_url, is_18_plus, created_at. We ADD to it, we do not drop it, so
--     the single "Mister D" test row (slated for manual deletion by the owner)
--     survives the migration harmlessly.
--   * `class_id` FK is added LATER (migration 02) once `classes` exists, to
--     avoid a forward reference. Here we only add the column placeholder is not
--     needed — we add the whole FK in 02 where it reads cleanly.
--   * RLS is enabled here; teacher/cross-table policies that depend on other
--     tables are deferred to migration 07 (policies) so all tables exist first.
-- ════════════════════════════════════════════════════════════════════════

-- ── Role enum ───────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('teacher', 'student');
  end if;
end $$;

-- ── profiles: adapt the existing table (additive, idempotent) ─────────────
-- The table already exists from groovr-creator. Guard each column so this
-- migration is safe whether the table is the leftover one or a fresh create.
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now()
);

alter table public.profiles
  add column if not exists role          public.user_role not null default 'student',
  add column if not exists display_name  text,
  add column if not exists color         text,   -- engine's per-student accent (hex)
  add column if not exists bio           text,   -- engine's one-line profile bio
  add column if not exists avatar_url    text,   -- engine's optional avatar
  add column if not exists is_18_plus    boolean not null default false;

-- class_id is added in migration 02 (needs public.classes to exist first).

-- A student's accent color, when set, should look like a hex value. Loose
-- check (engine tolerates absence and falls back to a colored initial).
alter table public.profiles
  drop constraint if exists profiles_color_hex_chk;
alter table public.profiles
  add constraint profiles_color_hex_chk
  check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');

comment on table  public.profiles is
  'One row per auth user. role distinguishes teachers from students; color/bio/avatar_url feed the engine profile card; class_id (added in 02) ties a student to one class.';
comment on column public.profiles.role       is 'teacher | student — the account role layer above classes.';
comment on column public.profiles.color      is 'Student accent color as #RRGGBB (engine `color`). Null = engine draws a colored initial.';
comment on column public.profiles.bio        is 'One-line bio shown on the profile reveal card (engine `bio`).';
comment on column public.profiles.is_18_plus is 'Adult affirmation captured at signup (primary moderation safeguard, BUILD_PLAN #4).';

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- Everyone signed in can read profiles (the game needs names/colors/bios of
-- classmates). Tightened, write-side, and teacher-scope policies live in 07.
drop policy if exists "profiles: read for authenticated" on public.profiles;
create policy "profiles: read for authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- A user may update only their OWN profile row (role changes are blocked in 07).
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ── Auto-provision a profile row when an auth user is created ─────────────
-- Signup (src/app/auth/signup/page.tsx) calls supabase.auth.signUp and does
-- NOT itself insert a profiles row, so we create one via trigger. New users
-- default to role 'student'; the 18+ affirmation can be passed through signup
-- metadata (raw_user_meta_data->>'is_18_plus') and is reflected here.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, is_18_plus)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'is_18_plus')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
