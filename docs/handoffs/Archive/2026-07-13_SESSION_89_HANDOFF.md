# SESSION 89 HANDOFF
**Date:** 2026-07-13
**Session range covered:** 84–89
**Supabase project:** ilctdtppstvmpvuvdqvf

---

## ⭐⭐ HOW TO WORK WITH MIKE — DO NOT REMOVE THIS SECTION

> **INCLUDE THIS SECTION VERBATIM IN ALL SUBSEQUENT HANDOFFS. DO NOT TRUNCATE, SUMMARIZE, OR OMIT IT.**

These are not preferences to honor when convenient. They are the working agreement.

1. **Whole-file replacements, delivered as DOWNLOADABLE FILES via `present_files` — NEVER pasted into chat as code blocks.** Write the file to `/mnt/user-data/outputs/<n>.<ext>` and call `present_files`. Mike downloads it and drops it into VS Code at the exact path you state. Do NOT say "replace the saveProfile function with…" — give the entire file as a download. Long files pasted into chat get corrupted by smart quotes, line-ending mangling, and copy-paste fatigue.

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

## What happened in session 89

### Admin dashboard aesthetic overhaul
- **`src/app/admin/admin-client.tsx`** (UPDATED): 
  - **Warm tan backgrounds**: All section cards changed from pure white (`bg-white`) to warm paper tone (`#f8f5ef`). Cards now blend with the amber-50/stone-100 gradient background instead of standing out as stark white blocks.
  - **Badge/oval padding fixed**: Every small badge, pill, and status indicator had its horizontal padding increased. `StatusBadge`: `px-1.5` → `px-2.5`. `Pill` component: `px-2 py-0.5` → `px-3 py-1`. Mode badges (S/T/9): `px-1` → `px-2`. Admin badge: `px-1` → `px-2`. Game status badges: `px-1` → `px-2.5`. Topic count badges: `px-1` → `px-2.5`. Pending badges: `px-1` → `px-2.5`. Approve/Deny/Reject buttons: similarly increased. Text no longer looks smashed against edges.
  - **Smaller warmup control**: Reduced inner padding from `py-3` to `py-2`, header from `py-2` to `py-1.5`. Dropdown select also slightly smaller.
  - **3-column student list**: Students inside class cards now display in a 3-column grid (`gridTemplateColumns: "repeat(3, 1fr)"`) instead of a single-column stack. Saves vertical space. Email display removed from the grid (still available in the CSV download).
  - **Warmer select inputs**: App mode and warmup mode selects use `#f3efe8` background to match the warm tone.

### Standard mode landing page at /admin
- **`src/app/admin/page.tsx`** (UPDATED): When `app_mode = 'standard'`, the page no longer redirects to `/teacher/students`. Instead it renders a `StandardModeLanding` component with:
  - An explanation of what Standard mode is (single teacher, direct class/topic/schedule management)
  - A description of what Multi mode adds (rotation queue, warmup matchmaking, centralized scheduling, topic approval, class requests, messaging)
  - A "Switch to Multi mode" button with a confirmation step
  - A link back to the teacher dashboard
- **`src/app/admin/admin-client.tsx`** (UPDATED): Added `StandardModeLanding` as a named export. Uses the existing `updateAppMode` action — no new server actions needed.

### Tri-mode design decision
- **Resolved**: Tri-mode (multiple photos per participant) is for **teacher warmup only**, not students. 
- Monster fillers already make any class size playable for students — a 3-student class pads to 9 with monsters, keeping the "one best photo" mechanic intact.
- For teachers in the warmup, tri-mode has real value: 3 teachers × 3 photos = 9 genuine curated entries for prospective students. Richer recruiting tool than 3 real + 6 monster fillers.
- This ties into the session 88 monster avatar concept: teachers get assigned monster personas, upload photos "in character."

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
| G | 89 | Admin aesthetic overhaul + standard mode landing |

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

**No new migrations in session 89** — all changes are UI-only.

---

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
- `results/ResultsCeremony.tsx` — Animated awards reveal. Monster mascots in intro/countdown/podium/finale (session 88)

### Teacher routes (src/app/teacher/)
- `students/page.tsx` — Teacher dashboard (standard mode: direct controls)
- `students/class-header.tsx` — Class header with game/review time split (D1)
- `students/actions.ts` — Approve/reject, auto-advance trigger (D1)
- `deck/` — Teacher deck management

### Admin route (src/app/admin/)
- `page.tsx` — Mode check: standard → landing page with switch button; multi → full dashboard (session 89)
- `admin-client.tsx` — Full admin dashboard + StandardModeLanding component. Warm tan palette, improved badge padding, 3-column students (session 89)
- `actions.ts` — Admin actions including `updateAppMode` (M2)

### Shared libs (src/lib/)
- `deck.ts` — Warmup deck loader. DECK_MIN=3 (session 87)
- `class-deck.ts` — In-class deck loader with submissions-closed gate (D2)
- `round-timing.ts` — Round computation + phase helpers (D1)
- `student-archive.ts` — Student data with phase timing (D2-UI)
- `supabase-server.ts` — SSR Supabase client

---

## 🧠 DESIGN IDEAS — Monster Avatars & Teacher Game

### Tri-mode decision (session 89)
**Tri-mode is for teacher warmup only.** Students always submit one photo per round — monster fillers handle small classes. Teachers in the warmup can submit multiple photos when playing in trio mode (3 teachers × 3 photos = 9-slot grid filled with real content).

### Monsters as avatars (session 88 brainstorm, unchanged)
Monsters promoted from decorative padding to characters with personalities. Each gets a student-style profile — personality traits, social skills, learning style. Teacher game assigns monster avatars; teachers upload "in character." History of all teacher interpretations builds emergent personality over time.

### Teacher guidance at upload time (unchanged)
Teacher-authored text field per round/class replaces or supplements `PROMPT_PHRASES`. Small, self-contained chunk.

### What's buildable vs. what needs design

**Buildable now (no design decisions needed):**
- ✅ 9 monsters (DONE, session 88)
- ✅ Monsters in awards ceremony (DONE, session 88)
- ✅ Admin aesthetic overhaul (DONE, session 89)
- ✅ Standard mode landing page (DONE, session 89)
- Teacher guidance text field at upload time — small, self-contained
- Monster profile data structure — JSON/table design, no UI yet

**Needs a design session first:**
- Teacher game mechanics (avatar assignment, dice roll, 1-vs-3 config)
- How avatar personality accumulates across rounds/teachers
- DB schema for monster profiles and teacher-avatar assignments

---

## Open items from session 89 review (game plan)

Mike's admin/teacher review surfaced several items beyond the aesthetics. Here's the plan, chunked with files needed:

### Chunk H — Game topics sync + teacher input approval
**Problem:** Game topics in the admin dashboard are empty even though the teacher dashboard has topics. In multi mode, only the admin should add topics or approve teacher-suggested ones. The existing approval system for topics should also apply to the new teacher-generated prompts.
**Plan:**
1. Verify the teacher dashboard is writing topics to `game_topics` with `suggested_by` set and `status = 'pending'` (multi mode) or `status = 'approved'` (standard mode). If the teacher dash is writing to a different place, that's the sync bug.
2. Rename "Game Topics" section in admin to **"Game input from teachers"** — combine topics and prompts in one box.
3. Add teacher-generated prompts to the same approval flow.
**Files needed:** `src/app/teacher/students/page.tsx`, `src/app/teacher/students/actions.ts` (to see how teacher adds topics/prompts)
**Migration:** Possibly add a `prompt_text` column to `game_topics` or a separate `game_prompts` table.

### Chunk J — Game schedule teacher coordination
**Problem:** The game schedule should be discussed with teachers before being pushed. Teachers should be able to respond with approval or suggested changes, visible as a group conversation.
**Plan:** Add a mini message thread scoped to the Game Schedule section. When admin saves a schedule, it posts a notification/message to all teachers in rotation. Teachers can reply inline. This could use the existing `messages` table with a new `context` or `thread_id` column.
**Files needed:** `src/app/admin/admin-client.tsx` (Game Schedule section), `src/app/admin/actions.ts`, `src/components/MessagePanel.tsx`
**Migration:** `ALTER TABLE messages ADD COLUMN thread_context varchar(50) DEFAULT NULL;`

### Chunk K — Message archiving for finished classes
**Problem:** Messages from completed/archived classes clutter the inbox.
**Plan:** When a class is archived, mark its associated messages as archived too. Use the existing `classes.is_archived` flag. Add `is_archived` boolean to `messages` table. The `archiveClass` action in `actions.ts` already archives classes — extend it to also archive related messages.
**Files needed:** `src/app/admin/actions.ts`, `src/components/MessagePanel.tsx`
**Migration:** `ALTER TABLE messages ADD COLUMN is_archived boolean DEFAULT false;`

### Chunk L — Seed data fix for tri-mode testing
**Problem:** Only 1 seed teacher is willing to participate in trio mode. Need at least 3 for testing.
**Plan:** Update `multi-teacher-setup.sql` (or `all-in-one-setup-v8.sql`) to seed 3+ teachers with `willing_trio = true`.
**Files needed:** `sql/multi-teacher-setup.sql` or `sql/all-in-one-setup-v8.sql`

---

## What remains to build

### Near-term (testing and polish)

**Bug sweep** — Mike is doing a full admin/teacher interaction review. Session 89 aesthetics delivered. Next: teacher dashboard review.

**Chunk F follow-up** — If `loadClassDeck` (in `class-deck.ts`) has a hard-9 threshold, it needs DECK_MIN treatment. Mike to verify.

### Medium-term features

**Chunk H** — Game topics sync + teacher input approval (see above)
**Chunk J** — Game schedule teacher coordination (see above)
**Chunk K** — Message archiving for finished classes (see above)
**Teacher guidance at upload** — text field per round/class for teacher-authored prompts

### Longer-term / design-needed

**Monster avatars + teacher game** — Tri-mode confirmed as teacher-warmup-only. Avatar assignment, personality accumulation, and full teacher game mechanics need a design session.

**Chunk OE — Open enrollment.** Public join page, class assignment, warmup as matchmaking.

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

-- Switch to standard mode (shows landing page at /admin)
UPDATE admin_settings SET app_mode = 'standard' WHERE id = 1;
```
Or use the App Mode selector in the admin dashboard (multi mode), or the "Switch to Multi" button on the standard mode landing page.

---

## Recommended next session (90)

1. **Test the aesthetic changes** — verify warm tan backgrounds, badge padding, 3-column students, standard mode landing all look right.
2. **Teacher dashboard review** — Mike mentioned checking the teacher side next. That will surface the topics sync issue (Chunk H).
3. **Chunk H** (topics sync) is the most impactful next build — it's a functional gap, not just polish.
4. **Chunk L** (seed data for tri-mode) is a quick fix to unblock tri-mode testing.
