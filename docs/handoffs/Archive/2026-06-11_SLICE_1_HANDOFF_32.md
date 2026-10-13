# 2026-06-11 Slice 1 Handoff #32

- **READ THIS HANDOFF before doing anything.** Always.
- **First action:** Mike should pre-load the files listed in the "Files that matter" section below. If they aren't all in context, ask before proceeding.
- Focus is step 6 (teacher-name field + scope filter on `/teacher/deck`) and step 7 (per-student CSV + collapsed past rounds on `/teacher/students/[id]`), plus the CSV-per-class scoping that was agreed but not yet implemented.

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

10. **Label editability clearly.** If a field looks like a title but is actually editable, give it a small label so the affordance is discoverable. (Caught in chat #32 when the class name input was mistaken for a static heading.)

---

## TL;DR — current state

- The teacher UI slice has 7 ordered steps. **Steps 1–5 are done and committed** on branch `slice-1a`.
- **Step 6 (teacher-name field + scope filter on `/teacher/deck`) is next.** Two small changes — a `display_name` field at the top of the deck page, and `.eq("student_id", user.id)` on the starters query.
- **Step 7 (per-student CSV + collapsed past rounds)** follows immediately after.
- **CSV-per-class scoping** was agreed in chat #32 but the code wasn't delivered. Implement alongside or after step 7.

---

## What got done this chat (#32)

### Step 4 — class management header + class switcher (committed)

New client component `src/app/teacher/students/class-header.tsx` handles:
- **Class switcher dropdown** — selects one class via `?class=<id>` query param (refresh-safe, link-safe). Default = most recently created class (ordered by `classes.created_at DESC`).
- **Compact settings panel** — three fields on one row (rounds, duration pulldown, game-starts-at datetime picker). Class name on its own row above with a "Class name" label. Status pill floats right on the name row.
- **Status line** — four states: "Not yet scheduled." / "Scheduled to start <date>." / "Game started Xd ago — round Y of Z" / "Game complete — Z rounds finished."
- **Warning/error/success bands** — amber for past-start soft warning, red for validation errors, inline green "Saved." for success.
- **Form remounts on class switch** via `key={selectedClass.id}` so uncontrolled inputs reset cleanly.
- **Datetime conversion** ISO→local happens in `useEffect` on the client to avoid hydration mismatch.

Students page (`src/app/teacher/students/page.tsx`) rebuilt to:
- Fetch ALL classes for the teacher and pass them to the header.
- Filter the student grid to the SELECTED class only (was unioning all classes).
- Compute the status line server-side via `round-timing.ts`.

### Step 5 — top nav strip (committed)

Two-link horizontal nav: "Class | Deck". Replaces the old "← Back to deck" link.
- On `/teacher/students`: "Class" is active (bold, orange accent, underline), "Deck" is a muted link.
- On `/teacher/deck`: "Deck" is active (bold, fuchsia accent, underline), "Class" is a muted link.
- The old "← Back to deck" is removed from both pages.
- Wording: "Class" and "Deck" — NOT "Go to deck" as originally planned; Mike saw the tabs and preferred the shorter labels.

### Duration options expanded (committed + DB migration)

Added "2 days" (48h) and "1 week" (168h) to the duration pulldown. Three things moved together:
- `DURATION_OPTIONS` in `class-header.tsx`
- `ALLOWED_DURATION_HOURS` in `actions.ts`
- CHECK constraint on `classes.round_duration_hours`

### DB schema changes (applied manually, not in migration files)

1. **CHECK constraint relaxed:** `round_duration_hours IN (0.25, 0.5, 1, 2, 5, 24, 48, 168)`
2. **Column widened:** `round_duration_hours` from `numeric(6,4)` to `numeric(8,4)`. The `(6,4)` precision couldn't hold 168 (needs 7 digits: `168.0000`) — caused "numeric field overflow" on 1-week saves. This also explained the "2 days reverting to 1 day" bug: 48 DID fit in (6,4) and was saving correctly, but the teacher UI was round-tripping through PostgREST which returned the value as a string like "48.0000" and the `durationSelectValue` computation handled that fine. The revert Mike saw was likely a stale-render timing issue or a prior attempt when the constraint was still wrong.

---

## The slice plan — 2 of 7 steps remain, plus 1 agreed change

### Step 6 — teacher-name field + scope filter on `/teacher/deck`

Two small changes:

1. **Teacher name field at top of page** — reads/writes `profiles.display_name`. New small server action. Feeds the default class-name string in step 4's class creation flow (deferred, but the field needs to exist now so there's a value to read).
2. **Filter deck listing to current teacher.** Add `.eq("student_id", user.id)` to the starters query in `src/app/teacher/deck/page.tsx`. Each teacher sees only their own uploads in the "Current pool" section. `/play` (via `loadGenericDeck`) is untouched and continues to union everything across teachers.

### Step 7 — per-student CSV + collapsed past rounds on `students/[id]/page.tsx`

1. **CSV download button** in the header of the per-student page. Show the button always (not gated on `isGameOver`).
2. **Collapse past rounds into expandable buttons.** Mirror the pattern from the student's own dashboard. Only the current round is expanded; past rounds show as condensed expandable tiles.

### CSV-per-class scoping (agreed in chat #32, not yet implemented)

The `/teacher/students/export` route currently exports ALL classes the teacher owns into one CSV. Mike wants it scoped to the currently selected class. Implementation:
- Append `?class=<id>` to the Export CSV link in `page.tsx` (the class id is already available from `selectedClass.id`).
- In `route.ts`, read the `class` query param. If present and the teacher owns that class, scope all queries to it. If absent, fall back to the current whole-teacher behavior (backwards compat).

---

## Architectural items DEFERRED to later slices/handoffs

These are real and Mike wants them, but not in this slice. Don't pour concrete that blocks them.

1. **Multi-teacher deck refactor.** Currently `/teacher/deck` finds "the" public class via `is_public=true limit 1`. Step 6's scope filter is a tactical fix; the architectural fix (per-teacher decks proper) is bigger. Mike mentioned wanting to "sort the deck by teachers eventually" in chat #32 — that's part of this conversation.

2. **Pending review queue.** Confirmed location: under the class header on the students page, above the student grid. Approval flips `entries.status: pending → live`. Mike's lean is per-class for consistency.

3. **"+ New class" affordance.** Mike will have multiple classes; needs UI to create them. Deferred — for now teachers get classes via the existing seed/setup flow.

4. **Game-start email notification.** When teacher sets `game_starts_at`, ideally students get an email. No UI today.

5. **Active-class lifecycle automation.** Nothing flips `enrollments.status` from active → completed today. Manual for now.

---

## Carry-over follow-ups from handoffs #30–31 (still pending)

These don't block steps 6–7; do them as opportunities arise.

- **Dashboard button rewording.** Current: "See the 3 most favorited students →". New: **"See who got the most favorites →"**. File: `src/app/student/dashboard/page.tsx` end-of-game CTA.
- **Student CSV restoration on dashboard.** Gated on `isGameOver`, sitting alongside the reveal button.
- **RPC defensive filter.** `class_top_three_reveal` v2 doesn't filter `entry.round_number <= classes.total_rounds`. One-liner migration.
- **Dashboard ordering rework.** Mike wants: current round on top, future rounds ASC, archived at bottom as 2-3 column tiles.
- **Privacy disclosure for comment-writers.** Students should know their comments may be shown to classmates at reveal.
- **Commit the dashboard docs-only changes.** Two M files carry comment-only updates from #28.

---

## Test data state

### Classes

| name | id | total_rounds | round_duration_hours | game_starts_at | notes |
|---|---|---|---|---|---|
| Spotlight — Mike's First Class | `bac4d923-8eaa-4feb-8e68-cbbe6d0d82aa` | 5 | 48.0000 | 2026-05-31 17:51 UTC | active test class, 3 students |
| Spotlight — Mike's Second Class | `d9ce91d4-793f-4ed9-81ea-201c0d15602e` | 5 | 0.5000 | 2026-06-09 17:41 UTC | 1 student (Mike) |

Note: Names were updated by Mike during testing in chat #32. `round_duration_hours` column is now `numeric(8,4)`.

### Accounts

| email | display name | role |
|---|---|---|
| `getgroovr@yahoo.com` | Mike | teacher of both classes; also a student in First Class (dual identity) |
| `myked70@yahoo.com` | myked | student in First Class |
| `myked70og@gmail.com` | Lovesick | student in First Class |
| `thomasoconnor@hotmail.com` | — | student in First Class, profile not finished |

### Seed voters

Still in `students` table: `seed-voter-1@test.local` through `seed-voter-4@test.local` (Allie, Bobby, CC, Danno). All have `game_sessions` rows in First Class.

---

## Key gotchas / corrections

### Handoff #31 class names and IDs were stale

The handoff #31 class names ("Spotlight — Front Door" / "Spotlight — Back Door") were the original seed names. Mike renamed them to "Spotlight — Mike's First Class" and "Spotlight — Mike's Second Class" during chat #32 testing. The IDs are unchanged. This handoff has the correct current names.

### Two-track student IDs (carries forward)

Still relevant. `students.id` (used by enrollments, game_sessions, submissions, teacher_comments) ≠ `profiles.id` (= auth.users.id, used by entries.student_id). The bridge is email (lower-cased). Mirror the email-bridge join for any new query touching both worlds.

### Admin client does NOT bypass `is_enrolled_in()`

`is_enrolled_in()` inspects `auth.uid()`, which is null on the service-role JWT. Admin actively FAILS the check. RPCs gated by this function must be called as the user (cookie client), not as admin.

### DB changes not in migration files

The CHECK constraint update and column-type widening from this chat were applied directly in the Supabase SQL Editor, not via numbered migration files. If migrations are ever replayed from scratch, these changes would be missing. Consider adding a catch-up migration file that captures the current state.

---

## Files that matter for next session

### Tier 1 — must be in context before coding

| file | why |
|---|---|
| `src/app/teacher/deck/page.tsx` | Step 6 changes go here (display_name field + scope filter) |
| `src/app/teacher/deck/deck-client.tsx` | May need a new client section for the name field |
| `src/app/teacher/deck/actions.ts` | Step 6 needs a new `saveDisplayName` action here |
| `src/app/teacher/students/[id]/page.tsx` | Step 7 changes go here (CSV button + collapsed rounds) |
| `src/lib/round-timing.ts` | Step 7 needs round-timing math for collapse logic |

### Tier 2 — reference, load if asked

| file | why |
|---|---|
| `src/app/teacher/students/page.tsx` | Pattern reference for the new class header (already done) |
| `src/app/teacher/students/class-header.tsx` | Pattern reference for client component split |
| `src/app/teacher/students/actions.ts` | Pattern reference for server action shape |
| `src/app/teacher/students/export/route.ts` | CSV-per-class scoping changes go here |
| `src/lib/supabase-server.ts` | Auth pattern reference |
| `src/app/student/dashboard/page.tsx` | Pattern reference for collapsed-round tiles (step 7) |

---

## What NOT to do

- **Don't start step 6 before reading the deck page files Mike uploaded.** The existing page has patterns to respect.
- **Don't refactor the deck architecture in this slice.** Step 6 is a one-line scope filter + a name field, NOT the multi-teacher-deck refactor.
- **Don't ask Mike to apply patches.** Full-file replacements (preference #1).
- **Don't issue bash/grep/curl commands.** PowerShell or SQL only (preference #2).
- **Don't invent DB migration numbers.** Mike applies SQL directly in the Supabase SQL Editor.

---

## Trust the handoff. Trust the design decisions captured here.

Start by confirming Mike pre-loaded the Tier 1 files, then proceed to step 6.
