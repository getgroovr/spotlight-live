# SESSION 91 HANDOFF
**Date:** 2026-07-14
**Session range covered:** 84–91
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

## ⭐ SESSION 91: RECRUITING GAME PIPELINE CRYSTALLIZED

### The trio mode bug

Mike tested the recruiting game in trio mode (3 teachers × 3 photos = 9 slots). Instead of 9 real teacher photos, only 3 seeds appeared with 6 monster fillers. The deck loader is not properly assembling multi-teacher photos — it's behaving like solo mode regardless of the `warmup_teacher_count` setting.

**Root cause (to investigate):** Either the seed data doesn't have 3 teachers with `willing_trio = true` AND uploaded starter photos (Chunk L issue), OR `deck.ts`'s round-robin logic isn't distributing slots correctly across multiple teachers. Need to see `deck.ts` and the seed SQL to diagnose.

### The recruiting game pipeline — Mike's vision clarified

Mike described the complete flow for how the recruiting game should work. Three stages connect previously separate concepts into one coherent experience:

**Stage 1 — Teacher Game (NEW CONCEPT, NOT YET BUILT)**
Before teachers contribute photos to the student-facing recruiting grid, they play their own rotating game. During this game:
- Teachers are assigned monster avatars (random assignment — the "dice roll" from session 88)
- Each teacher sees their assigned monster's personality profile
- Teachers upload their recruiting photos "in character" as that monster
- This is how photos get INTO the recruiting grid — through the teacher game

This directly implements the session 88 monster avatar brainstorm. The teacher game is the mechanism for avatar assignment. It's not a separate feature — it's the entry point to the recruiting pipeline.

**Stage 2 — Student Recruiting Game (EXISTS, NEEDS FIXES)**
The `/play` warmup round. Students see teacher photos in the 3×3 grid, play shuffle-stop, pick a favorite. Currently bugged in trio mode (only 3 photos + 6 monsters instead of 9 teacher photos).

**Stage 3 — Teacher Awards Ceremony (NEW CONCEPT, NOT YET BUILT)**
After the recruiting round completes, an awards ceremony recognizes which teachers' photos attracted the most student favorites. This gives teachers competitive stakes and closes the loop.

### What this means for build order

The trio bug is the immediate problem — fix the deck loader, fix the seed data. But Mike is signaling that the broader recruiting game design is ready to be built: teacher game → avatar assignment → recruiting photos → student game → teacher awards. These should be designed as a connected pipeline, not isolated features.

### Business model crystallized (Session 91 — from Mike's hike notes)

Mike identified that the standard (class-based) and online (web-based) versions are structurally almost identical. Both have student, teacher, and admin roles. Both have warmup rounds. Both can have multi-teacher rounds. The difference is who runs it.

**Two deployment models, one codebase:**
- **Online platform (Mike-operated):** Mike is the administrator of the online version — running the teacher recruiting game, managing online classes, acting as admin and/or teacher. This is the flagship instance and a direct revenue source.
- **Standalone subscriptions:** Independent teachers and schools buy access. Solo teachers get the standard game. Schools can add multi-teacher/admin features. Both solo AND multi-teacher use are paid — independent ESL teachers are a large global market.

**The storefront ties it all together:** For online, it's where students find teachers. For standalone, it's the teacher's public class listing. Potentially extends to a product marketing/signup page.

**IP protection:** SaaS model — teachers access the service, never the code. Private GitHub repo. Revenue from subscriptions, not software distribution.

**Monster avatars are teacher-only.** In the multi-teacher recruiting game, teachers play as assigned monster avatars. Students do not play as avatars. The avatar personality/learning style system is an engagement layer for making the teacher experience fun — it comes after the core tool is solid.

**Business infrastructure needed (LATER, after demo-ready product):** Payment integration (Stripe), feature gating by subscription tier, tenant isolation, onboarding flow.

---

## What happened across sessions 89–91

### Session 89 — Admin Aesthetic Overhaul
- **`admin-client.tsx`** (UPDATED): Warm tan backgrounds (`#f8f5ef`), improved badge padding across all pills/badges/buttons, smaller warmup control, 3-column student grid, warmer select inputs
- **`page.tsx`** (UPDATED): Standard mode landing page with explanation + "Switch to Multi" button (replaces redirect to `/teacher/students`)
- **Tri-mode decision:** Tri-mode is for teacher warmup only, not students. Students always submit one photo — monsters handle small classes.

### Session 90 — Three-Layer Reframe + Infrastructure
- **Chunk J (admin side COMPLETE):** Schedule coordination thread. `saveGameSchedule` auto-broadcasts to teachers in rotation. `ScheduleThread` component in admin dashboard.
- **Chunk K (COMPLETE):** Message archiving on class archive. `archiveClass` sets `is_archived = true` on related messages.
- **Chunk H (CONFIRMED):** Topics sync pipeline verified — admin fetches all topics, splits seeded vs. teacher-created, shows approve/deny for pending. Note: teacher `suggestTopic` may still hardcode `status: "approved"` — needs mode-aware fix.
- **Migration delivered:** `20260713180000_schedule_thread_and_msg_archive.sql`
- **Architectural reframe:** Multi mode conflated recruitment and oversight. Three-layer model established. Admin two-tab design agreed (Recruitment | Oversight). Teacher storefront identified as critical missing piece.

### Session 91 — Documentation + Direction
- Updated GROOVR_DEVELOPMENT_STORY.md (new Part 8: recruiting game pipeline)
- Updated GROOVR_TECHNICAL_BLUEPRINT.md (three-layer architecture, recruiting pipeline design, current bug status)
- Trio mode bug documented and prioritized
- Recruiting game pipeline clarified: teacher game → avatar assignment → student recruiting → teacher awards

---

## Completed chunks (cumulative)

| Chunk | Session | Description |
|-------|---------|-------------|
| 1 | 81 | Teacher students page |
| 1.5 | 81 | Teacher class request flow |
| 2 | 82 | Admin dashboard overhaul |
| 3 | 81 | Multi-teacher SQL |
| Docs | 82, 85, 90, 91 | Development story + technical blueprint |
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
8. D1 migration (session 84): Phase columns on `admin_settings`, `classes`, and `games`
9. M1 migration (session 86): `ALTER TABLE admin_settings ADD COLUMN app_mode varchar(10) DEFAULT 'standard';`
10. Session 90: `20260713180000_schedule_thread_and_msg_archive.sql` — `thread_context varchar(50)` and `is_archived boolean` on `messages`

**No new migrations in session 91** — all changes are documentation only.

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
- `admin-client.tsx` — Full admin dashboard + StandardModeLanding. Schedule coordination thread (session 90). Warm tan palette, improved badge padding, 3-column students (session 89)
- `actions.ts` — Admin actions including schedule broadcast and message archiving (session 90)

### Shared libs (src/lib/)
- `deck.ts` — Warmup deck loader. DECK_MIN=3 (session 87). **TRIO BUG: not properly loading multi-teacher photos**
- `class-deck.ts` — In-class deck loader with submissions-closed gate (D2). May need DECK_MIN treatment.
- `round-timing.ts` — Round computation + phase helpers (D1)
- `student-archive.ts` — Student data with phase timing (D2-UI)
- `supabase-server.ts` — SSR Supabase client
- `message-actions.ts` — Shared message send/read actions

---

## 🧠 DESIGN: The Recruiting Game Pipeline

This section captures Mike's vision as of session 91. The teacher game, avatar assignment, and teacher awards connect into a single pipeline that serves the recruiting game.

### Stage 1 — Teacher Game (NOT YET BUILT)

**What it is:** A rotating game where teachers play before contributing to the student-facing recruiting grid. The game assigns each teacher a monster avatar.

**How it works:**
1. Admin sets the recruiting round's warmup mode (solo/trio/full)
2. Teachers in the rotation queue are notified it's their turn
3. Each teacher "rolls the dice" — the game randomly assigns them a monster avatar (1 avatar per teacher in trio/full, or 3 avatars per teacher in a 3-teacher variant)
4. Teacher sees the monster's personality profile (e.g., "You are Gorp — curious, hands-on, loves experimenting")
5. Teacher uploads their recruiting photos "in character" as that monster
6. Photos are tagged with both the teacher ID and the monster ID

**Design decisions still needed:**
- Does the teacher game have its own shuffle-stop round, or is it just the assignment + upload step?
- Can a teacher reject their assigned monster and re-roll?
- What's the UI for showing the monster personality and prompting "in character" uploads?
- Where does this live? New route? Teacher dashboard section? Modal?

### Stage 2 — Student Recruiting Game (EXISTS, NEEDS BUG FIX)

**Current state:** The `/play` warmup route works for solo mode. Trio mode is bugged — loads 3 seeds + 6 monsters instead of 9 teacher photos.

**Fix needed:**
1. Debug `deck.ts` — the round-robin photo selection should respect `warmup_teacher_count` and pull the right number of photos per teacher
2. Fix seed data (Chunk L) — ensure 3+ seed teachers have `willing_trio = true` AND have uploaded 3+ starter photos each
3. After fix: trio should show 9 real teacher photos (3 per teacher, 0 monsters)

**Files to examine:** `src/lib/deck.ts`, `sql/seed-teachers-v1.sql` or `sql/multi-teacher-setup.sql`

### Stage 3 — Teacher Awards Ceremony (NOT YET BUILT)

**What it is:** After the recruiting round closes, an awards ceremony reveals which teachers' photos attracted the most student favorites.

**How it could work:**
- Tally `game_sessions.favorite_entry_id` across all warmup participants → group by teacher
- Show results as a teacher-facing awards page (similar to student `ResultsCeremony.tsx` but for teachers)
- Gold/silver/bronze for teachers, possibly showing which specific photos won
- Could include monster-themed presentation ("Gorp's photos received 12 favorites!")

**Design decisions still needed:**
- Is this a separate route or part of the teacher dashboard?
- Does it run automatically when the recruiting round ends, or does admin trigger it?
- Is there a leaderboard across multiple recruiting rounds?

---

## 🔥 BUILD PLAN — Prioritized for next sessions

### Priority 1: Fix Trio Mode Bug
**Why first:** Can't test or build anything else in the recruiting pipeline until the deck loads correctly.
**Steps:**
1. Mike uploads `src/lib/deck.ts` — Claude examines the round-robin logic
2. Mike uploads seed SQL — Claude checks if 3 teachers have trio photos
3. Fix whichever is broken (likely both: seed data + deck logic)
**Estimated effort:** Small-medium. Diagnostic first, then targeted fix.

### Priority 2: Seed Data for Trio Testing (Chunk L)
**Why:** Even if the deck logic is correct, the seed data may not have 3 teachers with `willing_trio = true` and 3+ starter photos each.
**Steps:** Update seed SQL to create 3 trio-willing teachers with 3 starter photos each.
**Estimated effort:** Small.

### Priority 3: Teacher Game Design Session
**Why:** Mike said he's ready to build the teacher game. The concept is clear (rotating game → monster assignment → upload in character). Before coding, nail down the UX: what does the teacher see, what route does it live on, how does avatar assignment happen in the UI.
**Estimated effort:** Design discussion (no code), then medium build.

### Priority 4: Teacher Awards Ceremony
**Why:** Completes the recruiting pipeline's feedback loop. Teachers see results.
**Estimated effort:** Medium — mostly UI, reuses ResultsCeremony patterns.

### Priority 5: Admin Two-Tab Layout (Chunk R1)
**Why:** Foundation for the three-layer model. Move existing sections under Recruitment and Oversight tabs.
**Estimated effort:** Small — one file, mostly JSX reorganization.

### Later: Storefront + Redirect (Chunks R2, R3, R4)
Depends on the recruiting pipeline being complete. A student who finishes the recruiting game needs somewhere to go (the storefront), and that redirect needs to be wired. But fix the game first.

---

## Parked items (still valid, lower priority)

- **Schedule thread — teacher side:** `schedule-thread.tsx` component + `replyToScheduleThread` action. Pick up after R1 tab restructure.
- **Teacherhood ladder:** Student winner → teacher candidate. Growth loop. Needs recruiting pipeline first.
- **Teacher guidance at upload time:** Small, self-contained. Can be done anytime.
- **Open enrollment (Chunk OE):** Public join page, class assignment. Needs storefront first.
- **Chunk H fix:** Teacher `suggestTopic` may still hardcode `status: "approved"` — needs mode-aware check.

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

## Recommended next session (92)

1. **Start by fixing the trio bug.** Mike uploads `deck.ts` and the seed SQL. Claude diagnoses whether it's a deck logic issue, seed data issue, or both. Fix and test.
2. **Then seed data (Chunk L)** — ensure 3 teachers with `willing_trio = true` and 3 starter photos each. Quick fix.
3. **Design session: Teacher Game.** With trio mode working, walk through what the teacher game UI looks like. Where does the monster assignment happen? What does the teacher see? Sketch the route and components before coding.
4. If time allows, **start building the teacher game** — the assignment mechanic and the "upload in character" UI.
