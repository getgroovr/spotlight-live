-- ════════════════════════════════════════════════════════════════════════
-- Migration 09 — teacher roster RPC
-- ════════════════════════════════════════════════════════════════════════
-- Purpose:
--   The self-update RLS policy (migration 07) deliberately forbids a user from
--   changing their own role or class_id (anti-escalation). So placing a student
--   into a class must go through a privileged, audited path. This RPC is that
--   path: a TEACHER assigns a student to a class the teacher owns. It runs
--   SECURITY DEFINER (bypassing the self-update restriction) but authorizes the
--   caller itself, so it's safe to expose to the `authenticated` role.
--
--   It also sets the student's role to 'student' (idempotent) and respects the
--   9-student cap (the profiles trigger still fires, so an over-cap assignment
--   raises just as it would on a direct update).
--
-- Affected objects:
--   - function public.assign_student_to_class(uuid, uuid) (new RPC)
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.assign_student_to_class(
  p_student_id uuid,
  p_class_id   uuid
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.profiles;
begin
  -- Authorize: caller must be the teacher who owns the target class.
  if not public.owns_class(p_class_id) then
    raise exception 'not authorized: you do not own class %', p_class_id
      using errcode = 'insufficient_privilege';
  end if;

  -- Don't let a teacher be demoted into a student slot by mistake.
  if public.is_teacher(p_student_id) then
    raise exception 'target % is a teacher and cannot be placed as a student', p_student_id
      using errcode = 'check_violation';
  end if;

  -- The 9-student cap trigger on profiles fires here and will raise if full.
  update public.profiles
     set role = 'student',
         class_id = p_class_id
   where id = p_student_id
  returning * into result;

  if not found then
    raise exception 'student profile % not found', p_student_id
      using errcode = 'no_data_found';
  end if;

  return result;
end;
$$;

comment on function public.assign_student_to_class(uuid, uuid) is
  'Teacher roster action: assigns a student to a class the caller owns (role=student, class_id set). The audited path around the anti-escalation self-update RLS. Respects the 9-student cap.';

-- Let signed-in users CALL it (the function authorizes the caller internally).
grant execute on function public.assign_student_to_class(uuid, uuid) to authenticated;
