-- ════════════════════════════════════════════════════════════════════════
-- Migration 03 — entries (the heart)
-- ════════════════════════════════════════════════════════════════════════
-- Purpose:
--   One row per submission = one "entry" in the engine's stack-of-entries
--   model. This table carries the whole creator payload and the status state
--   machine that does DOUBLE DUTY (BUILD_PLAN #4): it is BOTH the archive rule
--   AND the upload-approval gate, with the teacher as resolver.
--
--   status:
--     'pending'  — newly uploaded, awaiting teacher approval. NOT in the deck.
--     'live'     — approved and currently played by the game. entries[0].
--                  Exactly ONE live row per (student, class).
--     'archived' — a previously-live entry that a newer live one displaced.
--                  Its description stays welded to it forever (the archive rule).
--
--   The archive rule as a DB invariant: approving a new entry flips the old
--   live row to 'archived' and the new one to 'live' in one transaction
--   (done in the Server Action / approval RPC, migration 06). Each row keeps
--   its OWN description_text — nothing is ever re-associated.
--
--   media_type makes photos first-class (BUILD_PLAN #7): a 'photo' has no
--   duration; the player beat becomes "appear -> look -> comment".
--
-- Affected objects:
--   - type  public.media_type   (new: photo | video)
--   - type  public.entry_status (new: pending | live | archived)
--   - table public.entries      (new)
--   - unique partial index enforcing one live entry per student per class
--
-- Field mapping to the engine (students.js entry shape):
--   media_url         -> primary  (the played/looked-at media; REQUIRED)
--   media_type        -> (new) photo|video discriminator
--   description_url   -> description (OPTIONAL legacy extra VIDEO clip; may be null)
--   description_text  -> descriptionText (WRITTEN English blurb)
--   description_l1    -> descriptionL1 (DORMANT native-language seam)
--   reading_audio_url -> readingAudio (TEACHER-ONLY audio; RLS-locked in 07)
--   uploaded_at       -> uploadedAt
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_type where typname = 'media_type') then
    create type public.media_type as enum ('photo', 'video');
  end if;
  if not exists (select 1 from pg_type where typname = 'entry_status') then
    create type public.entry_status as enum ('pending', 'live', 'archived');
  end if;
end $$;

create table if not exists public.entries (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.profiles (id) on delete cascade,
  class_id          uuid not null references public.classes  (id) on delete cascade,

  media_url         text not null,                      -- the submission media (engine `primary`)
  media_type        public.media_type not null,         -- photo | video
  description_url   text,                                -- optional legacy extra video (engine `description`)
  description_text  text not null default '',            -- written English (engine `descriptionText`)
  description_l1    text not null default '',            -- DORMANT native-language (engine `descriptionL1`)
  reading_audio_url text,                                -- TEACHER-ONLY audio (engine `readingAudio`)

  status            public.entry_status not null default 'pending',
  uploaded_at       timestamptz not null default now(),  -- engine `uploadedAt`
  reviewed_by       uuid references public.profiles (id),-- teacher who approved/archived
  reviewed_at       timestamptz
);

create index if not exists entries_student_class_idx on public.entries (student_id, class_id);
create index if not exists entries_class_status_idx  on public.entries (class_id, status);

-- ── The "exactly one live per student per class" invariant ────────────────
-- A partial unique index: at most one row with status='live' per
-- (student_id, class_id). Pending and archived rows are unconstrained, so a
-- student can have many archived entries and a pending one waiting for review,
-- but never two live at once.
create unique index if not exists entries_one_live_per_student_class
  on public.entries (student_id, class_id)
  where status = 'live';

comment on table  public.entries is
  'One submission per row (engine stack-of-entries). status is BOTH the archive rule and the upload-approval gate (BUILD_PLAN #4). Exactly one live row per student per class.';
comment on column public.entries.media_url         is 'Submission media path in the `media` storage bucket (engine `primary`). REQUIRED.';
comment on column public.entries.media_type        is 'photo | video. Photos have no duration (BUILD_PLAN #7).';
comment on column public.entries.description_url    is 'Optional legacy extra VIDEO clip (engine `description`). May be null.';
comment on column public.entries.description_text   is 'Written English blurb (engine `descriptionText`).';
comment on column public.entries.description_l1     is 'DORMANT native-language text; translation seam (engine `descriptionL1`).';
comment on column public.entries.reading_audio_url  is 'TEACHER-ONLY audio path in `reading-audio` bucket (engine `readingAudio`). RLS-locked.';
comment on column public.entries.status             is 'pending (awaiting teacher) | live (in deck, exactly one per student/class) | archived (displaced, description welded).';

alter table public.entries enable row level security;
