# 2026-06-11 Slice 1 Handoff #33

- **READ THIS HANDOFF before doing anything.** Always.
- **First action:** Pre-load the files listed in the "Files that matter" section below. If they aren't all in context, ask before proceeding.

---

## Mike's preferences — INCLUDE THIS SECTION VERBATIM IN ALL SUBSEQUENT HANDOFFS

(Observed across chats; Mike asked these be propagated forward.)

1. **Full-file replacements, NOT patches.** When producing code changes, output the entire new file. Mike does not want to apply line-by-line edits.

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
- **Reveal page is done** — new per-round most-favorited-photo design replaces the old top-3-students ceremony.
- **All carry-over UI fixes from #30–31 are resolved** except the RPC defensive filter and dashboard ordering rework (see Carry-over section).
- The branch is `slice-1a`.

---

## What got done this chat (#33)

### Step 6 — teacher-name field + scope filter (committed)

- `profiles.display_name` column added to DB (manually via SQL Editor).
- `saveDisplayName` server action in `src/app/teacher/deck/actions.ts`.
- "Your name" field at top of `/teacher/deck` (in `deck-client.tsx`). Saves on blur or Enter, shows inline "Saved." confirmation.
- Scope filter: `.eq("student_id", user.id)` on the starters query in `/teacher/deck/page.tsx`. Each teacher sees only their own uploads. `/play` is untouched.

### Step 7 — per-student collapsed rounds on `/teacher/students/[id]`

- `getStudentJourney` now fetches ALL `game_sessions` (not just the most recent), batch-fetches entries, and returns `RoundData[]`.
- Current round expanded at top; past rounds collapse with "See the round" / "Close the round" toggle buttons (CSS-driven via `.round-toggle` class).
- Uses `session.id` as React key to avoid duplicate-key errors when multiple sessions share the same round number.

### CSV-per-class scoping (committed)

- `src/app/teacher/students/export/route.ts` now reads `?class=<id>` query param. Verifies teacher ownership. Falls back to all-classes if param absent.
- Export link moved into `class-header.tsx` next to the class switcher — always scoped to the selected class. Old standalone link removed from `students/page.tsx`.
- Text changed from "+ Export CSV" to "Download class spreadsheet" (stacked two-line layout).

### Class header label updates

- "Class:" → "Current class:" on the switcher label.
- "Duration" → "Duration of each round" on the settings row.

### Splash page fix

- `src/app/page.tsx`: "watch their video" → "look at your classmates' pictures."

### Student dashboard updates

- CTA text: "See the 3 most favorited students →" → "See who got the most favorites →"
- "Download your class spreadsheet" button appears below the CTA when `isGameOver`.
- All completed rounds (student rounds AND Teacher's Warm-up Round) now use "See the round" / "Close the round" toggle buttons.
- `csv-button.tsx` added as client component for the spreadsheet download.

### Reveal page — new design (replaces old ceremony)

- `src/app/student/results/page.tsx` — complete rewrite.
- Old approach: top-3-students podium via `class_top_three_reveal` RPC + `RevealCeremony.tsx` client component.
- New approach: per-round most-favorited PHOTO with comments only from students who favorited it. Handles ties (shows all tied winners). Anonymous throughout.
- Direct queries against `game_sessions` — no RPC dependency.
- Gated on `isGameOver` via `profiles.class_id` → class timing.
- Side-by-side layout: photo+description (1/3 left), comments (2/3 right).
- `RevealCeremony.tsx` is now unused and can be deleted.

### Teacher student detail page — CSV removed

- Per Mike's feedback, the per-student Export CSV button was removed from `/teacher/students/[id]/page.tsx`.
- `csv-button.tsx` in that folder is unused (can be deleted).

---

## Architectural items DEFERRED to later slices/handoffs

These are real and Mike wants them, but not in this slice.

1. **Multi-teacher deck refactor.** Currently `/teacher/deck` finds "the" public class via `is_public=true limit 1`. Step 6's scope filter is a tactical fix; the architectural fix (per-teacher decks proper, sorting by teacher, starring photos for inclusion in rounds) is bigger.

2. **Pending review queue.** Confirmed location: under the class header on the students page, above the student grid. Approval flips `entries.status: pending → live`. Mike's lean is per-class for consistency.

3. **"+ New class" affordance.** Mike will have multiple classes; needs UI to create them. Deferred — for now teachers get classes via the existing seed/setup flow.

4. **Game-start email notification.** When teacher sets `game_starts_at`, ideally students get an email.

5. **Active-class lifecycle automation.** Nothing flips `enrollments.status` from active → completed today. Manual for now.

6. **Reveal page redesign idea (Mike's, chat #33).** Mike suggested showing the most favorited picture per round instead of top-3 students. THIS WAS IMPLEMENTED in chat #33. The old ceremony is gone.

7. **Deck sorting by teacher + starring photos for round inclusion.** Mike mentioned wanting to eventually sort the deck by teacher and let teachers star which photos to include in each round. Deferred.

---

## Carry-over follow-ups (still pending)

- **RPC defensive filter.** `class_top_three_reveal` v2 doesn't filter `entry.round_number <= classes.total_rounds`. One-liner migration. (Note: the RPC is no longer used by the reveal page, but may still be called elsewhere.)
- **Dashboard ordering rework.** Mike wants: current round on top, future rounds ASC, archived at bottom as 2-3 column tiles. The current layout is close but not exactly this.
- **Privacy disclosure for comment-writers.** Students should know their comments may be shown to classmates at reveal.
- **Commit the dashboard docs-only changes.** Two M files carry comment-only updates from #28.

---

## Files deleted / unused (cleanup)

| File | Status |
|---|---|
| `src/app/student/results/RevealCeremony.tsx` | Unused — old ceremony client component. Safe to delete. |
| `src/app/teacher/students/[id]/csv-button.tsx` | Unused — CSV button was removed from teacher student detail. Safe to delete. |

---

## Test data state

### Classes

| name | id | total_rounds | round_duration_hours | game_starts_at | notes |
|---|---|---|---|---|---|
| Spotlight — Mike's First Class | `bac4d923-8eaa-4feb-8e68-cbbe6d0d82aa` | 8 | 0.2500 | 2026-06-12 17:51 UTC | 3 students, 15-min rounds |
| Spotlight — Mike's Second Class | `d9ce91d4-793f-4ed9-81ea-201c0d15602e` | 5 | 0.5000 | past | 1 student (Mike), game over — used to test reveal page |

### Accounts

| email | display name | role |
|---|---|---|
| `getgroovr@yahoo.com` | Mike (getgroovr) | teacher of both classes; also a student in First Class |
| `myked70@yahoo.com` | myked | student in First Class |
| `myked70og@gmail.com` | Lovesick | student in First Class |
| `thomasoconnor@hotmail.com` | — | student in First Class, profile not finished |

### Seed voters

Still in `students` table: `seed-voter-1@test.local` through `seed-voter-4@test.local`.

---

## Key gotchas / corrections

### Handoff #32 corrections applied

- Class names and IDs are current as of end of chat #33.
- The `round_duration_hours` column is `numeric(8,4)` with CHECK constraint `IN (0.25, 0.5, 1, 2, 5, 24, 48, 168)`.
- `profiles.display_name` column exists (added chat #33).

### Two-track student IDs (carries forward)

`students.id` (used by enrollments, game_sessions, submissions, teacher_comments) ≠ `profiles.id` (= auth.users.id, used by entries.student_id). The bridge is email (lower-cased).

### Admin client does NOT bypass `is_enrolled_in()`

`is_enrolled_in()` inspects `auth.uid()`, which is null on the service-role JWT. RPCs gated by this function must be called as the user (cookie client), not as admin.

### DB changes not in migration files

All schema changes from chats #32–33 were applied directly in Supabase SQL Editor:
- CHECK constraint on `round_duration_hours`
- Column widened to `numeric(8,4)`
- `profiles.display_name text` column added

Consider adding a catch-up migration file.

---

## Files that matter for next session

### Tier 1 — must be in context before coding

Depends on what's tackled next. Most likely candidates:

| file | why |
|---|---|
| `src/app/teacher/students/page.tsx` | If tackling pending review queue |
| `src/app/teacher/students/actions.ts` | If tackling entry approval actions |
| `src/app/student/dashboard/page.tsx` | If tackling dashboard ordering rework |
| `src/app/student/results/page.tsx` | If iterating on reveal page layout |

### Tier 2 — reference, load if asked

| file | why |
|---|---|
| `src/app/teacher/students/class-header.tsx` | Pattern reference for client component split |
| `src/app/teacher/deck/page.tsx` | Step 6 reference |
| `src/app/teacher/deck/deck-client.tsx` | Step 6 reference |
| `src/app/teacher/deck/actions.ts` | Server action patterns |
| `src/lib/round-timing.ts` | Timing math reference |
| `src/lib/supabase-server.ts` | Auth pattern reference |

---

## What NOT to do

- **Don't start coding without seeing the existing files.** (preference #4)
- **Don't issue bash/grep/curl commands.** PowerShell or SQL only. (preference #2)
- **Don't invent DB migration numbers.** Mike applies SQL directly in the Supabase SQL Editor.
- **Don't use "CSV" in user-facing text.** Use "spreadsheet." (preference #12)
- **Don't use arrows for collapsible rounds.** Use "See the round" / "Close the round" toggle buttons. (preference #11)

---

## Trust the handoff. Trust the design decisions captured here.

Start by confirming which files are needed for the chosen next task.
