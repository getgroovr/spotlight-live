-- Slice 1 / #27: round assignment for entries
--
-- classes.total_rounds: teacher-settable before game starts; NULL until configured.
-- entries.round_number: which round this entry is the student's submission for.
--   Computed at insert time by addEntry. Existing rows are backfilled to 1
--   (every pre-#27 entry was conceptually a pre-game upload = round 1).
--
-- Per-class round count is intentionally on `classes`, not derived from
-- (game_ends_at - game_starts_at) / round_duration_hours. game_ends_at is
-- effectively unused going forward: the game ends when the last round's
-- lock-time passes; no separate end-of-game timestamp is needed.

alter table public.classes
  add column total_rounds int
  check (total_rounds is null or (total_rounds > 0 and total_rounds <= 100));

alter table public.entries
  add column round_number int;

-- Backfill all existing entries to round 1, then enforce NOT NULL so future
-- inserts must set round_number explicitly (catches addEntry bugs early).
update public.entries
  set round_number = 1
  where round_number is null;

alter table public.entries
  alter column round_number set not null;

alter table public.entries
  add constraint entries_round_number_positive
  check (round_number > 0);

-- Index for the dashboard "Your photos by round" query (per-student, ordered).
create index entries_student_round_idx
  on public.entries (student_id, round_number);
