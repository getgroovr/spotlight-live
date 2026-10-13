# 2026-06-11 Slice 1 Handoff #34

- **READ THIS HANDOFF before doing anything.** Always.
- **First action:** Pre-load the files listed in the "Files that matter" section below. If they aren't all in context, ask before proceeding.

---

## Mike's preferences — INCLUDE THIS SECTION VERBATIM IN ALL SUBSEQUENT HANDOFFS

(Observed across chats; Mike asked these be propagated forward.)

1. **Full-file replacements, NOT patches.** When producing code changes, output the entire new file. Mike does not want to apply line-by-line edits. This includes small changes — give the whole file, not "change line 339 from X to Y."

2. **PowerShell and SQL commands only.** Mike's machine is Windows; he runs PowerShell and Supabase SQL. He does NOT run grep, bash, sed, curl, or any Unix tooling. If a check is needed in those tools, translate it to PowerShell (e.g. `Select-String` for `grep`) or SQL before presenting it.

3. **Anything beyond PS/SQL needs explicit direction.** "Open VSCode and do X" or "In Supabase Storage do Y" should be spelled out — don't assume Mike will fill in the gaps.

4. **Don't start coding without seeing the existing files.** Ask Mike to upload the relevant files before writing replacements. Pattern-match what's there; don't invent from memory.

5. **Ask before assuming on design questions.** Mike has strong opinions and clear thinking on his product; don't guess where he can give you a one-line answer.

6. **Flag what's deferred and why.** When making decisions that close off architectural options for later, say so explicitly.

7. **Admit when wrong; correct prior handoffs.** Handoffs accumulate errors across chats; do not propagate them silently.

8. **Concise is good. Over-formatting is not.** Bullets and headers when they earn their keep; not as decoration.

9. **Tighten layouts.** Mike prefers compact, side-by-side field arrangements over stacked single-column forms. If three related inputs can share a row, put them on one row.

10. **Label editability clearly.** If a field looks like a title but is actually editable, give it a small label so the affordance is discoverable.

11. **Use "See the round" / "Close the round" toggle buttons** on all collapsible round sections (student dashboard completed rounds, teacher student detail page past rounds). Never bare arrows or click-the-thumbnail expand.

12. **"Spreadsheet" not "CSV" in user-facing text.** The download format is CSV but students and teachers see the word "spreadsheet."

---

## TL;DR — current state

- **Steps 1–7 are done and committed.** The full slice 1 teacher UI is complete.
- **Reveal page is done** — per-round most-favorited-photo design.
- **Approval system: teacher side is deployed but needs fixes.** Pending queue shows on `/teacher/students` between settings and student grid. Approve/reject actions are wired. Two known issues: broken thumbnails (wrong bucket or URL method) and no teacher comment field on approve.
- **Approval system: student side is NOT started.** Student dashboard doesn't show rejection reasons yet, and the "approved sticker replacing Remove button" change hasn't been applied.
- **Seed data:** Both classes have seeded game_sessions for the reveal page. Second Class seed was re-run without the bad verification query and succeeded.
- The branch is `slice-1a`.

---

## What got done this chat (#34)

### Seed data for reveal page testing

- 8 seed voters (seed-voter-5 through seed-voter-12) added to `students` table.
- **Second Class** (`d9ce91d4-...`): game_sessions for rounds 1, 2, 4. Round 1: Phoenix sunset wins (5 favs), Casper and St. Martin tie (3 each), varied comments. First run failed because the verification query at the end had a bad cast — re-ran INSERTs without that block and it succeeded.
- **First Class** (`bac4d923-...`): game_sessions for all 8 rounds. Round 1: Casper wins (5 favs), cool shades and mom's hat tie (3 each). Verification confirmed 8 rows (one per round).
- Seed voters use `a0000000-0000-0000-0000-00000000NNNN` UUID pattern for easy cleanup.

### Commit grouping (Mike committed these)

7 commits covering steps 6–7, CSV scoping, splash fix, student dashboard updates, reveal page rewrite, and handoff #33 docs.

### Approval system — DB migration (applied)

- `ALTER TYPE entry_status ADD VALUE IF NOT EXISTS 'rejected';` — enum now has `{pending, live, archived, rejected}`.
- `ALTER TABLE entries ADD COLUMN IF NOT EXISTS rejection_reason text;` — stores teacher's reason for rejection.

### Approval system — teacher side (deployed, needs fixes)

**New files:**
- `src/app/teacher/students/pending-queue.tsx` — client component. Renders pending entries with Approve/Reject buttons. Reject reveals a textarea for the reason.
- `src/app/teacher/students/actions.ts` — added `approveEntry` and `rejectEntry` server actions alongside the existing `saveClassSettings`. Both verify teacher auth + class ownership before updating.

**Modified files:**
- `src/app/teacher/students/page.tsx` — fetches pending entries (`entries.status = 'pending'`, `is_starter = false`) in `getPageData`. Resolves student display names by bridging `entries.student_id` (auth user id) → email → students table. Renders `<PendingQueue>` between ClassHeader and student grid.

**Known issues to fix next session:**
1. **Broken thumbnails in pending queue.** Used `admin.storage.from("teacher-deck").getPublicUrl(...)` but images aren't loading. Likely need `admin.storage.from("media").createSignedUrl(...)` instead, or the bucket name is different for student-submitted entries vs teacher starters. Check what bucket `AddEntryForm` uploads to.
2. **No teacher comment on approve.** Mike wants the teacher to optionally add a comment when approving (not just on reject). This could store in `teacher_comments` table or as a new field. Design decision needed.

---

## What's NOT done yet (next session priorities)

### 1. Fix pending queue thumbnails

Check which bucket student entries upload to (look at `AddEntryForm.tsx` or the upload action). Switch the pending queue's URL generation to match.

### 2. Add teacher comment on approve

Mike wants: approve button can optionally include a comment. Two UX options:
- (a) Approve always shows a small optional textarea (like reject does)
- (b) Approve is instant; a separate "Comment" button adds a note

Ask Mike which he prefers.

### 3. Student rejection UX

When a teacher rejects an entry, the student should see the reason on their dashboard. Changes needed:

- **`src/lib/student-archive.ts`** — add `rejectionReason` to the `OwnEntry` type. Fetch `rejection_reason` from the entries query.
- **`src/app/student/dashboard/page.tsx`** — in `FilledTopSlotCard`:
  - If `entry.status === 'live'`: hide Remove button, StatusBadge already shows "APPROVED" (the sticker).
  - If `entry.status === 'rejected'`: show the rejection reason + allow re-upload.
  - If `entry.status === 'pending'` and `!isLocked`: show Remove button (current behavior).

### 4. Approved sticker on student dashboard

One-condition change in `FilledTopSlotCard`: when `entry.status === 'live'`, don't show the Remove button or "you can replace" text. The existing `StatusBadge` already renders "APPROVED" — just need to gate the Remove button on `entry.status !== 'live'`.

---

## Architectural items DEFERRED to later slices/handoffs

(Carried forward from #33 — these are real and Mike wants them, but not in this slice.)

1. **Multi-teacher deck refactor.** Currently `/teacher/deck` finds "the" public class via `is_public=true limit 1`. The architectural fix (per-teacher decks proper, sorting by teacher, starring photos for inclusion in rounds) is bigger.

2. **"+ New class" affordance.** Mike will have multiple classes; needs UI to create them.

3. **Game-start email notification.** When teacher sets `game_starts_at`, ideally students get an email.

4. **Active-class lifecycle automation.** Nothing flips `enrollments.status` from active → completed today.

5. **Deck sorting by teacher + starring photos for round inclusion.**

6. **Dashboard ordering rework.** Mike wants: current round on top, future rounds ASC, archived at bottom as 2-3 column tiles.

---

## Carry-over follow-ups (still pending)

- **RPC defensive filter.** `class_top_three_reveal` v2 doesn't filter `entry.round_number <= classes.total_rounds`. (RPC no longer used by reveal page but may be called elsewhere.)
- **Privacy disclosure for comment-writers.** Students should know their comments may be shown to classmates at reveal.

---

## Files deleted / unused (cleanup)

| File | Status |
|---|---|
| `src/app/student/results/RevealCeremony.tsx` | Unused — old ceremony. Safe to delete. |
| `src/app/teacher/students/[id]/csv-button.tsx` | Unused — CSV removed from student detail. Safe to delete. |

---

## Test data state

### Classes

| name | id | total_rounds | round_duration_hours | game_starts_at | notes |
|---|---|---|---|---|---|
| Spotlight — Mike's First Class | `bac4d923-8eaa-4feb-8e68-cbbe6d0d82aa` | 8 | 0.2500 | 2026-06-12 17:51 UTC | 3 students + 8 seed voters, 15-min rounds |
| Spotlight — Mike's Second Class | `d9ce91d4-793f-4ed9-81ea-201c0d15602e` | 5 | 0.5000 | past | 1 student (Mike) + 8 seed voters, game over |

### Accounts

| email | display name | role |
|---|---|---|
| `getgroovr@yahoo.com` | Mike (getgroovr) | teacher of both classes; also a student in First Class |
| `myked70@yahoo.com` | myked | student in First Class |
| `myked70og@gmail.com` | Lovesick | student in First Class |
| `thomasoconnor@hotmail.com` | — | student in First Class, profile not finished |

### Seed voters

`seed-voter-1@test.local` through `seed-voter-4@test.local` (original).
`seed-voter-5@test.local` through `seed-voter-12@test.local` (added chat #34, UUID prefix `a0000000-...`).

### entry_status enum

`{pending, live, archived, rejected}` — `rejected` added in chat #34.

### entries table

New column `rejection_reason text` added in chat #34.

---

## Key gotchas / corrections

### Two-track student IDs (carries forward)

`students.id` (used by enrollments, game_sessions, submissions, teacher_comments) ≠ `profiles.id` (= auth.users.id, used by entries.student_id). The bridge is email (lower-cased).

### Pending queue student name resolution

The pending queue resolves names by: `entries.student_id` → `admin.auth.admin.getUserById()` → email → match to `students.screen_name` via enrollment data. This is N queries per unique student_id but acceptable for small pending queues.

### DB changes not in migration files

All schema changes applied directly in Supabase SQL Editor:
- CHECK constraint on `round_duration_hours`
- Column widened to `numeric(8,4)`
- `profiles.display_name text` column
- `entry_status` enum: added `rejected`
- `entries.rejection_reason text` column

Consider a catch-up migration file.

---

## Files that matter for next session

### Tier 1 — must be in context before coding

| file | why |
|---|---|
| `src/app/teacher/students/page.tsx` | Fix pending queue thumbnails |
| `src/app/teacher/students/pending-queue.tsx` | Add teacher comment on approve, fix thumbnails |
| `src/app/teacher/students/actions.ts` | Add comment param to approveEntry |
| `src/lib/student-archive.ts` | Add rejectionReason to OwnEntry |
| `src/app/student/dashboard/page.tsx` | Student rejection UX + approved sticker |
| `src/app/student/dashboard/AddEntryForm.tsx` | Check which bucket student entries upload to (fixes thumbnail bug) |

### Tier 2 — reference, load if asked

| file | why |
|---|---|
| `src/app/teacher/students/class-header.tsx` | Pattern reference |
| `src/app/student/dashboard/RemoveEntryButton.tsx` | Understand remove flow for rejection re-upload |
| `src/app/student/dashboard/ProfileArchive.tsx` | Already in context from chat #34 |
| `src/lib/round-timing.ts` | Timing math reference |
| `src/lib/supabase-server.ts` | Auth pattern reference |

---

## What NOT to do

- **Don't start coding without seeing the existing files.** (preference #4)
- **Don't give line-by-line patches.** Always produce the full replacement file. (preference #1)
- **Don't issue bash/grep/curl commands.** PowerShell or SQL only. (preference #2)
- **Don't invent DB migration numbers.** Mike applies SQL directly in the Supabase SQL Editor.
- **Don't use "CSV" in user-facing text.** Use "spreadsheet." (preference #12)
- **Don't use arrows for collapsible rounds.** Use "See the round" / "Close the round" toggle buttons. (preference #11)

---

## Trust the handoff. Trust the design decisions captured here.

Start by confirming which files are needed for the chosen next task.
