# SLICE 1 HANDOFF #13 — Part 2 (student archive UI) shipped & verified; "one active class at a time" guard added; World B confirmed

**Date written:** 2026-06-01 (evening)
**Picking up from:** Handoff #12 (Part 1 cohorts foundation shipped + verified; profiles.class_id gap closed)
**Going into:** A REGROUP session — recap what's done, then settle two design questions (what ends a class; what the next slices are) before more building.
**Destination for this file:** `docs/handoffs/`

---

## TL;DR for next Claude

1. **Slice 1 Part 2 (student archive UI) is BUILT and VERIFIED LIVE end-to-end.**
   A student now sees a HISTORY STRIP: their current class (expanded, "CURRENT"
   pill) plus past classes (collapsed tiles, "PAST" pill) that expand into the
   full per-class archive. Confirmed in-browser with a 2-class student.
2. **A real product rule was clarified and ENFORCED: "one ACTIVE class at a
   time" (World B).** A student is in exactly one live class; finished classes
   accumulate as history. New migration adds `enrollments.status`
   (active/completed) + a partial unique index; `enrollStudent` refuses a new
   class while one is active. Guard verified live (the /play join screen showed
   the refusal message).
3. **Two NEW migrations were filed this session** (both were run live earlier;
   files now in the repo):
   - `20260601130000_student_enrollment_history_rls.sql` (the #12 `is_enrolled_in`
     migration — was run live last session but NEVER committed; found on disk
     and filed this session).
   - `20260601180000_enrollment_status.sql` (the new status column + guard index).
4. **A SECOND public class was seeded** (`Spotlight — Back Door`) reusing class
   1's image paths, so the mixed deck and history strip have multi-cohort data.
   Two public classes now, each 9 live starters.
5. **Test students were wiped and emails freed** (see "Test data hygiene"). Only
   the teacher account (`getgroovr@yahoo.com` / `18f23db0…`) remains. The three
   throwaway emails are reusable.
6. **GIT: appears committed (clean working tree on `slice-1a`), but VERIFY
   FIRST** — last session's whole mess was "verified but never committed." Run
   `git show --stat HEAD` before trusting it. See "First-message" below.

---

## What this session accomplished

### Part 2 — the student archive UI (DONE, VERIFIED)

Four files (one new folder `export/`):

| File | Destination | Status |
|---|---|---|
| `student-archive.ts` | `src/lib/student-archive.ts` (NEW) | ✅ verified live |
| `ProfileArchive.tsx` | `src/app/student/dashboard/ProfileArchive.tsx` (NEW) | ✅ verified live |
| `page.tsx` | `src/app/student/dashboard/page.tsx` (REPLACE) | ✅ verified live |
| `export/route.ts` | `src/app/student/dashboard/export/route.ts` (NEW folder) | ⚠ works as a download; intent is bigger — see Parked |

**What each does**
- **student-archive.ts:** `getStudentArchive()` — generalizes the old single-
  session dashboard read into "one archive PER class the student ever enrolled
  in." Reads `profiles.class_id` to mark the CURRENT class; everything else is
  past/history. Session/notes scoped by `class_id` + `round` (the old read
  pulled the globally-latest session — that was the single→multi gap). Sorts
  current first, then past newest-first.
- **ProfileArchive.tsx:** client component. Collapsible tiles (favorite pic +
  class name + date + Current/Past pill). Current starts expanded; click any to
  expand into the full archive (favorite block, 9-comment grid, teacher notes,
  per-class CSV button). JSX lifted from the old complete-state render so an
  expanded class looks identical to the prior single-class profile.
- **page.tsx:** auth + the unchanged finish-joining form (keyed off the NEWEST
  class now), then `<ProfileArchive/>` in the complete state.
- **export/route.ts:** Parked I's CSV machinery (csvCell, BOM, RFC-4180,
  headers) scoped to the logged-in student + one class_id, with an enrollment
  check (404 if not enrolled). Includes teacher notes (student controls the
  file). GET /student/dashboard/export?class_id=<uuid>.

**Verified live:** a 2-class student (`myked70@yahoo.com`) showed "You're in 2
classes," Front Door (CURRENT, expanded) + Back Door (PAST, collapsed). The Back
Door tile expanded into its OWN archive — different favorite, different 9
comments, different "why" — proving per-class scoping is real, not the same
session rendered twice.

### The "one active class at a time" guard (World B) — DONE, VERIFIED

**The clarified model (this matters — it resolved real confusion):**
- A student is in exactly ONE active class at a time. NOT "one class ever."
- When a class ends, the student can go through selection again and join a NEW
  one. They are never in two AT ONCE; over time they accumulate a HISTORY of
  consecutive finished classes. That history is what the strip shows.
- "World A" (truly one class ever, no history) was explicitly rejected.

**Enforcement:**
- Migration `20260601180000_enrollment_status.sql`: adds `enrollments.status`
  text NOT NULL default 'active', CHECK in ('active','completed'), and a PARTIAL
  UNIQUE INDEX `one_active_enrollment_per_student` on (student_id) WHERE
  status='active' — the hard DB backstop.
- `actions.ts` (REPLACE `src/app/play/actions.ts`): `enrollStudent` now checks
  for an existing ACTIVE enrollment in a DIFFERENT class and refuses with a
  friendly message. Re-enrolling the SAME class still fine (upsert).
- **Verified live:** logged-in `myked70` hitting /play got "You're already in a
  class. You can join a new one once your current class has finished."

**What flips active→completed: MANUAL for now** (SQL/dashboard). Auto-completion
(N rounds, or a teacher "close class" action) is a LATER slice — needs round
logic or teacher UI that don't exist yet. THIS IS ONE OF TOMORROW'S OPEN
QUESTIONS (see below).

### Second public class seeded
- `seed_second_public_class.sql` (data, NOT a migration → `docs/seeds/`): created
  `Spotlight — Back Door`, public, owned by the existing teacher, cloning class
  1's 9 starters (same `media_url` paths → same images, no upload). Verified:
  two public classes, each 9 live starters.
- NOTE: both classes share identical photos AND captions, so tiles look alike.
  Fine for verifying plumbing. If we want them visually distinguishable later,
  reissue the seed with distinct captions for class 2.

### Test data hygiene (how the emails were freed)
- Deleted 3 throwaway auth users via dashboard (Authentication → Users), KEEPING
  `getgroovr@yahoo.com` (the teacher — its auth id `18f23db0…` owns both classes
  and all starters; deleting it would orphan everything).
- Then a scoped SQL block cleared their data rows (game_sessions,
  teacher_comments, enrollments, students). Orphan-profiles check came back
  empty — the FK cascade cleaned profiles when the auth users were deleted.
- Emails `2530.14th.st.llc@gmail.com`, `myked70@yahoo.com`, `myked70og@gmail.com`
  are reusable. TIP for next time: Gmail `+tag` addressing
  (`myked70+a@gmail.com`) gives unlimited distinct test emails to one inbox.

### Test-data injector (scratch — do NOT commit)
- `test_inject_past_class.sql`: enroll a student through the app FIRST (creates
  their CURRENT class), THEN run this to add a COMPLETED past class in the other
  public class, back-dated 40 days. Produces the World B 2-class state without
  the (unbuilt) round/lifecycle mechanism. Throwaway — keep in a scratch/docs
  area, never in migrations.

---

## Schema truths confirmed this session (hold as ground truth)

- `enrollments`: id, student_id, class_id, round, **enrolled_at**, **status**
  (NEW: active/completed). Partial unique index = one active per student.
- `game_sessions`: id, student_id, class_id, round, comments (jsonb), favorites
  (jsonb), favorite_comment (text), completed_at. comments = { entryId: text };
  favorites = { entryId: true }.
- `teacher_comments`: id, student_id, class_id, round (nullable), body, created_at,
  **entry_id** (nullable). entry_id set → note pins under that photo; null →
  general/class-level note.
- `classes`: id, teacher_id, name, created_at, **is_public**. "Public" flag =
  `is_public`. Starter media in the `teacher-deck` PUBLIC bucket (getPublicUrl).
- `profiles.class_id` = the student's CURRENT class (what `my_class_id()` returns,
  what route.ts syncs on login). The archive uses it to mark current vs past.
- `is_enrolled_in(cid)` = ever-enrolled (student history reads). Live since #12.

---

## OPEN DESIGN QUESTIONS for tomorrow (Mike wants to discuss, not build, first)

Mike said: "I need to regroup." Tomorrow opens with discussion, not code.

### 1. What ENDS a class? (the big one)
`active→completed` is manual today. What should trigger it? Mike is NOT settled
and floated several ideas, none chosen:
- A set number of rounds (e.g. 9) — but WHY 9? Is it because 9 students? Is round
  count even the right axis?
- Mike's alternative idea worth exploring: **one student's pic + the class's
  discussion of it is the focus of a whole "round"** — i.e. a class cycles
  through its students, each student's photo getting a round where everyone
  comments on it. With ~9 students that's ~9 rounds, but the REASON is
  "everyone gets a turn in the spotlight," not an arbitrary count.
- Could be teacher-driven (teacher closes the class) instead of automatic.
This decides the lifecycle model and unblocks auto-completion. DISCUSS FIRST.

### 2. What are the next slices?
The multi-cohort arc (from `2-PLAN_multi_cohort_entry_and_round2.md`) has slices
2–5 sketched (teacher dashboard scoping; upload→cohort grouping UI; merge/regroup;
Round 2 peer content). Need to confirm order and what's actually next. Recap the
plan doc with Mike.

### 3. Full recap of what's DONE
Mike wants a clear "here's everything that works now" inventory to regroup
around. Next Claude: read #11, #12, #13 and the plan doc, and be ready to give a
plain-language state-of-the-build summary.

---

## Parked (carried forward)

- **Send-to-teacher is a download, but the INTENT is bigger.** Mike wants the
  student's class record to go to the NEW teacher directly — without the student
  needing the teacher's email or doing the emailing. That's an IN-APP TRANSFER
  (teacher→teacher), which needs (a) a second teacher to exist in the system and
  (b) cross-teacher writes = **Parked H** (multi-teacher storage RLS, still
  unbuilt). Email was explicitly rejected. So the CSV download stands as a
  placeholder until the multi-teacher slice makes the real transfer possible.
- **Hydration error** in `src/game/spotlight.jsx:691` — the "Resume where you
  left off" block (server can't see localStorage). Still parked, still harmless,
  still fires only with resumable local state (incognito sidesteps it). Standard
  fix: gate behind a mounted check or `suppressHydrationWarning`.
- **Identical photos+captions across both seeded classes** — tiles look alike.
  Reissue seed with distinct class-2 captions if we want visual distinction for
  testing.
- **Two repo-hygiene files now FILED** (were missing): the #12 RLS migration and
  the new status migration. Good. Going forward: run-in-dashboard AND save-to-
  `supabase/migrations/` for every structural change.

---

## Working agreement (unchanged, reinforced this session)

- Mike holds editor, Supabase dashboard, all keys, all pushes. Claude never
  handles real keys, never pushes.
- Whole-file artifacts as DOWNLOADABLE FILES with full destination path.
- New routes need a NEW FOLDER.
- Mike isn't fluent in JS/TS but IS confident at Supabase SQL — lean on SQL
  proof queries to verify behavior before declaring done. THIS SESSION: every
  claim was checked by SQL or in-browser, not by "looks right."
- **Verify-before-declaring, especially git.** Twice now, work that ran live was
  not actually in the repo. ALWAYS `git show --stat HEAD` / `git status` before
  trusting commit state.
- His asides are usually the right call — LISTEN for them. This session his
  "wait, should a student be in two classes at once?" aside caught a genuine
  design gap (World A vs B) before we tested a wrong assumption into the build.
- Watch his clock; he flagged "I need to regroup" — handoff written, stopping
  cleanly.
- Migrations folder: only STRUCTURAL changes (columns/tables/policies/functions/
  indexes). Seeds and test-data go elsewhere (docs/seeds, scratch).

---

## First-message-to-next-Claude

Read this whole doc, plus #12 and `2-PLAN_multi_cohort_entry_and_round2.md`.

**FIRST, verify git state** (do not trust "looks committed"):
```powershell
cd C:\Users\Myked\projects\spotlight-live
git status
git show --stat HEAD
git log --oneline -5
```
Confirm the Part 2 files are actually in a commit: `src/lib/student-archive.ts`,
`src/app/student/dashboard/{page.tsx,ProfileArchive.tsx,export/route.ts}`,
`src/app/play/actions.ts`, and the two migrations under `supabase/migrations/`
(`20260601130000_student_enrollment_history_rls.sql`,
`20260601180000_enrollment_status.sql`). If any are missing from HEAD, they may
be staged-but-uncommitted or stranded on the desktop again — surface it before
building anything.

**Then: this is a REGROUP / DISCUSSION session, not a build session.** Mike wants
to (1) recap everything that's done, (2) decide what ENDS a class — the lifecycle
model (round count vs. "everyone gets a spotlight turn" vs. teacher-closes), and
(3) confirm the next slices from the plan doc. Hold off on code until those are
settled. Do NOT redo Part 2 — it's done and verified (history strip, current/past
pills, expand, per-class CSV, and the one-active-class guard all confirmed live).

Schema ground truth: enrollments now has `status` (active/completed) with a
partial unique index enforcing one active per student; profiles.class_id =
current class; is_enrolled_in = ever-enrolled. Both classes are public with 9
starters each but share images/captions. Test emails are freed; only the teacher
account remains.

Parked: in-app transfer (needs multi-teacher + Parked H); hydration error
(spotlight.jsx:691); identical class images. His asides are usually the right
call — listen for them.
