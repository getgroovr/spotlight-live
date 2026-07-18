# SESSION 93 HANDOFF
**Date:** 2026-07-18
**Session range covered:** 84–93
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

## ⭐⭐ SESSION 93: LEVEL-AWARE DECKS + MULTI-MODE CLEANUP

### What happened

Session 93 had two phases: cleaning out the dead multi-teacher code, then adding the level-based deck system.

**Phase 1 — Multi-teacher code removal.** The deck loader (`deck.ts`) was still fully wired to the rotation queue, meaning `/play` was broken in standard mode. We gutted it and rewrote it as a clean solo loader. We then removed multi-teacher references from the teacher dashboard: the `SwitchToMultiFooter`, the mode preference checkboxes (`willingTrio`/`willingNine`), the `isMultiTeacher`/`isStandardMode` flags, the admin link, the read-only branch in `ClassHeader`, and the dual-mode branching in `RequestClassSection`. Three files cleaned: `page.tsx`, `class-header.tsx`, `request-class.tsx` in `src/app/teacher/students/`.

**Phase 2 — Level-aware deck system.** Through a design conversation, we arrived at this model:

- **Every class has a level** (beginner, intermediate, advanced).
- **Every class has a warmup** (teacher's photos = round 0). The warmup sets the topic/tone for the class — architecture, dog breeds, modern art, whatever.
- **Recruiting is just a flag** that makes the warmup playable by anonymous visitors online. Same photos whether the class is recruited or established.
- **One warmup deck per level per teacher.** The photos are shared across all classes at that level. When a class fills, the teacher creates another at the same level. The warmup keeps running, feeding the next class.
- **Teachers control recruiting per level** via boolean flags on their profile.

The deck page was completely restyled from dark purple/fuchsia to the warm cream/beige palette used by the teacher students page and student dashboard.

### Decisions made

**1. The warmup is round 0 for every class, not just for recruiting.**
A teacher uploading deck photos isn't just making a recruiting ad — they're setting the scene for the class. Established classroom classes get a warmup round too. The teacher's photos introduce the topic before students start uploading their own in round 1.

**2. Photos are per-level, not per-class.**
Starter entries now have a `level` column. A teacher's beginner warmup deck serves all their beginner classes. This avoids duplicating photos across classes at the same level.

**3. Recruiting is per-level, not per-class.**
`profiles` has `recruiting_beginner`, `recruiting_intermediate`, `recruiting_advanced` booleans. The browse page (future) will query these to show "teachers recruiting at this level."

**4. Uploads go live immediately.**
No admin approval step. `is_active` defaults to `true` on upload. The teacher toggles individual photos in/out of the warmup themselves.

**5. Multiple classes at the same level is fine.**
A teacher can have five beginner classes. They all share the same beginner warmup deck. Students flow in through one funnel.

### New idea: student continuation between games

Mike's idea: at the end of a game (after the awards ceremony), students are offered the option to enroll in the next game by the same teacher — either at the same level or moving up a level if available. The new class would partially fill with continuing students, then turn to recruiting to fill remaining spots (assuming not everyone continues). This creates a natural retention loop: play → awards → "want to keep going?" → next class → play again. It also means students who want to stay with their cohort can do so without re-browsing.

This is NOT built yet — it's a session 94+ design task. Implementation would involve:
- A "Continue" CTA on the awards ceremony results page
- Logic to find or create the next class at the same/higher level
- Partial enrollment of continuing students
- The class then opens for recruiting to fill remaining seats

---

## The App as It Stands Now

### What works today

- **Auth:** Magic link login, role-based routing (student/teacher)
- **Student flow:** Join via `/play/[teacherId]` warmup → enrolled → play rounds → vote/comment/upload → awards ceremony
- **Teacher flow:** Upload deck photos by level → moderate student submissions → manage rounds
- **Game engine:** 3×3 grid, shuffle-stop reveal, combined screen (vote + upload), round timing
- **Awards ceremony:** Competition ranking, confetti, gold/silver/bronze, monster mascots
- **Monster cards:** 9 SVG monsters, `padWithMonsters()` fills short decks
- **Teacher dashboard (standard mode):** Direct class creation, inline topic management, game schedule controls, messaging
- **Deck page:** Level tabs (Beginning/Intermediate/Advanced), per-level photo management, recruiting toggle, warm color scheme
- **Play route:** `/play/[teacherId]?level=beginner` loads level-specific warmup
- **Messaging:** Teacher ↔ student messages

### What's built but now dormant (multi-teacher)

- Admin dashboard (`admin-client.tsx`) — teacher rotation queue, warmup mode selector, class request approval
- Teacher rotation table and related queries
- Trio/full deck logic (removed from `deck.ts`, columns still in DB)
- Schedule coordination thread
- Class request flow (`requestNewClass` in `request-actions.ts`)
- Topic approval pipeline (teacher suggests → admin approves)
- `app_mode` toggle on `admin_settings`
- Mode selection columns on entries (`selected_solo`, `selected_trio`, `selected_full`) — still in DB, no longer read

### What needs to be built

**Priority 1: Complete the level system (make it functional end-to-end)**
- "Create class" on the students page needs a level picker dropdown
- `enrollStudent` in `play/actions.ts` needs to find a class at the right level with room (instead of using the entry's hardcoded `class_id`)
- Class tab redesign: collapsible class cards instead of one-at-a-time dropdown (teacher with multiple classes needs a compact overview)
- Test the full loop with levels: teacher uploads beginner photos → sets recruiting → student plays `/play/[teacherId]?level=beginner` → enrolls → lands in a beginner class

**Priority 2: Teacher profiles + browse page (Front Door MVP)**
- `profiles` table additions: bio, teaching_style, levels_taught, profile_photo, public flag
- Teacher profile page (`/teacher/[id]` or similar public route)
- Browse/search page for students at `/play` (filter by level, shows recruiting teachers)
- Solo warmup linked from teacher profile ("Try a sample lesson")
- Teacher onboarding flow ("Want to teach?" → signup → profile setup)

**Priority 3: Student continuation between games**
- "Continue with this teacher" CTA on the awards/results page
- Logic to find or create the next class at the same or higher level
- Partial enrollment + recruiting toggle for remaining spots
- Consider whether students can choose to move up a level

**Priority 4: Mobile responsiveness pass**
- Teacher dashboard, deck page, student dashboard, game engine
- Test on phone-width browser

**Priority 5: School oversight (when a school customer appears)**
- Coordinator dashboard: see all teachers/classes/game status
- Shared topic/prompt list management
- Direct student assignment (no recruitment needed)

---

## Completed chunks (cumulative)

| Chunk | Session | Description |
|-------|---------|-------------|
| 1 | 81 | Teacher students page |
| 1.5 | 81 | Teacher class request flow |
| 2 | 82 | Admin dashboard overhaul |
| 3 | 81 | Multi-teacher SQL |
| Docs | 82, 85, 90, 91, 92 | Development story + technical blueprint |
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
| S93-cleanup | 93 | Multi-teacher code removal from teacher dashboard |
| S93-levels | 93 | Level-aware deck system, warm theme, `/play/[teacherId]` route |

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
11. **Session 93: `migration_session93_levels.sql`** — `level` on `classes` and `entries`, `is_recruiting` on `classes`, `recruiting_beginner/intermediate/advanced` on `profiles`, backfills existing data to `'beginner'`

---

## File map (what lives where)

### Game engine (src/game/)
- `shell.jsx` — GameShell wrapper, RoundSplash countdown
- `spotlight.jsx` — Main game: StageGrid, ReviewGrid, shuffle/stop, enrollment. Monster card integration
- `students.js` — Static sample data (fallback when no DB)
- `monsters.jsx` — 9 monster SVGs + `padWithMonsters()` helper

### Play route (src/app/play/)
- `page.tsx` — **SESSION 93:** Simplified placeholder ("find a teacher"). Future browse page lives here.
- `[teacherId]/page.tsx` — **SESSION 93 (NEW):** Per-teacher warmup. Accepts `?level=beginner|intermediate|advanced`. Loads deck, renders game or fallback.
- `actions.ts` — `enrollStudent`, `saveStudentRound`, `addEntry`, `removeEntry`, `findFirstAvailableRound`. **⚠️ Needs update:** `enrollStudent` still resolves class from favorite entry's `class_id` — should find a class at the right level with room instead.

### Student routes (src/app/student/)
- `dashboard/page.tsx` — Student dashboard with phase indicator
- `play/page.tsx` — Student game route with submissions-closed gate
- `results/page.tsx` — Awards ceremony gate (blocks until comments approved)
- `results/ResultsCeremony.tsx` — Animated awards reveal with monster mascots. **Future:** Add "Continue with this teacher" CTA here.

### Teacher routes (src/app/teacher/)
- `students/page.tsx` — **SESSION 93:** Cleaned of multi-teacher code. No more `isMultiTeacher`, `willingTrio`/`willingNine`, `isStandardMode`, `isAdmin`, admin link, `SwitchToMultiFooter`. **⚠️ Needs work:** Class cards should collapse students (compact view for multi-class teachers). "Create class" needs a level picker.
- `students/class-header.tsx` — **SESSION 93:** Cleaned. Read-only branch removed, `isStandardMode`/`readOnly` props removed. Teacher always has full edit access.
- `students/request-class.tsx` — **SESSION 93:** Cleaned. Always `createClassDirect`, no mode prefs, no admin approval flow. **⚠️ Needs:** Level picker dropdown.
- `students/actions.ts` — Approve/reject, auto-advance trigger, `createClassDirect`. **⚠️ `createClassDirect` needs to accept and save a `level` parameter.**
- `deck/page.tsx` — **SESSION 93:** Level tabs (Beginning/Intermediate/Advanced), warm color scheme. Queries starters by level, recruiting flags from profiles.
- `deck/deck-client.tsx` — **SESSION 93:** Level-aware photo management. Per-level recruiting toggle, upload with level, "In warmup" toggle per photo.
- `deck/actions.ts` — **SESSION 93:** `uploadStarter` (with level), `toggleInWarmup`, `toggleRecruiting`, `deleteStarter`, `updateStarterDescription`, `saveDisplayName`.

### Admin route (src/app/admin/) — DORMANT in standard mode
- `page.tsx` — Mode check: standard → landing page; multi → full dashboard
- `admin-client.tsx` — Full admin dashboard (dormant)
- `actions.ts` — Admin actions (dormant)

### Shared libs (src/lib/)
- `deck.ts` — **SESSION 93:** Clean solo loader. `loadTeacherDeck(teacherId, level?)`. No rotation queue, no mode columns, no round-robin. Optional `level` filter.
- `class-deck.ts` — In-class deck loader with submissions-closed gate
- `round-timing.ts` — Round computation + phase helpers
- `student-archive.ts` — Student data with phase timing
- `supabase-server.ts` — SSR Supabase client
- `message-actions.ts` — Shared message send/read actions

---

## Testing setup (quick reference)

### Accounts
- **Student:** myked70@yahoo.com (role=student, screen_name=Casper2)
- **Teacher/Admin:** getgroovr@yahoo.com (role=teacher, is_admin=true)
- **Seed teachers:** seed-teacher-1 through 4 @test.local
- **Seed students:** seed-voter-1 through 8 @test.local

### Getting getgroovr's teacher ID (for play route)

```sql
SELECT get_auth_user_id_by_email('getgroovr@yahoo.com');
```

Use the returned UUID to test: `/play/<uuid>?level=beginner`

### SQL order (every test cycle)
1. `all-in-one-setup-v8.sql`
2. `migration_session93_levels.sql` (if not already run)
3. `populate-seed-voter-sessions.sql` (if testing beyond warmup)
4. Pick a jump-to or fast-path

### Browser setup
- Main window → myked70 (student)
- InPrivate → getgroovr (teacher/admin) OR anonymous `/play/[teacherId]`

---

## Recommended next session (94)

1. **Run the migration.** Execute `migration_session93_levels.sql` in the Supabase SQL editor if not already done.

2. **Add level picker to class creation.** Update `RequestClassSection` and `createClassDirect` to include a level dropdown (beginner/intermediate/advanced). Small change — the column exists, just needs UI and action wiring.

3. **Fix enrollment routing.** Update `enrollStudent` in `src/app/play/actions.ts` to find a class at the right level with room, instead of using the favorite entry's `class_id`. This makes the level system functional end-to-end.

4. **Redesign the Class tab.** Collapse each class into a compact card: class name, level badge, student count, status (recruiting / round N / complete). Tap to expand and see the student list. A teacher with multiple classes needs to see them all at a glance without scrolling past 9 student cards.

5. **Test the full level loop.** Teacher uploads beginner photos → toggles recruiting → anonymous visitor plays `/play/[teacherId]?level=beginner` → enrolls → lands in a beginner class → teacher starts round 1.

6. **Begin the browse page.** The `/play` route is a placeholder right now. Start building it into a simple browse page: query `profiles` for teachers with `recruiting_beginner` (or intermediate/advanced) = true, show teacher name + level + "Play warmup" button.

7. **Design the student continuation flow.** After the awards ceremony, offer a "Continue with this teacher" button. Logic: find or create the next class at the same (or next) level, enroll the student, mark the class as recruiting to fill remaining spots. Sketch the UI on the results page and the enrollment logic.

---

## Parked items

- **Multi-teacher warmup code** — dormant behind `app_mode = 'multi'`. Code stays, no development.
- **Teacher avatar/monster personality system** — fun idea, no current home. Could return as a teacher profile flair feature.
- **Teacher awards ceremony** — shelved with multi-teacher competition.
- **Teacherhood ladder** (student winner → teacher candidate) — interesting growth concept, far future.
- **Chunk H fix** (teacher `suggestTopic` hardcodes `status: "approved"`) — irrelevant in standard mode where topics are managed directly.
- **Open enrollment (Chunk OE)** — superseded by Front Door concept.
- **Mode selection columns** (`selected_solo`, `selected_trio`, `selected_full` on entries) — still in DB, no longer read by any code. Can be dropped in a future cleanup migration.
- **`teacher_rotation` table** — still in DB, no longer queried. Can be dropped when convenient.
- **`class_requests` table** — still in DB, no longer used in standard mode. Can be dropped when convenient.
- **`switch-mode-footer.tsx`** — still in repo, no longer imported. Can be deleted.
- **`request-actions.ts`** — contains `requestNewClass` and `saveModePreferences`, no longer imported. Can be deleted.
