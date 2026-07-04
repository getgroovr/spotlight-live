-- ═══════════════════════════════════════════════════════════════
-- Migration: 20260703000000_auth_user_lookup_rpc.sql
-- Destination: supabase/migrations/
-- Session 72 (this session) — auth user lookup by email via RPC.
--
-- Problem this fixes:
--   /play → enrollStudent() attempts admin.auth.admin.createUser(email).
--   For a returning visitor whose auth.users row already exists, createUser
--   errors with "A user with this email address has already been registered."
--   The fallback used admin.schema("auth").from("users").select("id") to
--   fetch the existing id. PostgREST does not expose the `auth` schema by
--   default, so that call silently returned null — the visitor then saw:
--
--     "Could not identify your account: A user with this email address
--      has already been registered"
--
--   …and could not join. The two halves of that message came from the
--   app's own error-formatting: the prefix from enrollStudent's fallback
--   return, the suffix from createErr.message.
--
-- Fix:
--   A SECURITY DEFINER function in the public schema, callable from
--   supabase-js via admin.rpc("get_auth_user_id_by_email", { p_email }).
--   Service role runs RPCs directly against Postgres and doesn't hit the
--   PostgREST schema-exposure restriction, so this is reliable.
--
--   Locked down: only service_role can EXECUTE. anon and authenticated
--   are explicitly revoked so a browser client can't enumerate emails.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id
  FROM auth.users
  WHERE lower(email) = lower(p_email)
  LIMIT 1;
$$;

-- Lock down execution. Only the service role should ever call this.
REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(text) TO service_role;

COMMENT ON FUNCTION public.get_auth_user_id_by_email(text) IS
'Session 72: returns auth.users.id for a given email (case-insensitive).
Used by src/app/play/actions.ts enrollStudent() when admin.auth.admin.createUser
reports the email is already registered — we need the existing auth id to
enroll the returning visitor. Service role only; anon and authenticated are
revoked to prevent email enumeration.';

-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION — run these two queries to confirm the migration took.
-- Expected: (1) function exists, security_type = 'DEFINER'; (2) service_role
-- has EXECUTE and anon/authenticated do not.
-- ═══════════════════════════════════════════════════════════════

-- 1. Function exists and is SECURITY DEFINER?
SELECT
  n.nspname       AS schema_name,
  p.proname       AS function_name,
  CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security_type,
  pg_get_function_result(p.oid)  AS returns,
  pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_auth_user_id_by_email';

-- 2. Who can execute it?
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'get_auth_user_id_by_email'
ORDER BY grantee;

-- 3. Smoke test — should return the auth.users.id for myked70.
SELECT public.get_auth_user_id_by_email('myked70@yahoo.com') AS resolved_id;
