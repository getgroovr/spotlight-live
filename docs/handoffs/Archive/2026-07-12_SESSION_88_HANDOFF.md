# SESSION 88 HANDOFF
**Date:** 2026-07-12
**Session range covered:** 84–88
**Supabase project:** ilctdtppstvmpvuvdqvf

---

## ⭐⭐ HOW TO WORK WITH MIKE — DO NOT REMOVE THIS SECTION

> **INCLUDE THIS SECTION VERBATIM IN ALL SUBSEQUENT HANDOFFS. DO NOT TRUNCATE, SUMMARIZE, OR OMIT IT.**

These are not preferences to honor when convenient. They are the working agreement.

1. **Whole-file replacements, delivered as DOWNLOADABLE FILES via `present_files` — NEVER pasted into chat as code blocks.** Write the file to `/mnt/user-data/outputs/<name>.<ext>` and call `present_files`. Mike downloads it and drops it into VS Code at the exact path you state. Do NOT say "replace the saveProfile function with…" — give the entire file as a download. Long files pasted into chat get corrupted by smart quotes, line-ending mangling, and copy-paste fatigue.

2. **One copy-clip = one command.** Never put two things to run in a single code block. "Run this SQL, then paste the result, then run this" = THREE separate blocks. Each block self-contained, copyable whole.

3. **Mike runs SQL (Supabase SQL editor) and PowerShell (VS Code integrated terminal) comfortably.** Lean on those. One result set per SQL run. **PowerShell commands go in the VS Code terminal, NOT the Supabase SQL editor.** If a different tool is ever needed, walk him through it step by step.

4. **Read his screenshots.** When he posts a file-tree or terminal screen grab, the answer is usually right there. Look before guessing.

5. **Don't inflate scope.** When something is small, say it's small and just do it.

6. **Confirm before building on an unknown.** If a file hasn't been seen, don't write code that assumes its contents. Ask for the file first.

7. **Two-track student IDs — do not conflate.**
   - `students.id` is the **students track**. Used by `enrollments`, `students`, `game_sessions.student_id`.
   - `profiles.id` = `auth.users.id` is the **profiles track**. Used by `entries.student_id` (column named `student_id` but FKs to `profiles`). Class membership on this track lives on `profiles.class_id`.
   - When in doubt: entries are on the profiles track; everything else students-related is on the students track.

8. **Don't `DELETE FROM students` to reset.** Cascade chain wipes things you don't want gone. Use targeted deletes.

9. **When Mike says he's running out of context, finish what's in flight.** Don't start a new feature. Ship the migration, write the handoff, stop.

10. **`supabase/migrations/` = STRUCTURAL ONLY.** Seeds, proofs, diagnostics are snippets in chat — not committed migration files. Migration filenames use `YYYYMMDDHHMMSS_description.sql` (14 digits).

11. **Working agreement.** Mike holds editor/dashboard/keys/pushes. Claude designs, drafts whole files, hands them over. Mike applies, commits, pushes.

12. **Resume state lives in `localStorage`, NOT in the DB.** When Mike clears a `students` row to "reset", the splash will STILL show "Resume where you left off" because the engine reads `localStorage[SAVE_KEY]`. InPrivate windows do NOT clear it within the same window's lifetime. To clear: DevTools → Application → Local Storage → `localhost:3000` → delete the key. Mention this preemptively when Mike's cleanup looks like it didn't take.

13. **Always provide migration SQL files as downloadable files** so Mike can add them to his `supabase/migrations/` folder. If a migration is created during a session but only provided as inline SQL in chat (not as a downloadable file), it will be missed from the migrations folder. Every migration = a downloadable `.sql` file.

---

## What happened in session 88

### 3 new monsters → 9 total (Chunk F extension)
- **`src/game/monsters.jsx`** (UPDATED): Added Nubs (#7, teal with stubby nub horns and 3 feet), Dottie (#8, coral with polka dots and floppy ears), Munch (#9, mint green with big chompy teeth and round ears).
- `MONSTERS` array now has 9 entries (was 6). `MONSTER_COMPONENTS` array updated to match.
- `padWithMonsters()` shuffle indices updated from `[0..5]` to `[0..8]` — every filler slot now gets a unique monster design (no repeats needed since pool size = grid size = 9).

### Monsters in the awards ceremony
- **`src/app/student/results/ResultsCeremony.tsx`** (UPDATED): Added `MonsterAudience`, `MonsterPeek`, and `MonsterCelebration` components.
  - **Intro**: 5 random monsters in a row below the trophy, bobbing gently — the "audience" watching the ceremony begin.
  - **Countdown**: A random monster peeks from a bottom corner during each round countdown. Different monster per round.
  - **Podium**: Another random monster peeking from the opposite corner while winners are displayed.
  - **Finale**: All 9 monsters in a shuffled celebration row above the "Back to your dashboard" button.
  - All monster selections are randomized per page load using `useMemo`, so every visit feels different.

### Session 87 recap (from prior handoff)
- Teacher dashboard `colorScheme: "light"` fix for Edge InPrivate rendering
- Spotlight: "Save my comments" → "Save your favorite"
- Spotlight: duplicate `name="entry_photo"` input fix
- Chunk F (flexible grid + monster filler cards) — now extended in session 88

---

## Completed chunks (cumulative)

| Chunk | Session | Description |
|-------|---------|-------------|
| 1 | 81 | Teacher students page |
| 1.5 | 81 | Teacher class request flow |
| 2 | 82 | Admin dashboard overhaul |
| 3 | 81 | Multi-teacher SQL |
| Docs | 82, 85 | Development story + technical blueprint |
| C | 83 | Class size request |
| E | 83 | Admin dashboard polish |
| D1 | 84 | Server-side phase enforcement |
| D2-UI | 84–85 | Student-side phase display |
| M1 | 86 | Standard mode teacher dashboard |
| M2 | 86–87 | Mode routing + admin color scheme |
| F | 87–88 | Flexible grid + monster filler cards (9 monsters, awards integration) |


## File map (what lives where)

### Game engine (src/game/)
- `shell.jsx` — GameShell wrapper, RoundSplash countdown
- `spotlight.jsx` — Main game: StageGrid, ReviewGrid, shuffle/stop, enrollment. Monster card integration (session 87)
- `students.js` — Static sample data (fallback when no DB)
- `monsters.jsx` — **9 monster SVGs** (session 87: 6 original, session 88: +3 new) + `padWithMonsters()` helper

### Play route (src/app/play/)
- `page.tsx` — Visitor /play route. Redirect-if-enrolled, deck loading. Threshold 9→3 (session 87)
- `actions.ts` — `enrollStudent`, `saveStudentRound`, `addEntry`, `removeEntry`, `findFirstAvailableRound`

### Student routes (src/app/student/)
- `dashboard/page.tsx` — Student dashboard with phase indicator (D2-UI)
- `play/page.tsx` — Student game route with submissions-closed gate (D2-UI)
- `results/page.tsx` — Awards ceremony gate (blocks until comments approved)
- `results/ResultsCeremony.tsx` — Animated awards reveal. **Session 88: monster mascots in intro/countdown/podium/finale**

### Teacher routes (src/app/teacher/)
- `students/page.tsx` — Teacher dashboard (standard mode: direct controls)
- `students/class-header.tsx` — Class header with game/review time split (D1)
- `students/actions.ts` — Approve/reject, auto-advance trigger (D1)
- `deck/` — Teacher deck management

### Admin route (src/app/admin/)
- `page.tsx` — Mode check + redirect (M2)
- `admin-client.tsx` — Full admin dashboard, tan/white palette (M2)
- `actions.ts` — Admin actions including `updateAppMode` (M2)

### Shared libs (src/lib/)
- `deck.ts` — Warmup deck loader. DECK_MIN=3 (session 87)
- `class-deck.ts` — In-class deck loader with submissions-closed gate (D2)
- `round-timing.ts` — Round computation + phase helpers (D1)
- `student-archive.ts` — Student data with phase timing (D2-UI)
- `supabase-server.ts` — SSR Supabase client

---

## 🧠 DESIGN IDEAS — Monster Avatars & Teacher Game (session 88 brainstorm)

This section captures Mike's brainstorm from session 88. None of this is built yet — it's design thinking to carry forward.

### Monsters as avatars (not just filler)
Currently monsters are decorative padding. The idea: promote them to **characters with personalities**. Each monster gets a student-style profile — personality traits, social skills, learning style preferences. This gives the game world texture and becomes the basis for the teacher game.

Monster profiles could include:
- Personality (e.g. Gorp is curious and hands-on, Pip is observant and quiet)
- Social style (e.g. Nubs is the class clown, Dottie is encouraging and supportive)
- Learning preferences (e.g. Munch is visual, Zap needs movement)
- These profiles would accumulate over time — see "emergent personality" below

### Teacher guidance at upload time
Teachers should have a place to provide guidance or encouragement to students at the moment they upload photos and write comments. The rotating `PROMPT_PHRASES` array in spotlight.jsx already cycles fun placeholder text — this is the natural hook. The simplest version: a teacher-authored text field (per round or per class) that replaces or supplements the default prompts. Could be a column on `games` or `classes`. **Small and self-contained — buildable independently.**

### The teacher game (multi mode)
Teachers play a warmup-style game, but instead of uploading as themselves, they're assigned **monster avatars**. The twist:

- **Admin configuration**: sets the game at either 3-teacher or 9-teacher (how many teachers play per round)
- **Avatar assignment**: each teacher "rolls the dice" (the game assigns randomly) and gets 1 or 3 monster avatars
  - 3-teacher game with 1 avatar each = 3 monsters with 3 pics each
  - 3-teacher game with 3 avatars each = 9 monsters with 1 pic each
  - 9-teacher game = 9 teachers, 1 avatar each, 1 pic each
- **Teacher selects** whether they want 1 or 3 avatars (for the 3-teacher variant)
- **Upload "in character"**: the teacher sees the monster's profile and uploads as if they were that student — putting themselves in a student's shoes
- **Name still associated**: each photo is still linked to the real teacher, but presented through the avatar's personality

### Emergent personality — avatar history builds over time
The fun part: if Gorp has been played by 12 different teachers across 12 rounds, Gorp's "personality" is the aggregate of how those teachers interpreted prompts through Gorp's lens. The history of game additions — both prompts and topics — should build. It's only a few words per teacher per round. The avatars develop character built on the teachers who have inhabited them.

### Could standard mode use this too?
Mike asked: what if the standard game with 3 students ran the same way — 3 real entries, assigned avatars, smaller grid? This is a design question, not a code question. Key decisions needed:
- Do the 3 students *become* their monster avatars?
- Or are the monsters the opponents in a mixed grid?
- Is this a designed 3-player format, or just "small game padded to 9" (which already works)?
- **Status**: needs a design session before building

### What's buildable vs. what needs design

**Buildable now (no design decisions needed):**
- ✅ 3 more monsters → 9 total (DONE, session 88)
- ✅ Monsters in awards ceremony (DONE, session 88)
- Teacher guidance text field at upload time — small, self-contained
- Monster profile data structure — JSON/table design, no UI yet

**Needs a design session first:**
- Teacher game mechanics (avatar assignment, dice roll, 1-vs-3 config)
- The 3-student variant question
- How avatar personality accumulates across rounds/teachers
- DB schema for monster profiles and teacher-avatar assignments

---

## What remains to build

### Near-term (testing and polish)

**Bug sweep** — Mike is doing a full playthrough. Known open issues:
- B11: Duplicate photos in warm-up spotlight (LOW)
- U1: Update favorite confirmation text (LOW)
- Photo upload 500 — may be fixed by duplicate input fix; needs testing


**Chunk F follow-up** — If `loadClassDeck` (the in-class version in `class-deck.ts`) also has a hard-9 threshold, it needs the same DECK_MIN treatment. Mike to verify during testing.

### Medium-term features

**Teacher guidance at upload** — text field per round/class for teacher-authored prompts. Hooks into existing `PROMPT_PHRASES` rotation. Small chunk.

**Chunk D2-UI polish** — Phase indicator tested end-to-end. Auto-advance verified. Student blocking on rejections confirmed working.

**Chunk A — Teacher celebration** (small, high fun-per-effort). Teacher gets a mini awards ceremony when their class finishes. Scope TBD.

### Longer-term / design-needed

**Monster avatars + teacher game** — See the design ideas section above. This is a significant feature set that needs a focused design session before any building starts.

**Chunk OE — Open enrollment.** Public join page, class assignment, warmup as matchmaking. The front door for multi/marketplace mode. Needs a design spec session.

**Teacher recruiting** — Mike has cooled on automated recruiting. Current thinking: teachers recruit through messages to students. No automated pipeline needed.

**Chunk T — Teacherhood ladder** — Mike is reconsidering the automation. If pursued, could be simpler: admin manually promotes winners via dashboard.

---

## Testing setup (quick reference)

### Accounts
- **Student:** myked70@yahoo.com (role=student, screen_name=Casper2)
- **Teacher/Admin:** getgroovr@yahoo.com (role=teacher, is_admin=true)
- **Seed teachers:** seed-teacher-1 through 4 @test.local
- **Seed students:** seed-voter-1 through 8 @test.local

### SQL order (every test cycle)
1. `all-in-one-setup-v8.sql`
2. `seed-teachers-v1.sql` (multi mode only)
3. `populate-seed-voter-sessions.sql`
4. Pick a jump-to or fast-path (see walkthrough)

### Browser setup
- Main window → myked70 (student)
- InPrivate → getgroovr (teacher/admin) OR anonymous /play

### Mode switching
To switch between standard and multi mode:
```sql
-- Switch to multi mode (enables /admin dashboard)
UPDATE admin_settings SET app_mode = 'multi' WHERE id = 1;

-- Switch to standard mode (redirects /admin → /teacher/students)
UPDATE admin_settings SET app_mode = 'standard' WHERE id = 1;
```
Or use the App Mode selector in the admin dashboard (multi mode only).

---

## Recommended next session (89)

**Full testing pass.** Mike is doing a playthrough. Next session should focus on whatever bugs surface.

If testing goes clean, good candidates:
1. **Teacher guidance text field** — small, self-contained, directly useful
2. **Chunk A** (teacher celebration) — small and fun
3. **Monster avatar design session** — if Mike wants to start shaping the teacher game
