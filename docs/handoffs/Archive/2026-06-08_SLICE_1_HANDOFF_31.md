# 2026-06-08 Slice 1 Handoff #31

- **READ THIS HANDOFF before doing anything.** Always.
- **First action:** Mike should have pre-loaded files per the companion `2026-06-08_HANDOFF_31_FILE_LIST.md`. If they aren't all in context, ask before proceeding.
- The slice plan is mostly resolved; design Qs from #30 are all answered. Focus is step 4 (header + class switcher) and onward.

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

---

## TL;DR — current state

- The teacher UI slice has 7 ordered steps. **Steps 1-3 are done and committed** (round-timing extraction, `classes` table migration for duration values, `saveClassSettings` server action).
- **Step 4 (class management header on `students/page.tsx` + class switcher) is next.** All design questions resolved in chat #31; the server action is ready and waiting for the UI to call it.
- Branch `slice-1a` is clean except 2 docs-only M files (see carry-overs). 5 commits ahead of `origin/slice-1a`, not yet pushed.

---

## What got done this chat (#31)

### Architectural clarifications from Mike

- **Warm-up round (deck) = cross-teacher pool.** Multiple teachers can contribute photos; students enroll in the class belonging to the pic they favorited. The existing `loadGenericDeck` in `src/lib/deck.ts` already unions all `is_public=true` classes — the architecture matches the design.
- **Round 1+ = one teacher per class.** Teachers can have multiple classes simultaneously. Teacher names the class.
- **Default class name format:** `Spotlight - {display_name}'s Class {M/D/YYYY}`, falling back to email local-part if `display_name` is null. (Step 6 adds the field for setting display_name on `/teacher/deck`.)
- **Teacher emails students the start time** once class fills. Email notification UI is deferred but flagged.
- **Past start times allowed** with a soft warning surface so typos don't slip through silently.

### Step 1 — round-timing extraction (committed)

`src/lib/round-timing.ts` is the new home for `ClassTiming`, `computeCurrentRound`, `isRoundLocked`, `isGameOver`. Standardized on `ClassTiming` (was `TimingShape` in two files) and `isGameOver` (was `computeIsGameOver`). Lifted `isRoundLocked` into the shared module too — only `play/actions.ts` had it, but the teacher UI (step 4) needs it.

Math is bit-identical to the originals; pure structural cleanup.

Now imported by:
- `src/lib/student-archive.ts`
- `src/app/student/results/page.tsx`
- `src/app/play/actions.ts`

Sanity-check the next Claude can run any time:
```powershell
Select-String -Path src\**\*.ts,src\**\*.tsx -Pattern "TimingShape|computeIsGameOver"
```
Should match only inside `round-timing.ts`'s own docstring (historical context line). Anywhere else = drift.

### Step 2 — `classes.round_duration_hours` migration (committed)

Relaxed the `CHECK` constraint from `(1, 24, 168)` to `(0.25, 0.5, 1, 2, 5, 24)`, and promoted the column type to `numeric(6,4)` so fractional hours are exact. Existing rows (Front Door, Back Door) preserved at `24.0000`.

These six values are what the teacher pulldown will offer in step 4.

### Step 3 — `saveClassSettings` server action (committed)

New file: `src/app/teacher/students/actions.ts`

Single action backing the (next-step) header's Save button. Handles all four fields together: `name`, `total_rounds`, `round_duration_hours`, `game_starts_at`. Auth scoped by `id + teacher_id` on the UPDATE — RLS belt-and-suspenders.

Returns `SaveClassSettingsResult` = `ActionResult | {ok: true, warning: string}`. Past start times allowed; warning is the soft surface for typo catch.

---

## The slice plan — 4 of 7 steps remain

### Step 4 — class management header + class switcher on `students/page.tsx`

The visible UI for step 3's action. Locked design:

- **Class switcher (inline dropdown).** Mike's current view unions all his classes into one student list — that breaks now. The switcher selects one class via `?class=<id>` query param (refresh-safe, link-safe). Default = the most recently created class.
- **Compact settings panel** below the dropdown:
  - Name (text input)
  - Rounds (number input, 1-100)
  - Duration (pulldown: "15 min" / "30 min" / "1 hour" / "2 hours" / "5 hours" / "1 day" — backed by `0.25 / 0.5 / 1 / 2 / 5 / 24`)
  - Game starts at (datetime-local picker, optional — empty = "not yet set")
  - Save button (posts to `saveClassSettings`)
- **Status line.** Once `game_starts_at` is set, show "Game started Xd ago — round Y of Z" computed via `round-timing.ts`. Before that, "Not yet scheduled."
- **Warning surface.** If `saveClassSettings` returns `{ok: true, warning}`, render in an amber band above the form.
- **Student grid below** filters to the selected class. (Currently joins on all teacher's classes — that filter tightens.)

Editability after game starts: yes (Mike: "would be bad practice but teachers will need it sometimes"). No confirmation dialog for v1; the soft-warning band is enough.

### Step 5 — top nav strip on both teacher pages

Replace the awkward "← Back to deck" link with a small horizontal nav: `Class | Deck`. Mirror it on `/teacher/deck` so navigation is bidirectional. Mike specifically called out **"Go to deck"** (not "Back to deck") for the wording.

### Step 6 — teacher-name field + scope filter on `/teacher/deck`

Two small changes:

1. **Teacher name field at top of page** — reads/writes `profiles.display_name`. New small server action. Feeds the default class-name string in step 4.
2. **Filter deck listing to current teacher.** Add `.eq("student_id", user.id)` to the starters query in `src/app/teacher/deck/page.tsx`. Each teacher sees only their own uploads in the "Current pool" section. `/play` (via `loadGenericDeck`) is untouched and continues to union everything across teachers.

### Step 7 — per-student CSV + collapsed past rounds on `students/[id]/page.tsx`

1. **CSV download button** in the header of the per-student page. Mike: "who cares if the teacher wants to use this earlier, so be it." Don't hard-gate on `isGameOver` — show the button always.
2. **Collapse past rounds into expandable buttons.** Mirror the pattern from the student's own dashboard. Only the current round is expanded; past rounds show as condensed expandable tiles (photo over name, similar to the dashboard's archive pattern).

---

## Architectural items DEFERRED to later slices/handoffs

These are real and Mike wants them, but not in this slice. Don't pour concrete that blocks them.

1. **Multi-teacher deck refactor.** Currently `/teacher/deck` finds "the" public class via `is_public=true limit 1`. The step-6 scope filter is a tactical fix; the architectural fix (per-teacher decks proper) is bigger. Likely shape: a teacher's deck = `entries where student_id=teacher.id AND is_starter=true`; may or may not need a new `decks` table. The "max classes per teacher" + "teacher can spawn class B from same pool when class A fills" mechanics are part of this conversation.

2. **Pending review queue.** Mike wants this prominently surfaced near the top of the students page, under the class header. Approval flips `entries.status: pending → live`. Scope per-class vs cross-class — Mike's lean is per-class for consistency with the rest of the page.

3. **"+ New class" affordance.** Mike will have multiple classes; needs UI to create them. Deferred — for now teachers get classes via the existing seed/setup flow.

4. **Game-start email notification.** When teacher sets `game_starts_at`, ideally students get an email with the start time. No UI today; teacher will hand-email students.

5. **Active-class lifecycle automation.** Nothing flips `enrollments.status` from active → completed today. Manual for now.

---

## Carry-over follow-ups from handoff #30 (still pending)

These don't block step 4; do them as opportunities arise.

- **Dashboard button rewording.** Current: "See the 3 most favorited students →". New: **"See who got the most favorites →"**. File: `src/app/student/dashboard/page.tsx` end-of-game CTA.
- **Student CSV restoration on dashboard.** Gated on `isGameOver`, sitting alongside the reveal button. The teacher CSV still goes on the teacher side; both can coexist.
- **RPC defensive filter.** `class_top_three_reveal` v2 doesn't filter `entry.round_number <= classes.total_rounds`. One-liner in a migration: add `AND e.round_number <= v_total_rounds`.
- **Dashboard ordering rework.** Mike wants: current round on top, future rounds ASC, archived at bottom as 2-3 column tiles.
- **Privacy disclosure for comment-writers.** Students should know their comments may be shown to classmates at reveal. Right place: comment-writing step in the play flow.
- **Commit the dashboard docs-only changes.** Two M files (`src/app/student/dashboard/page.tsx`, `src/app/student/dashboard/RemoveEntryButton.tsx`) carry comment-only updates from #28 planning. Trivial commit any time.

---

## Test data state

### Classes

| name | id | total_rounds | round_duration_hours | game_starts_at | notes |
|---|---|---|---|---|---|
| Spotlight — Front Door | `d9ce91d4-793f-4ed9-81ea-201c0d15602e` | 5 | 24.0000 | now() - 6 days | configured + seeded |
| Spotlight — Back Door | `bac4d923-8eaa-4feb-8e68-cbbe6d0d82aa` | 5 | 24.0000 | now() - 6 days | **active test class** |

Note: `round_duration_hours` column is now `numeric(6,4)` post-step-2 migration; values render as `24.0000`.

### Accounts

| email | display name | role |
|---|---|---|
| `getgroovr@yahoo.com` | Mike | teacher of both classes; also a student in Front Door (dual identity) |
| `myked70@yahoo.com` | myked | student in Back Door |
| `myked70og@gmail.com` | Lovesick | student in Back Door |
| `thomasoconnor@hotmail.com` | — | profile exists, not enrolled |

### Seed voters

Still in `students` table only: `seed-voter-1@test.local` through `seed-voter-4@test.local` (Allie, Bobby, CC, Danno). All have `game_sessions` rows favoriting myked's entries in Back Door.

Cleanup if needed:
```sql
DELETE FROM game_sessions WHERE student_id IN (SELECT id FROM students WHERE email LIKE 'seed-voter-%@test.local');
DELETE FROM students WHERE email LIKE 'seed-voter-%@test.local';
```

---

## Key gotchas / corrections to prior handoffs

### Handoff #30 said `actions.ts` was at `src/app/student/actions.ts`

Wrong. The file with the round-timing duplicates was at `src/app/play/actions.ts`. The chat tripped on this when looking for it. Don't trust path claims in old handoffs without `Select-String` verifying first.

### Two-track student IDs (carries forward from #29 / #30)

Still relevant. `students.id` (used by enrollments, game_sessions, submissions, teacher_comments) ≠ `profiles.id` (= auth.users.id, used by entries.student_id). The bridge is email (lower-cased). Mirror the email-bridge join for any new query touching both worlds.

### Admin client does NOT bypass `is_enrolled_in()`

From #30, repeated here because it's easy to forget: `is_enrolled_in()` inspects `auth.uid()`, which is null on the service-role JWT. Admin actively FAILS the check. RPCs gated by this function must be called as the user (cookie client), not as admin. Use admin only for storage signing.

---

## Files that matter

A companion document — `2026-06-08_HANDOFF_31_FILE_LIST.md` — enumerates every file the next chat will need with exact paths, grouped by tier. Mike loads them all up-front instead of file-by-file ping-pong.

---

## What NOT to do

- **Don't start step 4 before reading every file Mike uploaded.** The existing students page has patterns to respect; the deck page has the design tokens.
- **Don't refactor the deck architecture in this slice.** Step 6 is a one-line scope filter, NOT the multi-teacher-deck refactor. That's a separate conversation Mike will trigger when ready.
- **Don't ask Mike to apply patches.** Full-file replacements (preference #1).
- **Don't issue bash/grep/curl commands.** PowerShell (`Select-String`) or SQL only (preference #2).
- **Don't reference the migration #26 CHECK as authoritative.** It's been superseded by the step-2 migration in this chat (now `(0.25, 0.5, 1, 2, 5, 24)`).

---

## Trust the handoff. Trust the design decisions captured here.

Start by confirming Mike pre-loaded the files from the companion document, then proceed to step 4.
