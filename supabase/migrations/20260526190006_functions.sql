-- ════════════════════════════════════════════════════════════════════════
-- Migration 06 — helper functions (role checks + atomic approve RPC)
-- ════════════════════════════════════════════════════════════════════════
-- Purpose:
--   1. Small SECURITY DEFINER helpers used by RLS policies in migration 07.
--      Centralizing "is this user a teacher?" / "does this teacher own this
--      class?" keeps the policies readable and avoids recursive RLS lookups.
--   2. approve_entry(): the archive rule as an atomic DB operation. The teacher
--      approves a pending entry; in ONE transaction the current live entry for
--      that (student, class) flips to 'archived' (its description welded to it)
--      and the pending entry flips to 'live'. This is what BUILD_PLAN means by
--      "the archive rule becomes a DB invariant, not a hand-edited array."
--
-- Affected objects:
--   - function public.is_teacher(uuid)            (new)
--   - function public.owns_class(uuid)            (new)
--   - function public.my_class_id()               (new)
--   - function public.approve_entry(uuid)         (new RPC)
-- ════════════════════════════════════════════════════════════════════════

-- Is the given user (default: caller) a teacher?
create or replace function public.is_teacher(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'teacher'
  );
$$;

-- Does the CALLER own the given class (as its teacher)?
create or replace function public.owns_class(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.classes c
    where c.id = cid and c.teacher_id = auth.uid()
  );
$$;

-- The caller's own class_id (for student-scoped read policies).
create or replace function public.my_class_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select class_id from public.profiles where id = auth.uid();
$$;

-- ── approve_entry — the archive rule, atomic ──────────────────────────────
-- Only the owning teacher of the entry's class may call this. Flips the
-- existing live entry (if any) to archived, then promotes the target to live.
-- Runs as a single statement-pair inside the function's transaction, so the
-- "exactly one live" partial unique index is never violated mid-flight
-- (archive-first, then promote).
create or replace function public.approve_entry(p_entry_id uuid)
returns public.entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.entries;
  result public.entries;
begin
  select * into e from public.entries where id = p_entry_id;
  if not found then
    raise exception 'entry % not found', p_entry_id using errcode = 'no_data_found';
  end if;

  -- Authorize: caller must be the teacher who owns the entry's class.
  if not public.owns_class(e.class_id) then
    raise exception 'not authorized to approve entries in this class'
      using errcode = 'insufficient_privilege';
  end if;

  if e.status <> 'pending' then
    raise exception 'entry % is not pending (status=%)', p_entry_id, e.status
      using errcode = 'check_violation';
  end if;

  -- 1. Archive the currently-live entry for this student in this class.
  --    Its description_text stays on its own row — never re-associated.
  update public.entries
     set status = 'archived',
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where student_id = e.student_id
     and class_id   = e.class_id
     and status     = 'live';

  -- 2. Promote the pending entry to live.
  update public.entries
     set status = 'live',
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_entry_id
  returning * into result;

  return result;
end;
$$;

comment on function public.approve_entry(uuid) is
  'Teacher approves a pending entry: archives the prior live entry (description welded) and promotes the pending one to live, atomically. The archive rule as a DB invariant.';
