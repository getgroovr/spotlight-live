# SESSION 90 HANDOFF
**Date:** 2026-07-13
**Session range covered:** 84–90
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

14. **Workflow: request files in chunks Claude can complete independently.**

---

## ⭐ SESSION 90: ARCHITECTURAL REFRAME

### The insight

"Multi mode" was trying to be two different things at once: a recruitment engine (how online students discover teachers) and a management layer (how admin oversees teachers running games). These are distinct jobs. Combining them into one mode produced approval workflows that didn't make sense (why does a professional teacher need admin approval to create a class?), topics that felt out of place (the recruiting game doesn't need per-round themes), and a teacher dashboard that looks the same in both modes even though the underlying logic diverged.

### The three-layer model

The app now has three clean layers:

**Layer 1 — The Standard Game.** One teacher, one class, students play rounds. This is the core product. Every teacher runs this, regardless of how they got their students. The teacher dashboard, student game, and play loop are all Layer 1. **This is fully built and working.**

**Layer 2 — The Recruitment Game.** The front door for finding students online. Students play a warmup round using teacher photos, pick a favorite, and are directed to that teacher's class list to enroll. This is a separate experience from the standard game — not a "mode" of it. A teacher can recruit solo (their own 9 photos) or through admin-orchestrated multi-teacher rounds (trio/full). After recruitment, the student enrolls in a standard game. **Partially built — warmup deck infrastructure exists, but the "teacher storefront" landing page and post-recruitment enrollment flow are missing.**

**Layer 3 — Admin Oversight.** The admin has two distinct jobs, now organized as two tabs:
- **Recruitment tab:** Manage the teacher pool for recruitment rounds (rotation queue, warmup mode, scheduling). This is the marketplace operator role.
- **Oversight tab:** Monitor active standard games across all teachers (class stats, messaging, topics, teacher coordination). This is the department-head role.

**Both admin jobs exist in both the online (marketplace) and organizational (school) contexts.** A school admin monitors their teachers' games AND could run recruitment events. An online platform operator manages the recruitment pipeline AND monitors their teachers' active games.

### What changes vs. what stays

**Stays exactly the same:**
- The student game experience (play, dashboard, results, awards)
- The game engine (shell.js, spotlight.jsx, monsters.jsx)
- The teacher dashboard for managing classes/students
- The teacher deck management
- All server actions for gameplay
- The messaging system
- The topic library

**Reorganized (existing code, new home):**
- Admin dashboard → gets two-tab layout (Recruitment | Oversight)
- Teacher rotation queue → moves to Recruitment tab
- Warmup mode selector → moves to Recruitment tab
- Game schedule → moves to Oversight tab
- Class overview → moves to Oversight tab
- Messages → stays in both tabs or gets its own persistent spot

**New code needed:**
- Teacher storefront page (public class list with enrollment)
- Post-recruitment redirect (warmup completion → teacher storefront)
- Admin tab navigation component
- Class metadata for storefront display (time slots, descriptions)

---

## What happened in session 90

### Chunk J — Schedule coordination thread (ADMIN SIDE COMPLETE)
- **`src/app/admin/actions.ts`** (UPDATED): `saveGameSchedule` now auto-broadcasts a notification to all teachers in rotation when schedule is saved. New `postScheduleMessage` action lets admin compose thread replies.
- **`src/app/admin/page.tsx`** (UPDATED): Schedule thread query added — fetches messages with `thread_context = 'schedule'`, deduplicates admin broadcasts, resolves names.
- **`src/app/admin/admin-client.tsx`** (UPDATED): `ScheduleThread` component added inside `GameScheduleSection`. Shows chronological thread with admin/teacher messages, compose area for broadcasting to all teachers.
- **Migration delivered:** `20260713180000_schedule_thread_and_msg_archive.sql` — adds `thread_context varchar(50)` and `is_archived boolean` to `messages`.

### Chunk K — Message archiving (COMPLETE)
- **`src/app/admin/actions.ts`** (UPDATED): `archiveClass` now also sets `is_archived = true` on messages with that `class_id`. `unarchiveClass` reverses it.
- **`src/app/admin/page.tsx`** (UPDATED): Main messages query excludes archived messages and schedule-thread messages.

### Chunk H — Topics sync verification (CONFIRMED)
- Admin `page.tsx` query (line 280) fetches ALL topics — no status filter. Admin client correctly splits seeded vs. teacher-created and shows Approve/Deny for pending ones. The pipeline works once the teacher's `suggestTopic` action sends as `pending` in multi mode.
- **Note:** Teacher `actions.ts` still has `status: "approved"` hardcoded in `suggestTopic`. The mode-aware version from session 89 may not have been applied yet. Check and apply if needed.

### Teacher-side schedule thread (IN PROGRESS)
- `schedule-thread.tsx` client component was drafted but not completed/delivered.
- `replyToScheduleThread` action was drafted for teacher `actions.ts` but not delivered.
- **Status:** Parked. This is an Oversight-tab feature. Will be picked up after the tab restructure.

### Architectural reframe (THIS SESSION)
Mike identified the fundamental problem: multi-mode conflates recruitment and oversight. The three-layer model was established. The admin two-tab design was agreed on. The teacher storefront was identified as the critical missing piece.

---

## Completed chunks (cumulative)

| Chunk | Session | Description |
|-------|---------|-------------|
| 1 | 81 | Teacher students page |
| 1.5 | 81 | Teacher class request flow |
| 2 | 82 | Admin dashboard overhaul |
| 3 | 81 | Multi-teacher SQL |
| Docs | 82, 85, 90 | Development story + technical blueprint |
| C | 83 | Class size request |
| E | 83 | Admin dashboard polish |
| D1 | 84 | Server-side phase enforcement |
| D2-UI | 84–85 | Student-side phase display |
| M1 | 86 | Standard mode teacher dashboard |
| M2 | 86–87 | Mode routing + admin color scheme |
| F | 87–88 | Flexible grid + monster filler cards |
| G | 89 | Admin aesthetic overhaul + standard mode landing |
| H | 89–90 | Topics sync (teacher writes pending, admin approves) |
| J-admin | 90 | Schedule coordination thread (admin side) |
| K | 90 | Message archiving on class archive |

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
10. **NEW — Session 90:** `20260713180000_schedule_thread_and_msg_archive.sql` — Adds `thread_context varchar(50)` and `is_archived boolean DEFAULT false` to `messages`.

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
- `page.tsx` — Mode check: standard → landing page; multi → full dashboard. Schedule thread query (session 90)
- `admin-client.tsx` — Full admin dashboard + StandardModeLanding. Schedule coordination thread (session 90)
- `actions.ts` — Admin actions including schedule broadcast and message archiving (session 90)

### Shared libs (src/lib/)
- `deck.ts` — Warmup deck loader. DECK_MIN=3 (session 87)
- `class-deck.ts` — In-class deck loader with submissions-closed gate (D2)
- `round-timing.ts` — Round computation + phase helpers (D1)
- `student-archive.ts` — Student data with phase timing (D2-UI)
- `supabase-server.ts` — SSR Supabase client
- `message-actions.ts` — Shared message send/read actions

---

## 🔥 BUILD PLAN — Prioritized chunks for next sessions

### Chunk R1: Admin Two-Tab Layout
**What:** Restructure admin-client.tsx into two tabs — Recruitment and Oversight.
**Why:** This is the foundation for the three-layer model. Everything else stacks on top.
**Scope:** UI reorganization only. No new server actions, no new queries. Existing sections get moved under tab headers.

Tab structure:
- **Recruitment tab:** Warmup control, teacher rotation queue, teacher mode preferences (willing trio/nine), warmup scheduling
- **Oversight tab:** Overview stats, game schedule + coordination thread, game topics, teachers list, current classes, messages, app mode selector

**Files needed:** `src/app/admin/admin-client.tsx` (just delivered in session 90)
**Migration:** None
**Estimated effort:** Small — one file, mostly moving existing JSX blocks under a tab component.

### Chunk R2: Teacher Storefront Page
**What:** A public-facing page where students can see a teacher's available classes and enroll. This is the missing connective tissue between "student discovers teacher" (recruitment) and "student is in a game" (standard game).
**Why:** Right now there's no way for a student to browse and pick a class after the recruitment game. The warmup auto-assigns based on favorite photo, but students need to choose a class that fits their schedule.
**Design:**
- Route: `/teacher/[teacherId]` or `/enroll/[teacherId]` (public, no auth required to view)
- Shows: teacher name, available (non-archived, not-full) classes with time info
- Each class card: name, capacity (X/Y enrolled), schedule (game_starts_at, duration), topic if assigned
- "Enroll" button per class → requires auth (magic link or login redirect) → creates enrollment
- After enrollment → redirect to `/student/dashboard`

**Files needed:**
- NEW: `src/app/enroll/[teacherId]/page.tsx` (server component — public)
- NEW: `src/app/enroll/[teacherId]/enroll-client.tsx` (client component — enroll button)
- NEW: `src/app/enroll/actions.ts` (server action — `enrollInClass`)
**Migration:** Optional — add `description text` and `time_slot text` columns to `classes` for richer storefront display.
**Estimated effort:** Medium — new route, new actions, but straightforward queries.

### Chunk R3: Post-Recruitment Redirect
**What:** After a student completes the warmup game and picks a teacher's photo as their favorite, redirect them to that teacher's storefront (Chunk R2) instead of auto-enrolling them.
**Why:** The current flow auto-assigns the student to the teacher's class. But if a teacher has multiple classes with different schedules, the student should choose. The warmup game is for discovering the *teacher*, not the *class*.
**Design:**
- In the enrollment action (`src/app/play/actions.ts`), after the student picks a favorite: look up which teacher owns that photo → redirect to `/enroll/[teacherId]`
- If the teacher has exactly one non-full class, auto-enroll (preserve current behavior for solo teachers)
- If teacher has multiple classes, show the storefront

**Files needed:** `src/app/play/actions.ts`, `src/game/spotlight.jsx` or `src/game/shell.js` (to handle redirect destination)
**Migration:** None
**Estimated effort:** Small — conditional logic in existing enrollment flow.

### Chunk R4: Solo Teacher Recruitment
**What:** A teacher should be able to run a recruitment round with their own 9 photos without needing the admin rotation queue.
**Why:** Not every teacher using the app online is part of a multi-teacher marketplace. A solo teacher should be able to share a `/play` link that shows their photos and directs completing students to their storefront.
**Design:**
- Teacher dashboard gets a "Recruitment link" display/copy button
- The link could be `/play?teacher=[id]` — deck loader scopes to that teacher's starters
- Or a teacher-specific play page: `/play/[teacherId]`
- After warmup completion → redirect to `/enroll/[teacherId]`

**Files needed:** `src/app/play/page.tsx`, `src/lib/deck.ts` (to scope deck to a specific teacher)
**Migration:** None
**Estimated effort:** Small-medium — deck scoping + link generation.

### Build order recommendation

```
R1 (admin tabs) → R2 (storefront) → R3 (redirect) → R4 (solo recruitment)
```

R1 is purely cosmetic reorganization — quick win, sets the visual foundation. R2 is the critical new feature. R3 wires R2 into the existing game flow. R4 completes the solo-teacher recruitment story. Each chunk is independently testable and shippable.

---

## Parked items (still valid, lower priority)

- **Schedule thread — teacher side:** `schedule-thread.tsx` component + `replyToScheduleThread` action. Pick up after R1 tab restructure.
- **Monster avatars + teacher game:** Tri-mode confirmed as teacher-warmup-only. Full design session needed.
- **Teacherhood ladder:** Student winner → teacher candidate. Growth loop. Needs R2 + R4 first.
- **Teacher guidance at upload time:** Small, self-contained. Can be done anytime.
- **Chunk L — Seed data for tri-mode:** Quick fix, low priority until recruitment tab is live.

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
```sql
-- Switch to multi mode (enables /admin dashboard)
UPDATE admin_settings SET app_mode = 'multi' WHERE id = 1;

-- Switch to standard mode (shows landing page at /admin)
UPDATE admin_settings SET app_mode = 'standard' WHERE id = 1;
```

---

## Recommended next session (91)

1. **Start with Chunk R1** — the admin two-tab layout. This is the smallest piece and sets the visual foundation for everything else. Mike uploads the session-90 version of `admin-client.tsx` (already delivered), Claude restructures into tabs.
2. **Then Chunk R2** — the teacher storefront. This is the big new feature. Design the route, build the page, wire the enrollment action.
3. If time remains, **Chunk R3** — wire the post-recruitment redirect so the warmup game flows into the storefront.
