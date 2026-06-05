-- Round-timing fields on classes
--
-- Adds three nullable timing columns so teachers can configure when a game
-- runs and how long each round lasts. All three are nullable: an unconfigured
-- class behaves exactly the same as before this migration. Teachers fill
-- them in via the settings UI built in the next session.
--
--   round_duration_hours -- uniform length of every round.
--                           1 = 1 hour, 24 = 1 day, 168 = 1 week.
--   game_starts_at       -- timestamp when round 1 opens. Before this, no
--                           rounds are live yet.
--   game_ends_at         -- timestamp when the game closes. After this, no
--                           new rounds open even if duration * N hasn't
--                           elapsed.
--
-- The "current round number" for a given class is computed at read-time:
--   floor((now() - game_starts_at) / round_duration_hours_as_interval) + 1
-- ...clamped to null when the game hasn't started or has ended.
--
-- We are intentionally NOT denormalizing round_number onto entries here.
-- Defer that until the read side actually needs it (and we've decided whether
-- a late upload counts toward the round that just closed, or the next one).

alter table public.classes
  add column round_duration_hours int,
  add column game_starts_at       timestamptz,
  add column game_ends_at         timestamptz;

-- Allowed durations: 1 hour / 1 day / 1 week. NULL allowed so existing rows
-- remain valid before the teacher configures the class. Loosenable later via
-- a follow-up migration if more durations are needed.
alter table public.classes
  add constraint classes_round_duration_hours_check
  check (round_duration_hours is null or round_duration_hours in (1, 24, 168));

-- game_ends_at must be strictly after game_starts_at when both are set.
-- Either being null is fine (teacher partially configured).
alter table public.classes
  add constraint classes_game_window_check
  check (
    game_starts_at is null
    or game_ends_at is null
    or game_ends_at > game_starts_at
  );

-- Index for "is this class currently running?" reads on the dashboard and
-- spotlight splash. Cheap to add now; will be hit on every page load that
-- shows a countdown.
create index if not exists classes_game_starts_at_idx
  on public.classes (game_starts_at);
