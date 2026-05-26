-- ════════════════════════════════════════════════════════════════════════
-- Migration 05 — sessions + session_comments (the CSV's real home)
-- ════════════════════════════════════════════════════════════════════════
-- Purpose:
--   A session is one player's playthrough (replaces the per-machine
--   localStorage saveProgress in the engine; the roaming save/resume seam).
--   session_comments holds the mandatory one-comment-per-video the engine
--   already collects — this is the teacher's CSV deliverable, unchanged.
--
--   buildSessionRows() / buildSessionCSV() in students.js produce columns:
--     player, session_date, video_student, video_number, video_date,
--     favorited, comment
--   Everything those columns need is derivable from a join of:
--     sessions (player, started_at) x session_comments (entry_id, comment,
--     favorited) x entries (uploaded_at) x profiles (the video's student name).
--   So the CSV deliverable survives online with no shape change — the adapter
--   builds the same rows from these tables instead of from React state.
--
-- Affected objects:
--   - table public.sessions          (new)
--   - table public.session_comments  (new)
-- ════════════════════════════════════════════════════════════════════════

-- ── sessions ──────────────────────────────────────────────────────────────
create table if not exists public.sessions (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.profiles (id) on delete cascade,
  class_id    uuid not null references public.classes  (id) on delete cascade,
  started_at  timestamptz not null default now(),
  finished_at timestamptz                              -- null until the playthrough completes
);

create index if not exists sessions_player_idx on public.sessions (player_id);
create index if not exists sessions_class_idx  on public.sessions (class_id);

comment on table  public.sessions is
  'One player playthrough of a class deck. Replaces per-machine localStorage (roaming save/resume seam).';
comment on column public.sessions.finished_at is 'Null while in progress; set when the player completes the deck.';

alter table public.sessions enable row level security;

-- ── session_comments ──────────────────────────────────────────────────────
-- The mandatory comment gate: one comment per video viewed. favorited feeds
-- the future live-celebration ("dance party"). entry_id pins the comment to
-- the EXACT entry the player saw (not just the student), so the CSV's
-- video_number / video_date are accurate even after the deck later rotates.
create table if not exists public.session_comments (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  entry_id    uuid not null references public.entries  (id) on delete cascade,
  comment     text not null,
  favorited   boolean not null default false,
  created_at  timestamptz not null default now(),
  -- One comment per (session, entry): re-commenting updates the same row
  -- (matches the engine, where myComments[studentId] is a single editable value).
  unique (session_id, entry_id)
);

create index if not exists session_comments_session_idx on public.session_comments (session_id);
create index if not exists session_comments_entry_idx   on public.session_comments (entry_id);

comment on table  public.session_comments is
  'The mandatory one-comment-per-video the engine collects; the teacher''s CSV deliverable. favorited feeds the future celebration.';
comment on column public.session_comments.entry_id is 'The exact entry viewed (keeps CSV video_number/video_date correct after deck rotation).';

alter table public.session_comments enable row level security;
