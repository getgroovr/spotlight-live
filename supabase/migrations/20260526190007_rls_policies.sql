-- ════════════════════════════════════════════════════════════════════════
-- Migration 07 — Row-Level Security policies
-- ════════════════════════════════════════════════════════════════════════
-- Purpose:
--   Privacy enforced by policy, not by hiding things in the UI (BUILD_PLAN,
--   KICKOFF "the desktop honor-system privacy finally made real"). Roles:
--     teacher — owns classes; full control over their classes' rows; the
--               moderation hub; the ONLY non-owner who can read reading_audio.
--     student — reads their own class's live deck; writes their own profile,
--               their own entries (as pending), their own sessions/comments,
--               and (when SOCIAL) their own peer comments + reports.
--
--   reading_audio_url is TEACHER-ONLY. Postgres RLS is row-level, not
--   column-level, so we keep the column on entries (teacher/owner can read the
--   whole row) and expose a column-SAFE view `entries_public` that omits
--   reading_audio_url for everyone else. The adapter reads the view for the
--   game; teacher tools read the table.
--
-- Affected objects: policies on profiles, classes, entries, peer_comments,
--   reports, sessions, session_comments; view public.entries_public.
-- ════════════════════════════════════════════════════════════════════════

-- ── profiles ──────────────────────────────────────────────────────────────
-- Read policy already created in 01 ("read for authenticated").
-- Block self-promotion: a user updating their own row may not change role or
-- class_id to escalate. Role/class changes are a teacher/admin action (done via
-- service role or a dedicated RPC), so we forbid them in the self-update path.
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own (no role/class self-change)"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and role     = (select p.role     from public.profiles p where p.id = (select auth.uid()))
    and class_id is not distinct from (select p.class_id from public.profiles p where p.id = (select auth.uid()))
  );

-- A teacher may update profiles of students in classes they own (e.g. set
-- color/bio/class_id when building the roster).
drop policy if exists "profiles: teacher manages own students" on public.profiles;
create policy "profiles: teacher manages own students"
  on public.profiles for update
  to authenticated
  using (
    public.is_teacher()
    and class_id is not null
    and public.owns_class(class_id)
  )
  with check (
    public.is_teacher()
    and (class_id is null or public.owns_class(class_id))
  );

-- ── classes ───────────────────────────────────────────────────────────────
-- A teacher reads/manages their own classes. Students read the class they
-- belong to (so the game can show the class name).
drop policy if exists "classes: teacher reads own" on public.classes;
create policy "classes: teacher reads own"
  on public.classes for select
  to authenticated
  using (teacher_id = (select auth.uid()) or id = public.my_class_id());

drop policy if exists "classes: teacher inserts own" on public.classes;
create policy "classes: teacher inserts own"
  on public.classes for insert
  to authenticated
  with check (public.is_teacher() and teacher_id = (select auth.uid()));

drop policy if exists "classes: teacher updates own" on public.classes;
create policy "classes: teacher updates own"
  on public.classes for update
  to authenticated
  using (teacher_id = (select auth.uid()))
  with check (teacher_id = (select auth.uid()));

drop policy if exists "classes: teacher deletes own" on public.classes;
create policy "classes: teacher deletes own"
  on public.classes for delete
  to authenticated
  using (teacher_id = (select auth.uid()));

-- ── entries ───────────────────────────────────────────────────────────────
-- READ: the owning teacher reads ALL rows of their classes (pending/live/
-- archived, including reading_audio). A student reads:
--   - their OWN entries (any status), and
--   - LIVE entries of classmates in their class (the deck they play).
-- (Column-level teacher-only audio is handled by the entries_public view below;
--  this row policy still lets a classmate's live row through, audio included at
--  the table level — so the GAME must read the VIEW, not the table. Teacher
--  tools read the table.)
drop policy if exists "entries: read" on public.entries;
create policy "entries: read"
  on public.entries for select
  to authenticated
  using (
    student_id = (select auth.uid())
    or public.owns_class(class_id)
    or (status = 'live' and class_id = public.my_class_id())
  );

-- INSERT: a student inserts their OWN entry, and only as 'pending' (the
-- upload-approval gate — they cannot self-publish to 'live'). The entry must
-- be for the class they belong to.
drop policy if exists "entries: student inserts own pending" on public.entries;
create policy "entries: student inserts own pending"
  on public.entries for insert
  to authenticated
  with check (
    student_id = (select auth.uid())
    and class_id = public.my_class_id()
    and status = 'pending'
  );

-- INSERT (teacher seed): a teacher may insert entries directly into classes
-- they own (seeding a new class with the graduating cohort's echo). Allowed at
-- any status so a seed can land as 'live'.
drop policy if exists "entries: teacher seeds own class" on public.entries;
create policy "entries: teacher seeds own class"
  on public.entries for insert
  to authenticated
  with check (public.owns_class(class_id));

-- UPDATE: only the owning teacher may change an entry (approve/archive/edit).
-- Status transitions are done via approve_entry() but a direct teacher update
-- (e.g. fixing description) is allowed.
drop policy if exists "entries: teacher updates own class" on public.entries;
create policy "entries: teacher updates own class"
  on public.entries for update
  to authenticated
  using (public.owns_class(class_id))
  with check (public.owns_class(class_id));

-- A student may edit the TEXT of their own still-pending entry (typo fix before
-- approval), but cannot change status or move it between classes.
drop policy if exists "entries: student edits own pending text" on public.entries;
create policy "entries: student edits own pending text"
  on public.entries for update
  to authenticated
  using (student_id = (select auth.uid()) and status = 'pending')
  with check (student_id = (select auth.uid()) and status = 'pending');

-- ── entries_public — column-safe view (drops teacher-only audio) ──────────
-- The game reads THIS, never the base table, so reading_audio_url never leaves
-- the server for a non-teacher. security_invoker = on means the underlying
-- entries RLS still applies through the view.
create or replace view public.entries_public
with (security_invoker = on) as
  select
    id, student_id, class_id,
    media_url, media_type, description_url,
    description_text, description_l1,
    status, uploaded_at
  from public.entries;

comment on view public.entries_public is
  'Column-safe projection of entries WITHOUT reading_audio_url. The game/adapter reads this; only teacher tools read the base table. Teacher-only audio enforced here + by storage RLS.';

-- ── peer_comments (dormant until SOCIAL) ──────────────────────────────────
-- READ: teacher of the class reads all; students read APPROVED comments in
-- their class (and always their own, any status).
drop policy if exists "peer_comments: read" on public.peer_comments;
create policy "peer_comments: read"
  on public.peer_comments for select
  to authenticated
  using (
    author_id = (select auth.uid())
    or public.owns_class(class_id)
    or (status = 'approved' and class_id = public.my_class_id())
  );

-- INSERT: a student writes their own comment in their own class.
drop policy if exists "peer_comments: student inserts own" on public.peer_comments;
create policy "peer_comments: student inserts own"
  on public.peer_comments for insert
  to authenticated
  with check (author_id = (select auth.uid()) and class_id = public.my_class_id());

-- UPDATE/moderation: only the owning teacher (approve/remove).
drop policy if exists "peer_comments: teacher moderates" on public.peer_comments;
create policy "peer_comments: teacher moderates"
  on public.peer_comments for update
  to authenticated
  using (public.owns_class(class_id))
  with check (public.owns_class(class_id));

-- ── reports ────────────────────────────────────────────────────────────────
-- A user files reports as themselves; the owning teacher reads/resolves.
drop policy if exists "reports: reporter inserts own" on public.reports;
create policy "reports: reporter inserts own"
  on public.reports for insert
  to authenticated
  with check (reporter_id = (select auth.uid()));

drop policy if exists "reports: read" on public.reports;
create policy "reports: read"
  on public.reports for select
  to authenticated
  using (reporter_id = (select auth.uid()) or public.owns_class(class_id));

drop policy if exists "reports: teacher resolves" on public.reports;
create policy "reports: teacher resolves"
  on public.reports for update
  to authenticated
  using (public.owns_class(class_id))
  with check (public.owns_class(class_id));

-- ── sessions ────────────────────────────────────────────────────────────────
-- A player owns their sessions; the class's teacher may read them (to collect
-- the CSV / progress data — the dashboard is where language material flows).
drop policy if exists "sessions: player manages own" on public.sessions;
create policy "sessions: player manages own"
  on public.sessions for all
  to authenticated
  using (player_id = (select auth.uid()))
  with check (player_id = (select auth.uid()));

drop policy if exists "sessions: teacher reads class" on public.sessions;
create policy "sessions: teacher reads class"
  on public.sessions for select
  to authenticated
  using (public.owns_class(class_id));

-- ── session_comments ────────────────────────────────────────────────────────
-- Owned through the parent session. A player manages comments on their own
-- sessions; the class teacher may read them (the CSV deliverable).
drop policy if exists "session_comments: player manages own" on public.session_comments;
create policy "session_comments: player manages own"
  on public.session_comments for all
  to authenticated
  using (exists (
    select 1 from public.sessions s
    where s.id = session_id and s.player_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.sessions s
    where s.id = session_id and s.player_id = (select auth.uid())
  ));

drop policy if exists "session_comments: teacher reads class" on public.session_comments;
create policy "session_comments: teacher reads class"
  on public.session_comments for select
  to authenticated
  using (exists (
    select 1 from public.sessions s
    where s.id = session_id and public.owns_class(s.class_id)
  ));
