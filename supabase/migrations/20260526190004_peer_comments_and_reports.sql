-- ════════════════════════════════════════════════════════════════════════
-- Migration 04 — peer_comments (dormant) + reports
-- ════════════════════════════════════════════════════════════════════════
-- Purpose:
--   peer_comments: classmate comments on a student's spotlight. Dormant until
--   the engine flips SOCIAL=true. Built now so turning SOCIAL on is config, not
--   schema work. Carries the moderation status machinery (BUILD_PLAN #4): for
--   the adult community the default path is student report + teacher resolution
--   rather than pre-moderation, but the status column makes pre-moderation a
--   cheap later toggle.
--
--   reports: a flag/report path resolved by the teacher. The single moderation
--   mechanism (status + teacher resolver) reused across content types.
--
-- Engine mapping (students.js peer comment shape):
--   author_id  -> author      (we store the id; the adapter resolves to a name)
--   text       -> text
--   video_url  -> videoUrl    (optional video reply)
--   created_at -> createdAt
--   subject_id -> (whose spotlight it's about) — peer comments attach to the
--                 STUDENT, matching the engine note "about Maria's clip".
--
-- Affected objects:
--   - type  public.moderation_status (new: pending | approved | removed)
--   - type  public.report_target     (new: comment | entry | profile)
--   - table public.peer_comments     (new)
--   - table public.reports           (new)
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_type where typname = 'moderation_status') then
    create type public.moderation_status as enum ('pending', 'approved', 'removed');
  end if;
  if not exists (select 1 from pg_type where typname = 'report_target') then
    create type public.report_target as enum ('comment', 'entry', 'profile');
  end if;
end $$;

-- ── peer_comments ─────────────────────────────────────────────────────────
create table if not exists public.peer_comments (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles (id) on delete cascade,  -- who wrote it
  subject_id  uuid not null references public.profiles (id) on delete cascade,  -- whose spotlight
  class_id    uuid not null references public.classes  (id) on delete cascade,
  text        text not null,
  video_url   text,                                  -- optional video reply (engine `videoUrl`)
  status      public.moderation_status not null default 'approved',
  -- default 'approved' matches the adult-community report-after model; flip the
  -- default to 'pending' to switch to pre-moderation without a schema change.
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists peer_comments_subject_idx on public.peer_comments (subject_id, class_id);
create index if not exists peer_comments_status_idx  on public.peer_comments (class_id, status);

comment on table  public.peer_comments is
  'Classmate comments on a student spotlight. Dormant until engine SOCIAL=true. status carries the moderation machinery (BUILD_PLAN #4).';
comment on column public.peer_comments.subject_id is 'Whose spotlight the comment is about (engine attaches peer comments to the STUDENT).';
comment on column public.peer_comments.status     is 'approved (adult report-after default) | pending (if pre-moderation enabled) | removed.';

alter table public.peer_comments enable row level security;

-- ── reports ───────────────────────────────────────────────────────────────
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  class_id     uuid references public.classes (id) on delete cascade,
  target_type  public.report_target not null,        -- comment | entry | profile
  target_id    uuid not null,                         -- id of the flagged row (polymorphic)
  reason       text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles (id)
);

create index if not exists reports_open_idx on public.reports (class_id) where resolved_at is null;

comment on table  public.reports is
  'Flag/report path resolved by the teacher (BUILD_PLAN #4). Polymorphic target via (target_type, target_id).';
comment on column public.reports.target_type is 'What was flagged: comment | entry | profile.';
comment on column public.reports.resolved_at is 'Null = open; set when the teacher resolves.';

alter table public.reports enable row level security;
