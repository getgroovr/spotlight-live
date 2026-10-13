# Handoff #31 — file upload list

Mike: load all Tier 1 + Tier 2 files into the next chat at start, alongside `2026-06-08_SLICE_1_HANDOFF_31.md`. Tier 3 only if the next Claude asks. Tier 4 is SQL the next Claude can run on its own when needed.

The next Claude should confirm everything's in context before proceeding to step 4.

---

## Tier 1 — REQUIRED for step 4 (class management header)

Files the next Claude will read closely and either replace OR strictly mirror.

| # | Path | Why |
|---|---|---|
| 1 | `src/app/teacher/students/page.tsx` | The page that gets the new header. Currently unions all teacher's classes — needs the class switcher and per-class filter added. |
| 2 | `src/app/teacher/students/actions.ts` | `saveClassSettings` action — written in chat #31. New file; the header will post to it. Don't recreate; read for shape. |
| 3 | `src/lib/round-timing.ts` | Source of `computeCurrentRound` for the header's "Round Y of Z" status line. New file from chat #31. |
| 4 | `src/lib/supabase-server.ts` | Standard cookie client used by every server component. Don't re-implement. |

---

## Tier 2 — REQUIRED for steps 5-7 (top nav, deck filter, per-student CSV + collapsed rounds)

| # | Path | Why |
|---|---|---|
| 5 | `src/app/teacher/deck/page.tsx` | Step 5 nav target, step 6 scope-filter destination. |
| 6 | `src/app/teacher/deck/deck-client.tsx` | Step 6 teacher-name field belongs here or as a sibling component. |
| 7 | `src/app/teacher/deck/actions.ts` | Context for step 6 — already wires up auth/role checks the teacher-name action can mirror. |
| 8 | `src/app/teacher/students/[id]/page.tsx` | Step 7 destination — header gets CSV button, body gets collapsed past rounds. |
| 9 | `src/app/teacher/students/[id]/actions.ts` | `writeTeacherComment` — for context, not changing. |
| 10 | `src/app/teacher/students/export/route.ts` | Existing class-wide CSV. The per-student CSV in step 7 may reuse logic OR be a sibling route. |

---

## Tier 3 — Pattern reference (upload only if the next Claude requests)

These don't change in this slice but are useful when the next Claude asks "how does the codebase handle X?"

| # | Path | Why |
|---|---|---|
| 11 | `src/lib/student-archive.ts` | Pattern reference: class-timing reads, URL signing, class-scoped queries, email-bridge joins. |
| 12 | `src/app/student/dashboard/page.tsx` | Pattern reference for step 7's collapsed-rounds layout. |
| 13 | `src/app/student/results/page.tsx` | Pattern reference for the server-fetch + client-ceremony split. |
| 14 | `src/app/play/actions.ts` | Pattern reference for the action-result + warning shape Mike likes. |
| 15 | `src/lib/deck.ts` | The cross-teacher warm-up deck adapter. Reference if the step-6 filter raises deck-architecture questions. |
| 16 | `src/lib/class-deck.ts` | The in-class deck adapter (sibling to deck.ts). Same reason. |

---

## Tier 4 — Schema introspection (run in Supabase SQL Editor, no upload needed)

If the next Claude needs to confirm exact column types/nullability before writing code, run these directly:

```sql
-- classes table (target of saveClassSettings)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='classes'
ORDER BY ordinal_position;

-- profiles table (display_name lives here — relevant to step 6)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles'
ORDER BY ordinal_position;

-- enrollments table (the per-class student grid query joins here)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='enrollments'
ORDER BY ordinal_position;

-- entries table (relevant to step 6 deck scoping)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='entries'
ORDER BY ordinal_position;
```

And the CHECK constraints on `classes` (in case the next Claude needs to know the duration validation set):

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.classes'::regclass AND contype = 'c';
```

---

## Quick checklist for Mike at the start of the next chat

1. Upload `2026-06-08_SLICE_1_HANDOFF_31.md`.
2. Upload this file (`2026-06-08_HANDOFF_31_FILE_LIST.md`).
3. Upload all 10 files from Tiers 1 + 2.
4. Send: "ready to start step 4 — files are loaded."

The next Claude should respond with confirmation that all 10 files are in context, then begin step 4.
