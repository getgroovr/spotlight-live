# SESSION 63 HANDOFF — 6/27/2026

- **READ THIS HANDOFF before doing anything.** Always.
- **First action:** Review "NEXT SESSION" section for the suggested flow.

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

---

## What happened in session 62 (6/27/2026 playtest)

Mike ran a full end-to-end playtest. Key observations:

### What worked well
- **Anonymous link flow** — sent the class link, it correctly routed to the "Finish joining" page. Student had to enroll before playing. Works as designed.
- **Splash page with countdown** — the round announcement screen with the countdown timer appeared and looked great. Mike was excited about this.
- **All 3 rounds ran cleanly** — after fixing the student name issue (see B68 below), the full game from warmup through round 3 completed without errors.
- **Dashboard "Well done" completion screen** — showed correctly with all 3 student rounds marked APPROVED, plus teacher warm-up round.

### New bugs / issues found

| # | Description | Priority | Status |
|---|---|---|---|
| **B68** | **SQL setup is tied to a specific student name.** Mike enrolled as "Casper" instead of "Casper2" and got "Student not found" error. The setup/jump SQL references a specific student name. Either the SQL should be flexible enough to match any enrolled student, or the instructions need to clearly state which name to use. Mike's workaround: edited the SQL to match the new name. **Fix: make the setup SQL use a variable or comment at top for student name, or auto-detect the enrolled student.** | HIGH | New |
| **U8** | **Awards ceremony seed votes still flat.** The seeding still doesn't produce clear winners. **Mike's spec:** give one photo 4 favorite votes, another 3, and another 2 per round. This guarantees a clear gold, silver, and bronze every time. The current seed data distributes votes too evenly, resulting in "no clear favorite" or ties. | HIGH | Carried (was in session 62 handoff) |
| **U9** | **Awards ceremony reveal should be dramatic.** Mike wants countdowns and then reveals of winners one at a time — 3rd place first, then 2nd, then 1st. Should feel like an event, not a static results page. Think Oscar-style envelope opening. | MEDIUM | New |

### Previously open bugs — status update

| # | Description | Priority | Status |
|---|---|---|---|
| B41 | No photo preview in teacher's review card for picture submittals | MEDIUM | Open |
| B48 | Lock favorites after next-round photo upload — remove editing, full-screen celebration | HIGH | Open |
| B49 | Comment editing rules — non-favorites editable until round close, favorite locks on submit | MEDIUM | Open |
| B54 | Completed round section on dashboard should collapse/minimize | LOW | Open |
| B55 | After replaying completed round, button should become "Back to dashboard" | MEDIUM | Open |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |
| B64 | Remove "WHY IT'S MY FAVORITE" section from teacher review card | MEDIUM | From session 62 |
| U1 | Update favorite confirmation text to Mike's exact wording | LOW | From session 62 |
| U2 | Make "upload your photo for next round" more button-like and prominent | LOW | From session 62 |
| U3 | Hide raw filename once photo preview is showing | LOW | From session 62 |
| U6 | Post-final-round banner: awards/ceremony language, not "next round" | MEDIUM | From session 62 |
| U7 | "See the class results →" not "See your results →" | MEDIUM | From session 62 |
| B66 | Fix "next chance is Round 4" — show awards messaging when on final round | MEDIUM | From session 62 |

### Closed / verified this session

| # | Description | Notes |
|---|---|---|
| Splash page | Round announcement with countdown | Works great — Mike loved it |
| Anonymous link flow | Anon user → finish joining → play | Working correctly |

---

## Ideas list

1. **Admin dashboard** — admin limits how many classes a teacher can create; system oversight
2. **Student → teacher messaging** — button in student profile to message the teacher
3. **Student → admin messaging** — separate button to message the admin/support
4. **Auto-class-creation** — when class hits 9 students, system auto-creates next class
5. **Teacher sets desired number of classes** — "I want 4 classes" → system creates 4, fills sequentially
6. **Deployment/hosting setup guide** — Vercel + Supabase + custom domain walkthrough
7. **Round gap timing UI** — student-facing countdown for submission deadline; teacher-facing review window
8. **"Party setup" holding page** — after final round, students see countdown to results reveal
9. **Tie-handling in awards** — with 9 students, ties are common. May need tie-breaking or "shared gold" display.
10. **Awards ceremony dramatic reveal (U9)** — countdown → 3rd place reveal → 2nd → 1st, with animation/fanfare per round. Oscar-envelope style.

---

## NEXT SESSION (63): SQL Seed Fix + Awards Ceremony Redesign

Two main themes: (A) fix the seed SQL so testing is bulletproof, (B) redesign the awards ceremony for drama.

### Chunk A — SQL Seed Fixes (do first)

**Files needed from Mike:**
- Current `all-in-one-setup` SQL (latest version)
- Current `jump-to-round` SQL files (all versions)

**What to do:**
1. **B68:** Add a clear variable/comment at the top of setup SQL for student name. Or better: make jump-to-round SQL detect the most recently enrolled student automatically (query `students` table for the class).
2. **U8:** Rewrite vote distribution so each round has a clear winner structure:
   - Round 1: Student A gets 4 favorite votes, Student B gets 3, Student C gets 2, rest get 0-1
   - Round 2: Different students win (rotate), same 4/3/2 pattern
   - Round 3: Different students again, same pattern
   - This guarantees gold/silver/bronze every round during testing.
3. **B65 (carried):** Fix warmup comment re-creation during jump-to-round (ON CONFLICT DO NOTHING).
4. **B63 (carried):** Add idempotency checks or clear "run all-in-one first" guard at top of jump SQL.

### Chunk B — Awards Ceremony Redesign

**Files needed from Mike:**
- `src/app/student/results/page.tsx` (current awards/results page)
- Any components it imports for rendering round results
- `src/lib/student-archive.ts` (if results use archive queries)

**What to do:**
1. **U9:** Redesign the awards page as a sequential reveal experience:
   - Page loads with all rounds hidden behind "curtains" or cards
   - Each round reveals in order (Round 1 first, or Round 3 first — ask Mike)
   - Within each round: countdown animation (3-2-1), then 3rd place revealed, then 2nd, then 1st
   - Gold/silver/bronze with trophy icons, confetti on 1st place
   - Photo + caption + voter comments shown for each winner
   - "Next round →" button to advance to the next round's reveal
2. **U6/U7:** While in the results page, update any "see your results" copy to "see the class results" / awards language.

### Chunk C (if time) — UI Copy Fixes

**Files needed from Mike:**
- `src/app/student/play/` components
- `src/app/student/dashboard/page.tsx`

**What to do:**
- B64, U1, U2, U3, B66 — the text/layout polish items from session 62.

---

## Files to upload at the start of each next chat

### For Chunk A (SQL fixes):
1. This handoff
2. `all-in-one-setup` SQL (latest version)
3. All `jump-to-round` SQL files

### For Chunk B (Awards redesign):
1. This handoff
2. `src/app/student/results/page.tsx`
3. Any result-rendering components it imports
4. `src/lib/student-archive.ts`

### For Chunk C (UI copy polish):
1. This handoff
2. `src/app/student/play/` — spotlight/play components
3. `src/app/student/dashboard/page.tsx`
