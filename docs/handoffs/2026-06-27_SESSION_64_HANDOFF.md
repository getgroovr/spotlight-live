# SESSION 64 HANDOFF — 6/27/2026

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

## What happened in session 63

### Chunk A — SQL Seed Fixes (all done)

All SQL files bumped from v4 → v5:

- **B68 (fixed):** `all-in-one-setup-v5.sql` now has a `v_student_name` variable on line 26. Change it to match whatever name you type in the "Finish joining" form. All Phase 5 references use the variable.
- **U8 (fixed):** All jump-to scripts now use 4/3/2 vote distribution (not the old even-spread modular math). Every round gets clear gold (4 votes), silver (3), bronze (2) with different winning entries per round. Fast-path already had this; jump-to-round-2 and jump-to-round-3 were the ones still using flat distribution.
- **B63 (fixed):** All jump-to and fast-path scripts have a guard that checks for a game row and raises an exception if setup wasn't run first.
- **B65:** Carried forward from v4 — ON CONFLICT DO NOTHING, plus favorite_comment_status approved.
- **testing-walkthrough-v11.sql:** Updated file references to v5, corrected expected vote distributions, added B68 note.

Mike confirmed: all-in-one-setup-v5 ran successfully (screenshot verified).

### Chunk B — Awards Ceremony (done, iteration in progress)

Two new files replace the old static results page:

- `src/app/student/results/page.tsx` — thin server wrapper, fetches data via `getGameResults()`, passes serialized rounds to the client component.
- `src/app/student/results/ResultsCeremony.tsx` — "use client" component with the full ceremony.

**Ceremony flow (v2, per Mike's feedback):**
1. Intro: "The Spotlight Awards" + trophy + class name + "Begin the ceremony →"
2. Per round: combined Round N + countdown 3-2-1 on one screen
3. Medal splash: big 🥉 emoji → bronze winner card (replaces countdown)
4. Medal splash: big 🥈 → silver card (replaces bronze)
5. Medal splash: big 🥇 → gold card (replaces silver) + confetti burst
6. Podium: all winners shown together (silver-left, gold-center-tall, bronze-right) + "Next round →"
7. After last round: "That's a wrap!" finale with full confetti + round summary cards + "Back to dashboard →"

**Key design decisions (from Mike):**
- Each medal reveal REPLACES the previous one (not stacked). Only after gold should all three appear together on the podium.
- Missing placements silently skipped — no "not enough votes" messages.
- Confetti escalates: 18 pieces for bronze, 35 for silver, 70 for gold, 100 for finale.
- Timing constants are at the top of the file for easy tweaking: COUNTDOWN_STEP_MS (800), MEDAL_SPLASH_MS (1200), CARD_DISPLAY_MS (2800), GOLD_CONFETTI_MS (1400).

**Mike's playtest feedback (not yet applied):**
- "It's pretty good!" — overall positive.
- May want to refine timing, podium sizing, or transitions after live testing.
- Ceremony reveals rounds in chronological order (1→2→3). Confirmed by Mike.

### Chunk C — UI Copy Fixes (partial)

**Fixed this session:**
- **B66:** Dashboard line 1246 — "your next chance is Student Round N+1" no longer shows "Round 4" when totalRounds is 3 or null. Three-way branch: awards message if final round, next-round message if more exist, generic fallback if totalRounds unknown.
- **U6:** Play page game-over text now uses awards/ceremony language ("Time for the awards ceremony!" not "See which photos…").
- **U7:** Play page game-over link now says "🏆 Go to the awards ceremony →". Dashboard CTA was already correct ("🏆 See the class results →").

**NOT fixed (need files not uploaded):**
- **B64:** Remove "WHY IT'S MY FAVORITE" section from teacher review card — need `src/app/teacher/` review component.
- **U1:** Update favorite confirmation text to Mike's exact wording — need game/spotlight play component (the favorite-pick dialog).
- **U2:** Make "upload your photo for next round" more button-like — need the in-game upload prompt component.
- **U3:** Hide raw filename once photo preview is showing — need the file-upload component.

---

## Open bugs — status update

| # | Description | Priority | Status |
|---|---|---|---|
| B41 | No photo preview in teacher's review card for picture submittals | MEDIUM | Open |
| B48 | Lock favorites after next-round photo upload — remove editing, full-screen celebration | HIGH | Open |
| B49 | Comment editing rules — non-favorites editable until round close, favorite locks on submit | MEDIUM | Open |
| B54 | Completed round section on dashboard should collapse/minimize | LOW | Open |
| B55 | After replaying completed round, button should become "Back to dashboard" | MEDIUM | Open |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |
| B64 | Remove "WHY IT'S MY FAVORITE" section from teacher review card | MEDIUM | Open — needs teacher component |
| U1 | Update favorite confirmation text to Mike's exact wording | LOW | Open — needs play component |
| U2 | Make "upload your photo for next round" more button-like and prominent | LOW | Open — needs play component |
| U3 | Hide raw filename once photo preview is showing | LOW | Open — needs upload component |

### Closed / verified this session

| # | Description | Notes |
|---|---|---|
| B68 | SQL setup tied to specific student name | Fixed — v_student_name variable |
| U8 | Awards ceremony seed votes still flat | Fixed — 4/3/2 in all scripts |
| B63 | Jump scripts run without fresh setup → stale state | Fixed — guard checks |
| B66 | "next chance is Round 4" on final round | Fixed — three-way branch |
| U6 | Post-final-round banner: awards/ceremony language | Fixed — play page updated |
| U7 | "See the class results" not "See your results" | Fixed — dashboard + play page |
| U9 | Awards ceremony dramatic reveal | Done — sequential reveal with podium |

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
10. **Awards ceremony timing polish** — Mike may want to adjust reveal durations, podium sizing, or add sound effects after live testing.

---

## NEXT SESSION (64): Teacher Dashboard + Multi-Teacher

The last big hurdle. Mike wants to break this into distinct chats if needed.

### What "multi-teacher" means

Right now the system has one teacher. The goal is:
- Multiple teachers can exist, each with their own classes.
- A teacher sees only THEIR classes and THEIR students.
- Admin can see everything (future — idea #1).
- The teacher dashboard needs to handle class creation, configuration, and game management across multiple classes.

### Chunk D — Teacher Dashboard Audit + Multi-Class View

**Files needed from Mike:**
1. This handoff
2. `src/app/teacher/` — entire directory listing (`Get-ChildItem -Recurse`)
3. `src/app/teacher/page.tsx` or `src/app/teacher/dashboard/page.tsx` (the main teacher landing page)
4. `src/app/teacher/students/page.tsx` (student management / review queue)
5. Any shared teacher components (layout, nav, sidebar)
6. `src/lib/` — any teacher-specific data fetchers (e.g. `teacher-data.ts`, `class-management.ts`)
7. Database schema reference: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;`

**What to do:**
1. Audit the teacher dashboard for hardcoded single-class assumptions.
2. Build a multi-class view: teacher lands on a class selector (or sees all classes in a list), then drills into one class at a time.
3. Each class view shows: enrolled students, pending review queue, game status, round progress.
4. "Create new class" flow.

### Chunk E — Teacher Review Queue (per-class)

**Files needed from Mike:**
1. This handoff
2. `src/app/teacher/students/page.tsx`
3. Any review-card components it imports
4. `src/lib/` teacher data-fetching modules

**What to do:**
1. Scope review queue to the selected class (not global).
2. B64: Remove "WHY IT'S MY FAVORITE" from teacher review card.
3. B41: Add photo preview to teacher review card for picture submittals.

### Chunk F — Game Configuration + Class Management

**Files needed from Mike:**
1. This handoff
2. Teacher class creation page/component (if it exists)
3. Game start/configuration UI
4. Database migrations or schema for `games` table
5. `src/lib/round-timing.ts` (for game start/round logic)

**What to do:**
1. Teacher can create a new class from the dashboard.
2. Teacher configures game: sets round count, round duration, starts game.
3. Teacher can manage multiple games across multiple classes.
4. Class link generation for student enrollment.

### Chunk G — Auth + Profile Scoping

**Files needed from Mike:**
1. This handoff
2. `src/lib/supabase-server.ts` (auth helpers)
3. `src/middleware.ts` (route protection)
4. `src/app/teacher/layout.tsx`
5. RLS policies (if any) — `SELECT * FROM pg_policies;`
6. `profiles` table structure and any teacher-specific columns

**What to do:**
1. Ensure teacher auth is scoped: each teacher can only see their own classes/students.
2. RLS policies if not already in place.
3. Teacher profile management (name, email, etc.).

---

## Recommended approach for session 64

Start with **Chunk D** — the teacher dashboard audit. This will reveal the scope of the multi-teacher work: how much is already multi-class-ready vs. how much assumes a single teacher/class. The audit findings will shape how much work Chunks E-G actually need.

Mike should upload the teacher directory tree first so Claude can see the full picture before writing any code.

---

## Files to upload at the start of each next chat

### For Chunk D (teacher dashboard audit):
1. This handoff
2. Output of: `Get-ChildItem src/app/teacher -Recurse -Name`
3. `src/app/teacher/page.tsx` (or dashboard equivalent)
4. `src/app/teacher/students/page.tsx`
5. Any layout/nav files in the teacher directory
6. Schema dump (SQL query above)

### For remaining Chunk C items (B64, U1, U2, U3):
1. This handoff
2. Teacher review card component (for B64)
3. `src/game/shell.tsx` or the spotlight/play components (for U1)
4. The in-game upload prompt component (for U2, U3)
