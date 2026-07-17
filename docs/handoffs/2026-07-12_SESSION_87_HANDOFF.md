# SESSION 87 HANDOFF
**Date:** 2026-07-12
**Session range covered:** 84–87
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

## What happened in sessions 84–87

### Session 84 — Chunk D1 (server-side phase enforcement)
- Added `game_phase_hours` + `review_phase_hours` to `admin_settings` and `classes`
- `round-timing.ts` gained `computeCurrentPhase()`, `isSubmissionsClosed()`, phase deadline helpers
- Admin dashboard + teacher class-header: split "round duration" into game time / review time dropdowns
- Teacher `approveEntry`/`approveFavoriteComment` gained auto-advance trigger (when last pending item approved, phase advances)
- SQL migration: 5 ALTERs (game_phase_hours + review_phase_hours on admin_settings and classes, current_round_phase on games)

### Session 84–85 — Chunk D2-UI (student-side phase display)
- `class-deck.ts`: new `"submissions-closed"` gate when game phase is over
- `student/play/page.tsx`: "Submissions are closed" holding page
- `student/dashboard/page.tsx`: phase indicator (green "Game phase" / faded "Review phase"), CTA disabled during review
- `student-archive.ts`: extended with `roundPhase`, `gamePhaseDeadline`, `gamePhaseHours`, `reviewPhaseHours`

### Session 85 — Standard/Multi mode architecture
- Defined the Standard vs Multi mode split (deployment-level, not teacher-facing)
- Updated Development Story, Technical Blueprint, and Handoff with the architecture
- Proposed `app_mode` column on `admin_settings` (added in M1 migration)
- Build order established: M1 → M2 → F → D2-UI → A → OE → T
- Killed Chunk M3 (teacher-facing mode toggle)

### Session 86 — Chunk M1 (standard mode teacher dashboard)
- Teacher dashboard in standard mode: direct class creation, direct topic management, game schedule controls
- No admin approval flows in standard mode — teacher IS the admin
- Migration: `ALTER TABLE admin_settings ADD COLUMN app_mode varchar(10) DEFAULT 'standard';`

### Session 86–87 — Chunk M2 (mode routing + admin color scheme)
- `admin/page.tsx`: queries `app_mode`, redirects to `/teacher/students` if standard
- `admin/admin-client.tsx`: full color overhaul from dark purple to tan/white palette; new `AppModeSelector` component
- `admin/actions.ts`: new `updateAppMode()` action
- No middleware needed — redirect is server-side in page.tsx

### Session 87 — Bug fixes
- Teacher dashboard `colorScheme: "light"` fix for Edge InPrivate rendering
- Spotlight: "Save my comments" → "Save your favorite"
- Spotlight: duplicate `name="entry_photo"` input fix (potential upload 500 cause)

### Session 87 — Chunk F (flexible grid + monster filler cards) ✅ DONE
- **`src/game/monsters.jsx`** (NEW): 6 cute monster SVGs (Gorp/green, Pip/purple, Fizz/orange, Bloop/blue, Sprout/pink, Zap/yellow). `padWithMonsters()` pads any deck to 9 with shuffled monster fillers.
- **`src/game/spotlight.jsx`** (UPDATED): StageGrid and ReviewGrid render monster cards as non-interactive visual padding. Monsters have `isMonster:true` + `isPlaceholder:true` so the shuffle/stop engine skips them. SoloSelf preview grid shows monster cards instead of dashed boxes. Splash text shows real student count. EnrollForm gets real student count.
- **`src/app/play/page.tsx`** (UPDATED): DeckBeingPrepared threshold text changed from 9 to 3.
- **`src/lib/deck.ts`** (UPDATED): `DECK_MIN = 3` — deck returns `ok:true` with as few as 3 entries. Still tries to fill 9 via round-robin. Monster padding happens client-side.

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
| F | 87 | Flexible grid + monster filler cards |

---

## Migrations to run (cumulative, in order)

Run these in the Supabase SQL editor. All are safe to re-run:

1. `migration-session67.sql` — Dual-role + settings
2. `20260625140000_b59_game_sessions_unique.sql` — Session unique constraint
3. `20260702130000_teacher_archiving.sql` — Archiving support
4. `20260703000000_auth_user_lookup_rpc.sql` — Auth-lookup RPC
5. Chunk 1.5 (session 81): `ALTER TABLE class_requests ADD COLUMN class_name varchar(100); ALTER TABLE teacher_rotation ADD COLUMN willing_trio boolean NOT NULL DEFAULT false; ALTER TABLE teacher_rotation ADD COLUMN willing_nine boolean NOT NULL DEFAULT false;`
6. Chunk C (session 83): `ALTER TABLE class_requests ADD COLUMN requested_capacity integer DEFAULT 9;`
7. RLS fix (session 83): `CREATE POLICY "Admins can insert game_topics" ON game_topics FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));`
8. D1 migration (session 84): `ALTER TABLE admin_settings ADD COLUMN game_phase_hours numeric DEFAULT 0; ALTER TABLE admin_settings ADD COLUMN review_phase_hours numeric DEFAULT 0; ALTER TABLE classes ADD COLUMN game_phase_hours numeric DEFAULT 0; ALTER TABLE classes ADD COLUMN review_phase_hours numeric DEFAULT 0; ALTER TABLE games ADD COLUMN current_round_phase varchar(10) DEFAULT 'game';`
9. M1 migration (session 86): `ALTER TABLE admin_settings ADD COLUMN app_mode varchar(10) DEFAULT 'standard';`

---

## File map (what lives where)

### Game engine (src/game/)
- `shell.jsx` — GameShell wrapper, RoundSplash countdown
- `spotlight.jsx` — Main game: StageGrid, ReviewGrid, shuffle/stop, enrollment. **Session 87: monster card integration**
- `students.js` — Static sample data (fallback when no DB)
- `monsters.jsx` — **NEW session 87.** 6 monster SVGs + `padWithMonsters()` helper

### Play route (src/app/play/)
- `page.tsx` — Visitor /play route. Redirect-if-enrolled, deck loading. **Session 87: threshold 9→3**
- `actions.ts` — `enrollStudent`, `saveStudentRound`, `addEntry`, `removeEntry`, `findFirstAvailableRound`

### Student routes (src/app/student/)
- `dashboard/page.tsx` — Student dashboard with phase indicator (D2-UI)
- `play/page.tsx` — Student game route with submissions-closed gate (D2-UI)
- `results/page.tsx` — Awards ceremony gate (blocks until comments approved)

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
- `deck.ts` — Warmup deck loader. **Session 87: DECK_MIN=3**
- `class-deck.ts` — In-class deck loader with submissions-closed gate (D2)
- `round-timing.ts` — Round computation + phase helpers (D1)
- `student-archive.ts` — Student data with phase timing (D2-UI)
- `supabase-server.ts` — SSR Supabase client

---

## What remains to build

### Near-term (testing and polish)

**Bug sweep** — Mike is doing a full playthrough tomorrow. Known open issues:
- B11: Duplicate photos in warm-up spotlight (LOW)
- B54: Completed rounds should collapse on dashboard (LOW)
- U1: Update favorite confirmation text (LOW)
- Photo upload 500 — may be fixed by duplicate input fix; needs testing
- Seeding vote spread — setup SQL may need tuning to get clean 4/3/2

**Chunk F follow-up** — If `loadClassDeck` (the in-class version in `class-deck.ts`) also has a hard-9 threshold, it needs the same DECK_MIN treatment. Mike to verify during testing.

### Medium-term features

**Chunk D2-UI polish** — Phase indicator tested end-to-end. Auto-advance verified. Student blocking on rejections confirmed working.

**Chunk A — Teacher celebration** (small, high fun-per-effort). Teacher gets a mini awards ceremony when their class finishes. Scope TBD.

### Longer-term / design-needed

**Chunk OE — Open enrollment.** Public join page, class assignment, warmup as matchmaking. The front door for multi/marketplace mode. Needs a design spec session — how does a visitor get matched to a class? Does warmup performance matter?

**Teacher recruiting** — Mike has cooled on automated recruiting. Current thinking: teachers recruit through messages to students, inviting them to join multi-round games. No automated pipeline needed. Could use the existing messaging feature.

**Teacher competition/awards** — Mike has cooled on this idea. Teachers don't need their own awards ceremony. The focus stays on student experience.

**Chunk T — Teacherhood ladder** — Originally: win student game → contribute to warmup → win warmup → become teacher. Mike is reconsidering the automation. If pursued, could be simpler: admin manually promotes winners via the admin dashboard. No `teacherhood_candidates` table needed in that case.

---

## Testing setup (quick reference)

### Accounts
- **Student:** myked70@yahoo.com (role=student, screen_name=Casper2)
- **Teacher/Admin:** getgroovr@yahoo.com (role=teacher, is_admin=true)
- **Seed teachers:** seed-teacher-1 through 4 @test.local
- **Seed students:** seed-voter-1 through 8 @test.local

### SQL order (every test cycle)
1. `all-in-one-setup-v6.sql`
2. `seed-teachers-v1.sql`
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

## Recommended next session (88)

**Full testing pass.** Mike is doing a playthrough tomorrow. The next session should focus on whatever bugs surface. Upload screenshots + the files that need fixing.

If testing goes clean, good candidates for next build work:
1. **Chunk A** (teacher celebration) — small and fun
2. **D2-UI polish** — if phase enforcement needs tweaking after testing
3. **OE design session** — if Mike wants to start thinking about open enrollment
