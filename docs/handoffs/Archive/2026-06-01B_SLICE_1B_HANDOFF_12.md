# SLICE 1B HANDOFF #12 — Cohorts foundation (Part 1) shipped + verified; profiles.class_id gap found & fixed

**Date written:** 2026-06-01 (early afternoon, ~12:50 PM)
**Picking up from:** Handoff #11 (Parked G shipped; multi-cohort arc entered, slice 1 framed)
**Going into:** Verifying the route.ts propagation fix, then slice 1 Part 2 (student archive UI).
**Destination for this file:** `docs/handoffs/` (same as prior handoffs).

---

## TL;DR for next Claude

1. **Slice 1 Part 1 (cohorts foundation) is BUILT and the schema half is VERIFIED LIVE.**
   Four files produced; the migration + two of three code files are confirmed
   working end-to-end (incognito play → favorite → enroll → magic link →
   dashboard, with email from the verified Spotlight/Resend domain).
2. **The linchpin question from #11 is fully answered.** `my_class_id()` returns
   ONE uuid = the student's current `profiles.class_id`. It did NOT need to
   change. `owns_class(cid)` and `is_teacher()` were already multi-cohort. The
   ENTIRE single-cohort assumption lived in the app's `NEXT_PUBLIC_DEMO_CLASS_ID`.
3. **A real latent bug was found: `profiles.class_id` was NULL for everyone** —
   nothing ever wrote it (`handle_new_user` doesn't; `/auth/confirm` didn't;
   `enrollStudent` can't, no auth user yet). Student-RLS via `my_class_id()` was
   therefore dormant; the dashboard only worked because it reads via the
   service-role admin client (RLS bypassed). This is the invisible bug.
4. **That gap is now CLOSED and VERIFIED.** `/auth/confirm` (route.ts v2) syncs
   the enrolled class onto the profile after verifyOtp. v1 used getUser() which
   returned null in-request and silently skipped; v2 uses the user from
   verifyOtp's own response. A fresh incognito enrollment auto-populated
   profiles.class_id with no manual step — proven by SQL.
5. **Slice 1 Part 1 is fully done. NEXT: seed a 2nd public class, then build
   Part 2 (the student archive UI).** Details below.
6. **Git:** unchanged this session — Mike applies all SQL and swaps files
   himself; nothing committed yet. (Confirm `git status` on pickup.)

---

## What this session accomplished

### Schema truth established (read against the live DB, not the plan doc)

- `cohorts` (plan) == `classes` (live). `cohort_id` == `class_id`. No new table.
- **`my_class_id()`** = `select class_id from public.profiles where id = auth.uid()`.
  Returns ONE uuid: the student's *current* class. Correct as-is (one student,
  one active class). NOT changed.
- **`owns_class(cid)`** = exists(select 1 from classes where id=cid and
  teacher_id=auth.uid()). Already parameterized per-class. Multi-cohort ready.
- **`is_teacher()`** = role check on profiles. Class-agnostic. Fine.
- **`handle_new_user`** trigger inserts profiles (id, display_name, is_18_plus)
  on auth user creation. **Does NOT set class_id.** ← root of the NULL gap.
- **`favorites`** column shape = `{ "<entryId>": true }` — a single key, the
  favorited entry's id. (Confirmed via jsonb_object_keys: one row per session,
  value always `true`.) This is how enrollStudent resolves the joined class.
- **`enrollments`** columns: id, student_id, class_id, round, **`enrolled_at`**
  (NOT created_at — this bit route.ts v1; fixed).
- **`game_sessions`** orders by **`completed_at`** (NOT created_at).

### The design decisions Mike made this session (important — these shape Part 2)

- **A student can enroll in consecutive classes** (same or different teacher).
  Per-enrollment data is permanent and **must never change on the teacher side**
  — already true, since game_sessions/enrollments/teacher_comments are
  append-only history rows stamped with class_id + round. Nothing overwrites.
- **Students get a LIVE in-app view of ALL their past classes** (not just a
  delivered file). This is the decision that drove `is_enrolled_in` — student
  reads must span every class they've ever been in, not just the current one.
  - Presentation: a **compressed history strip** — one tile per past class,
    shown as the **favorite picture that started it** + a date. Collapsed.
  - Click a tile → **expands** to that class's full archive (their 9 comments,
    favorite, the "why", teacher notes).
- **Per-class "send my spreadsheet to a new teacher"** — student-initiated, one
  class at a time, surfaced inside the expanded class view. Most students won't
  bother; when they do it spares the new teacher manual context-gathering.
  Student-initiated (not auto-pipeline) = less code + better privacy.
- **"Simpler is always better"** is the standing instruction. Keep it lean.

---

## What "current class" vs "history" means in the RLS (the core idea)

- `my_class_id()` = single scalar = **current class**. Kept for write paths and
  for the deck/enroll flow. Comparing `class_id = my_class_id()` = "is this row
  in my CURRENT class."
- `is_enrolled_in(class_id)` = **have I EVER enrolled in this class.** Used for
  student *reads* of history. This is the single→multi cohort shift on the
  student side. (The teacher side was always fine via `owns_class`.)

---

## The four files (Part 1)

| File | Destination | Status |
|---|---|---|
| `20260601130000_student_enrollment_history_rls.sql` | run in Supabase SQL Editor | ✅ APPLIED & verified (3 policies flipped; 0 still use my_class_id; function runs clean) |
| `deck.ts` | `src/lib/deck.ts` (replace) | ✅ verified live (mixed deck path worked end-to-end) |
| `actions.ts` | `src/app/play/actions.ts` (replace) | ✅ verified live (class-from-favorite worked; enrollment row correct) |
| `route.ts` | `src/app/auth/confirm/route.ts` (replace) | ✅ v2 FIX VERIFIED LIVE — fresh incognito enrollment auto-populated profiles.class_id (3rd row, no manual backfill) |

### What each does
- **Migration:** adds `is_enrolled_in(cid)` (SECURITY DEFINER, STABLE, locked
  search_path — mirrors owns_class). Recreates 3 student-read policies
  (`classes: teacher reads own`, `entries: read`, `peer_comments: read`),
  swapping only the student branch from `= my_class_id()` to
  `is_enrolled_in(...)`. All other branches (own-row, owns_class) preserved.
- **deck.ts:** `loadGenericDeck` pulls starters across ALL public classes
  (`.in("class_id", classIds)`) instead of one pinned class, shuffles, takes 9.
  `NEXT_PUBLIC_DEMO_CLASS_ID` no longer load-bearing for /play.
- **actions.ts:** `enrollStudent` derives `classId` from the favorited entry —
  `Object.keys(favorites).find(k => favorites[k])` → look up that entry's
  `class_id` → enroll there. (saveProfile unchanged.)
- **route.ts (v2):** after `verifyOtp`, uses the **user from verifyOtp's own
  response** (not a follow-up getUser) to run `syncCurrentClass`, which reads
  the student's most-recent enrollment (`order by enrolled_at desc`) and writes
  its class_id onto `profiles.class_id`. Best-effort, logged, non-fatal.

---

## Part 1 — DONE & VERIFIED (no action needed; recorded for the record)

All four files shipped and confirmed live by SQL (not just UI). The
profiles.class_id gap — NULL for every account since the app was built — is
closed and PROVEN closed: a fresh incognito enrollment ("The myth",
id 8767f516-3bf2-43dc-b979-a97b4cb7d409) auto-populated its class_id with no
manual step.

Steps taken (for reference / if a similar gap recurs elsewhere):

**1) One-time backfill of the two pre-fix rows (DONE):**
```sql
UPDATE public.profiles p
SET class_id = e.class_id
FROM public.students s, public.enrollments e
WHERE lower(s.email) = lower((SELECT email FROM auth.users WHERE id = p.id))
  AND e.student_id = s.id
  AND p.class_id IS NULL;
```

**2) Proof query (now shows 3 rows, all with class_id):**
```sql
SELECT id, class_id FROM public.profiles WHERE class_id IS NOT NULL;
```

The route.ts v2 fix (use the user from verifyOtp's response, not a follow-up
getUser) was the actual code fix — v1 silently skipped because getUser()
returned null in the same request.

### Parked this session (small, isolated)
- **Hydration error** in `src/game/spotlight.jsx:691** — the "Resume where you
  left off" block. Server can't see localStorage so renders no-resume; client
  reads localStorage and renders the resume button → mismatch. Only fires when
  there's resumable local game state (incognito sidesteps it). Engine-side, NOT
  caused by this slice. Standard fix: gate the resume UI behind a mounted/client
  check, or `suppressHydrationWarning` on that node. Harmless; fix when convenient.

### Slice 1 Part 2 — student archive UI (next real build)
All READS (no migration). Depends on Part 1 verified + a 2nd class to show.
- History strip on the student profile: one tile per past class = favorite pic +
  date, collapsed.
- Click to expand → that class's full archive (9 comments, favorite, why,
  teacher notes), gated by `is_enrolled_in`.
- Per-class "send spreadsheet to new teacher" action (reuse the Parked I cohort
  CSV export logic, scoped to the student's one class). Student-initiated.

### Prerequisite for testing Part 2
- **Seed a SECOND public class** with its own 9 starter entries (SQL seed, per
  the plan). With only one public class today, the mixed deck and the history
  strip can't actually show multi-cohort behavior. Do this before Part 2 so
  there's something to see.

### Further out (unchanged from #11)
- Slices 2–4 of the multi-cohort arc; Round 2 peer content (slice 5).
- Teacher "new student joined" notification email (easy now Resend is wired).
- Finish-joining form: echo student's Round 1 comment.
- Parked H (multi-teacher storage RLS) — still parked. NOTE: multi-teacher does
  NOT change Part 1 — is_enrolled_in and the archive are teacher-agnostic.

---

## Working agreement (unchanged)

- Mike holds: editor, Supabase dashboard, all keys, all pushes, all
  Namecheap/Resend dashboards. Claude never handles real keys, never pushes.
- Whole-file artifacts as DOWNLOADABLE FILES with full destination path.
- New routes need a NEW FOLDER. Routes off ROOT.
- Commit messages in VS Code Source Control message box.
- Mike isn't fluent in JS/TS but IS confident at Supabase dashboard/SQL — lean
  on SQL diagnostics to verify behavior before declaring something done.
- Verify-before-declaring: this session, the dashboard "looking right" masked
  the NULL gap. Always run the SQL proof, not just the UI.
- His asides are usually the right call — listen for them. (The "should I be
  anonymous?" aside is what surfaced both the clean test path AND the hydration
  error's trigger.)
- Watch his clock; pivot to writing the handoff before he's out of gas.

---

## First-message-to-next-Claude

Read this whole doc. Then confirm git state:
```powershell
cd C:\Users\Myked\projects\spotlight-live
git status
git log --oneline -5
```

**Part 1 is DONE and verified — do not redo it.** The four files are applied and
the profiles.class_id gap is closed (proven by a fresh incognito enrollment
auto-populating class_id). The only thing not yet done by Mike is COMMITTING —
he may want to commit the three changed code files + the migration + handoffs.

Then the real next work:
1. **Seed a SECOND public class** with 9 starter entries (SQL seed) so the mixed
   deck and the history strip have multi-cohort data to actually show.
2. **Build Part 2 — the student archive UI** (all reads, no migration): history
   strip (favorite pic + date per past class), click-to-expand a past class,
   per-class "send spreadsheet to new teacher" (reuse Parked I CSV export).

Hold the schema truths in this doc as ground truth (plan names ≠ live names;
favorites is a single-key map { entryId: true }; enrollments uses enrolled_at;
sessions use completed_at; my_class_id = current class scalar; is_enrolled_in =
ever-enrolled, used for student history reads).

Parked: hydration error in spotlight.jsx:691 (resume button, engine-side,
harmless). His asides are usually the right call — listen for them.
