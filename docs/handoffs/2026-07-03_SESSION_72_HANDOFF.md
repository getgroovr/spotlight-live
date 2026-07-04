# Session 72 Handoff — Testing Bugs First, Then Carry-Overs

Date: 2026-07-03

- **READ THIS HANDOFF before doing anything.** Always.
- **First action:** Review "NEXT SESSION" section for the suggested flow.
- **Big change from session 71:** Mike ran a real test pass and found 4 new bugs. Those jump to the front of the queue. Priorities from session 71 (deck.ts mode-aware, spreadsheet enrichment, class request workflow) are still valid but now come AFTER the bug fixes.

---

## Mike's preferences — INCLUDE THIS SECTION VERBATIM IN ALL SUBSEQUENT HANDOFFS

1. **Full-file replacements, NOT patches.** Output the entire new file. Mike does not apply line-by-line edits.
2. **PowerShell and SQL commands only.** Mike's machine is Windows. No grep, bash, sed, curl. Use `Select-String` for grep, etc.
3. **Anything beyond PS/SQL needs explicit direction.** Spell out every step.
4. **Don't start coding without seeing the existing files.** Ask Mike to upload before writing replacements.
5. **Ask before assuming on design questions.** Mike has strong opinions.
6. **Flag what's deferred and why.**
7. **Admit when wrong; correct prior handoffs.**
8. **Concise is good. Over-formatting is not.**
9. **Tighten layouts.** Compact, side-by-side field arrangements.
10. **Label editability clearly.**
11. **Use "See the round" / "Close the round" toggle buttons** on all collapsible round sections.
12. **"Spreadsheet" not "CSV" in user-facing text.**
13. **Verify all NOT NULL columns and FK chains BEFORE writing an INSERT.**
14. **Workflow: request files in chunks Claude can complete independently.**
15. **Always state full destination paths for delivered files.** E.g. "goes to `src/app/teacher/deck/page.tsx`" — never just the filename.

---

## Session 72 test findings — 4 new bugs

Mike ran a full round-1 → round-2 test in an anonymous window (after finally getting the test set up correctly). All bugs are on the student dashboard side except B75 which is data-seeding.

### B72 — Favorite comment on student dash missing "AWAITING APPROVAL" badge

**What Mike saw:** After submitting a favorite comment on his round-1 favorite pic, the student dashboard shows the comment in the "Your comments this round" section with no status indicator. The teacher dashboard correctly shows it in the "2 items need your review" section with Approve/Reject buttons.

**Expected:** The favorite comment card on the student dash should show an `AWAITING APPROVAL` pill (same treatment as the photo submittal card — see screenshot 1 where "Student Round 2" shows the pill).

**Status confirmed:** Mike verified this behavior does NOT exist today — it was never there on the student side, only the teacher side.

**File needed from Mike:** `src/app/student/dashboard/page.tsx` (the section that renders "Your comments this round" / favorite comment cards).

---

### B73 — Rejected favorite comment has no edit/resubmit path on student dash

**What Mike saw:** After the teacher rejected the favorite comment with a note, Mike went back to the student dashboard. The rejected comment appears but there is NO button, link, or affordance to edit and resubmit it. Mike clicked on every element in the comment card — nothing is interactive.

**Compare to photo rejection (which works):** When the photo submittal is rejected, an "Action needed" red banner appears at the top with an "Edit and resubmit →" button (screenshots 3 and 4). The favorite comment needs the equivalent flow.

**Expected:** Rejected favorite comment should either:
- Trigger the same red "Action needed" banner at the top with an "Edit and resubmit →" button, OR
- Show an inline "Edit and resubmit" button on the rejected comment card itself.

Mike's preference not stated yet — **ask before building.**

**Files needed from Mike:**
- `src/app/student/dashboard/page.tsx`
- The action file that handles favorite-comment resubmit (likely `src/app/student/dashboard/actions.ts` or similar — Mike to confirm path)

---

### B74 — Photo resubmit form shows no preview of the newly chosen file

**What Mike saw:** In the "Resubmit for Round 2" form (screenshot 4), after clicking Choose File and picking `IMG_1223.jpeg`, the filename shows but there is no thumbnail preview of the new photo. Student can't verify they picked the right one before hitting Resubmit.

**Expected:** As soon as a file is selected, show a thumbnail preview above or beside the file input. Same treatment students get when they upload their original round photo.

**File needed from Mike:** the resubmit form component. Likely inside `src/app/student/dashboard/page.tsx` or a child component of it. Mike to identify.

---

### B75 — Awards ceremony seeding lost per-photo vote variety

**What Mike saw:** On the awards ceremony page after running `fast-path-results-v5.sql`, only one photo appears with "7 favorite votes" (screenshot 5). Historically the seeding produced a proper distribution: one student with 4 favorite votes, another with 3, another with 2, with a minimum of 2 favorite votes required to qualify for the podium. Mike remembers going through this multiple times in earlier sessions.

**Expected:** Restore the varied vote distribution in the fast-path SQL so the awards ceremony actually shows a 1st / 2nd / 3rd podium, not a single photo.

**Investigation needed:**
- `fast-path-results-v5.sql` is the current version. An earlier version had the distribution logic.
- Check git history: `git log --all -- "*fast-path-results*"` in PowerShell equivalent, or check `docs/` folder for older SQL versions.
- Alternate: `jump-to-round-3-v5.sql` or `jump-to-round-2-v5.sql` may still have the distribution logic that got dropped from the results file.

**Files needed from Mike:**
- `fast-path-results-v5.sql` (current)
- Any prior versions Mike still has (`fast-path-results-v4.sql`, `v3`, etc.)
- `jump-to-round-2-v5.sql` and `jump-to-round-3-v5.sql` for comparison

---

## Suggested chat breakdown

Mike asked about splitting work across chats. Recommended chunks:

### Chat A — Student dash comment/resubmit fixes (B72, B73, B74)
All three bugs live in the student dashboard render + resubmit flow. Doing them together avoids overlapping edits to `page.tsx`.

**Files to upload at start of Chat A:**
- `src/app/student/dashboard/page.tsx`
- `src/app/student/dashboard/actions.ts` (or wherever favorite-comment submit lives)
- Any child components used for the photo resubmit form and comment card
- This handoff

**Design questions to answer FIRST in Chat A:**
1. B73: red banner at top vs. inline edit button on the rejected comment card?
2. B74: thumbnail preview position — replace filename, above filename, or beside?

### Chat B — Seeding fix (B75)
Pure SQL. Standalone.

**Files to upload at start of Chat B:**
- `fast-path-results-v5.sql`
- Older versions if Mike can find them
- `jump-to-round-2-v5.sql`, `jump-to-round-3-v5.sql`
- This handoff

### Chat C — Carry-overs from session 71
Only start this after A and B are shipped and verified. See "Carry-over priorities" section below.

---

## Carry-over priorities from session 71 (still valid, now deferred)

Reviewed each one against session 72 findings. All still relevant, none obsoleted.

### Priority C1: Fix /play route for mode-aware deck loading

**What:** `loadGenericDeck()` in `src/lib/deck.ts` queries `WHERE is_active = true`. Needs to read `admin_settings.warmup_teacher_count` and query the matching column (`selected_solo` / `selected_trio` / `selected_full`).

**File needed from Mike:** `src/lib/deck.ts`

**Scope:** Small — one query change + one admin_settings read. <15 min.

### Priority C2: Spreadsheet enrichment

**What:** Make the student's downloadable spreadsheet capture all their language from the game, not just their photo descriptions.

**Files needed from Mike (all 4 uploaded in session 71 — re-upload for this chat):**
- `src/app/student/dashboard/page.tsx` ⚠️ will also be touched by Chat A above — do Chat A first
- `src/app/student/dashboard/csv-button.tsx`
- `src/app/student/dashboard/export/route.ts`
- `src/lib/student-archive.ts`

**Approach — client-side (recommended):**
1. `page.tsx` already has `roundSessions` from `getStudentArchive()`. It currently passes only `ownEntries` to `StudentDashboardCsvButton`. Change it to also pass `roundSessions` and the warm-up `entries`.
2. `csv-button.tsx` gains new CSV sections: per-round comments + warm-up interactions.
3. Columns: Round | Photo Owner | Photo Description | Your Comment | Is Your Favorite | Teacher Note.

**Scope:** Medium.

### Priority C3: Test admin ↔ teacher deck interaction
Change warm-up mode, verify teacher deck reflects it, verify selection limits, test archive/restore.

### Priority C4: Class request workflow
Teacher clicks "Request a new class" → admin approves → teacher enters warm-up queue.

**Needs:** `class_requests` table, teacher dashboard button, admin approval UI, server actions.

**Files needed from Mike:**
- `src/app/teacher/page.tsx`
- `src/app/admin/admin-client.tsx` (post-session-71)
- `src/app/admin/actions.ts` (post-session-71)

### Priority C5: Messaging — design decision
Mike to decide: full inbox vs. notification notes.

---

## What was delivered in session 71 (recap)

- Admin StatItem order flip
- Teacher archiving: migration `20260702130000_teacher_archiving.sql`, actions `archiveTeacher` / `unarchiveTeacher`, admin dashboard UI split into active vs. archived
- Confirmed: stopping warm-up (all rotation paused/removed) closes the front door to new class formation

---

## NEXT SESSION (73): Suggested flow

**Do Chat A first (student dash B72/B73/B74).** These are visible bugs blocking Mike's test loop.

**Then Chat B (seeding B75).** Independent, unblocks awards ceremony testing.

**Then Chat C (deck.ts + spreadsheet enrichment).** Do deck.ts first — small and standalone. Then spreadsheet, which touches `page.tsx` and should come AFTER Chat A's page.tsx changes land.

**Then class request workflow, then messaging design.**

---

## Open bugs — updated status

| # | Description | Priority | Status |
|---|---|---|---|
| B72 | Favorite comment on student dash missing AWAITING APPROVAL badge | HIGH | NEW session 72 |
| B73 | Rejected favorite comment has no edit/resubmit path | HIGH | NEW session 72 |
| B74 | Photo resubmit form has no preview of newly chosen file | MEDIUM | NEW session 72 |
| B75 | Awards seeding lost per-photo vote variety (all 7, no podium) | HIGH | NEW session 72 |
| U1 | Update favorite confirmation text to Mike's exact wording | LOW | Open — Mike needs to provide copy |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |
| B54 | Completed round section collapse/minimize | LOW | Open — may already be done |
| NEW | `/play` route still queries `is_active` instead of mode columns | MEDIUM | Needs `src/lib/deck.ts` update |

---

## Ideas list

1. **Admin dashboard** — Layout v4 delivered session 69. Session 71 adds teacher archiving. Still needs: class request workflow, archived class count, spreadsheet archiving.
2. **Student → teacher messaging** — Recommendation: start with notification notes.
3. **Student → admin messaging** — Same.
4. **Teacher → admin messaging** — Same.
5. **Auto-class-creation** — When class hits capacity, system auto-creates next class.
6. **Teacher requests new class** — Button on teacher dashboard → admin approves → enters warm-up queue.
7. **Teacher archiving** — DONE (session 71).
8. **Teacher deck photo selection** — DONE (session 70).
9. **Deployment/hosting setup guide** — Vercel + Supabase + custom domain walkthrough.
10. **Round gap timing UI** — Student-facing countdown; teacher-facing review window.
11. **"Party setup" holding page** — After final round, countdown to results reveal.
12. **Tie-handling in awards** — DONE (session 70).
13. **Awards ceremony timing polish** — DONE (session 70).
14. **Multi-teacher warm-up game** — Part of admin dashboard. 1/3/9 teachers.
15. **Teacher rotation system** — Part of admin dashboard.
16. **Spreadsheet archiving** — Archive class spreadsheet with class metadata.
17. **Round timing on admin** — Show/archive round timing info. Low priority.
18. **Spreadsheet enrichment** — Files uploaded; ready to build after Chat A.
19. **Back-to-dashboard links on ceremony** — DONE (session 70).
20. **Incomplete mode selection warnings** — Alert teachers when their active mode doesn't have enough photos selected.

---

## Files to upload at the start of next session

**For Chat A (student dash bugs — do first):**
1. This handoff
2. `src/app/student/dashboard/page.tsx`
3. `src/app/student/dashboard/actions.ts` (or wherever favorite-comment submit + photo resubmit live)
4. Any child components used for the photo resubmit form and comment card

**For Chat B (seeding fix):**
1. This handoff
2. `fast-path-results-v5.sql`
3. `jump-to-round-2-v5.sql`, `jump-to-round-3-v5.sql`
4. Any older `fast-path-results-v*.sql` Mike can find

**For Chat C (deck + spreadsheet, later):**
1. This handoff (updated)
2. `src/lib/deck.ts`
3. `src/app/student/dashboard/page.tsx` (post-Chat-A version)
4. `src/app/student/dashboard/csv-button.tsx`
5. `src/app/student/dashboard/export/route.ts`
6. `src/lib/student-archive.ts`

---

## Current schema highlights

### Tables relevant to admin

| Table | Key columns | Notes |
|-------|-------------|-------|
| `profiles` | id, role, display_name, username, max_classes, is_admin, is_archived | `role` = 'teacher'/'student', `is_admin` boolean overlay, `is_archived` added session 71 |
| `teacher_rotation` | teacher_id (unique), sort_order, status | status: 'recruiting'/'waiting'/'paused' |
| `admin_settings` | id=1 (singleton), warmup_teacher_count | 1/3/9 |
| `classes` | id, teacher_id, name, capacity | capacity default 9 |
| `enrollments` | student_id, class_id, status | status: 'active' |
| `entries` | id, student_id, class_id, media_url, is_starter, is_active, selected_solo, selected_trio, selected_full, description_text | is_starter=true for warm-up deck photos |
| `games` | id, class_id, name, status, round_count | status: 'pending'/'active'/'complete' |

### Admin server actions (`src/app/admin/actions.ts`)

| Action | Purpose |
|--------|---------|
| `updateMaxClasses(teacherId, max)` | Set teacher's max_classes limit |
| `addToRotation(teacherId)` | Add teacher to warm-up queue |
| `removeFromRotation(teacherId)` | Remove teacher from queue |
| `setRotationStatus(teacherId, status)` | Set recruiting/waiting/paused |
| `moveInRotation(teacherId, direction)` | Reorder queue up/down |
| `togglePhotoActive(entryId, active)` | Toggle warm-up photo on/off |
| `updateWarmupMode(count)` | Set 1/3/9 teacher warm-up mode |
| `archiveTeacher(teacherId)` | Set is_archived=true + remove from rotation (session 71) |
| `unarchiveTeacher(teacherId)` | Set is_archived=false, does NOT re-add to rotation (session 71) |

### Teacher deck server actions (`src/app/teacher/deck/actions.ts`)

| Action | Purpose |
|--------|---------|
| `uploadStarter(formData)` | Add photo + description (starts unselected) |
| `deleteStarter(entryId)` | Remove starter (DB + storage) |
| `updateStarterDescription(entryId, text)` | Edit description |
| `toggleModeSelection(entryId, mode, selected)` | Toggle solo/trio/full selection (enforces limits) |
| `toggleStarterActive(entryId, active)` | Legacy — kept for admin dashboard |
| `saveDisplayName(name)` | Write profiles.display_name |

---

## SQL files reference (current versions)

| File | Purpose | Version |
|------|---------|---------|
| `all-in-one-setup-v5.sql` | Full reset + seed 9 students + game setup | v5 |
| `seed-teachers-v1.sql` | Seed 4 fake teacher accounts + classes + rotation | v1 |
| `add-mode-selections.sql` | Add selected_solo/trio/full columns | Session 70 |
| `20260702130000_teacher_archiving.sql` | Add is_archived to profiles | Session 71 |
| `jump-to-round-1-v5.sql` | Approve + start game at round 1 | v5 |
| `jump-to-round-2-v5.sql` | Simulate round 1, advance to round 2 | v5 |
| `jump-to-round-3-v5.sql` | Simulate rounds 1–2, advance to round 3 | v5 |
| `fast-path-results-v5.sql` | Simulate all rounds, end game | v5 — **B75: vote distribution lost, needs fix** |
| `testing-walkthrough-v11.sql` | Test plan + verification queries | v11 |

---

## Known Tailwind issue (ONGOING)

This project's Tailwind build does NOT compile `grid-cols-2`, `grid-cols-3`, `grid-cols-4` etc. into actual CSS. All multi-column layouts MUST use inline styles:
```jsx
style={{ display: "flex" }}          // with flex: 1 children
style={{ display: "grid", gridTemplateColumns: "repeat(N, 1fr)" }}
```
This applies to ALL files. Any future file that needs columns should use inline styles, not Tailwind grid classes.
