-- ─────────────────────────────────────────────────────────────────────────
-- 20260529130000_add_entries_delete_policy.sql
--
-- Adds the missing DELETE policy on public.entries.
--
-- BACKGROUND
-- The entries table had policies for INSERT (×2), SELECT (×3), and UPDATE
-- (×2) — but ZERO policies for DELETE. With RLS enabled and no DELETE
-- policy, Postgres silently filters every delete attempt to zero rows
-- affected and returns NO error. The deleteStarter Server Action's
-- storage cleanup runs AFTER the DB delete, so the storage file gets
-- removed while the DB row stays. Visible symptom: card stays in the
-- pool after Remove, then images render as broken on next page load
-- because the storage file is gone but the row still points at it.
--
-- FIX
-- Mirror the existing "entries: teacher updates own class" policy. The
-- teacher should be able to delete any entry in a class they own. The
-- helper function owns_class(uuid) returns true when the calling user
-- owns the class — same check the UPDATE policy already uses, so this
-- can't drift.
--
-- We do NOT constrain to is_starter = true here. The teacher owns the
-- class; they're allowed to remove any of its entries. The deleteStarter
-- Server Action enforces the starter constraint at the app layer for
-- starter-specific UI; future delete paths for non-starter entries will
-- share this policy correctly.
-- ─────────────────────────────────────────────────────────────────────────

create policy "entries: teacher deletes own class"
on public.entries
for delete
to authenticated
using (owns_class(class_id));
