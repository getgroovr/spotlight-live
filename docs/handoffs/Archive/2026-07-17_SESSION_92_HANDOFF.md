# SESSION 92 HANDOFF
**Date:** 2026-07-17
**Session range covered:** 84–92
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

## ⭐⭐ SESSION 92: STRATEGIC PIVOT — THE SIMPLIFICATION

### What happened

Mike woke up questioning the entire admin/recruitment direction. Through a working conversation, we identified the root issue: the multi-teacher warmup grid was generating most of the project's complexity (rotation queues, trio/full deck modes, teacher avatar assignment game, teacher awards ceremony, schedule coordination), and it wasn't solving a problem any real user actually has right now.

### Decisions made

**1. Multi-teacher warmup is SHELVED.**
No more building on the shared grid concept (3 or 9 teachers sharing a single 3×3 warmup). The code stays in the repo (it's already gated behind `app_mode = 'multi'`), but no future sessions should build on it. The rotation queue, trio mode, full mode, teacher game, and teacher awards ceremony are all dormant.

**2. Each teacher recruits solo.**
A teacher who wants to find students online puts up their own warmup — their own photos, monsters fill any gaps. A student plays *that teacher's* warmup and decides whether to enroll. No shared grid, no competition between teachers for grid slots.

**3. The three-layer model is redefined:**

**Layer 1 — The Game (BUILT, needs polish).** One teacher, their students, photo rounds, voting, commenting, teacher moderation, awards ceremony. This is the core product. It works today. Every user runs this regardless of how they got their students.

**Layer 2 — The Front Door (NOT YET BUILT).** How online students discover teachers and how teachers sign up to offer classes. Components:
- Teacher profiles (bio, photo, levels taught, teaching style)
- Browse/search page for students (filter by level, language, schedule)
- Solo warmup game per teacher (teacher's photos + monsters, student plays and decides to enroll)
- Teacher onboarding ("Want to teach your own class?" → signup → profile → first class)
- Teacher storefront (a teacher's public page showing their available classes)

**Layer 3 — School Oversight (NOT YET BUILT).** For language schools with multiple teachers. A school coordinator gets a simple dashboard: see all teachers, their classes, game status, active students. Shared topic/prompt lists the school controls (admin supplies dropdown options, teachers choose from them). No recruitment management — schools assign students directly.

**4. "Online" vs "standalone" is NOT the right split.**
There is one app. Some users need the Front Door (students finding teachers, teachers finding students). Some don't (schools with existing rosters, teachers with existing students). The Front Door is a feature, not a separate product.

**5. Teacher recruitment online = simple onboarding.**
A "Want to teach your own class?" link leads to a signup flow. No game, no competition, no avatar assignment. Just: create account → build profile → set up first class → you're live on the browse page.

**6. Monster filler cards apply everywhere.**
Solo warmup, standard game — any time a deck has fewer than 9 photos, monsters fill the gaps. A teacher only needs 3 photos to run a warmup. This is already built via `padWithMonsters()`.

### What this eliminates from the build plan

- ~~Trio mode bug fix~~ — trio mode no longer exists
- ~~Teacher game (avatar assignment)~~ — no shared grid means no need for coordinated avatar personas
- ~~Teacher awards ceremony~~ — no teacher-vs-teacher competition
- ~~Rotation queue management~~ — no rotation
- ~~Schedule coordination thread~~ — no coordinated warmup scheduling
- ~~Warmup mode selection (1/3/9)~~ — always solo
- ~~Class request approval flow~~ — teachers create classes directly
- ~~Multi-teacher deck assembly in deck.ts~~ — solo deck only

### What this KEEPS

- The standard game loop (rounds, voting, commenting, moderation, awards)
- Monster filler cards (`padWithMonsters()`, all 9 monster SVGs)
- The solo warmup deck (teacher's photos + monsters)
- Teacher profiles (to be built — needed for the Front Door)
- School oversight concept (to be built — different from the old admin dashboard)
- Admin-supplied topic/prompt lists (admin controls what teachers can choose from)
- The messaging system
- Standard/multi mode toggle in the DB (dormant — always standard for now)

---

## The App as It Stands Now

### What works today

- **Auth:** Magic link login, role-based routing (student/teacher)
- **Student flow:** Join via `/play` warmup → enrolled → play rounds → vote/comment/upload → awards ceremony
- **Teacher flow:** Upload deck photos → moderate student submissions (approve/reject) → manage rounds
- **Game engine:** 3×3 grid, shuffle-stop reveal, combined screen (vote this round + upload for next), round timing
- **Awards ceremony:** Competition ranking, confetti, gold/silver/bronze, monster mascots in intro/countdown/podium/finale
- **Monster cards:** 9 SVG monsters, `padWithMonsters()` fills short decks, non-interactive visual padding
- **Teacher dashboard (standard mode):** Direct class creation, inline topic management, game schedule controls
- **Messaging:** Teacher ↔ student messages

### What's built but now dormant (multi-teacher)

- Admin dashboard (`admin-client.tsx`) — teacher rotation queue, warmup mode selector, class request approval
- Teacher rotation table and related queries
- Trio/full deck logic in `deck.ts`
- Schedule coordination thread
- Class request flow
- Topic approval pipeline (teacher suggests → admin approves)
- `app_mode` toggle on `admin_settings`

### What needs to be built

**Priority 1: Polish the solo game for demo-readiness**
- Fix any remaining rough edges in the standard game flow
- Ensure solo warmup works cleanly (teacher photos + monsters, no trio logic)
- Mobile responsiveness pass
- Test the full loop: signup → warmup → enroll → 3 rounds → awards

**Priority 2: Teacher profiles + browse page (Front Door MVP)**
- `profiles` table additions: bio, teaching_style, levels_taught, profile_photo, public flag
- Teacher profile page (`/teacher/[id]` or similar public route)
- Browse/search page for students (filter by level)
- Solo warmup linked from teacher profile ("Try a sample lesson")
- Teacher onboarding flow ("Want to teach?" → signup → profile setup)

**Priority 3: Teacher storefront**
- Public page showing a teacher's available classes
- Schedule, capacity, level, enrollment button
- Post-warmup redirect lands here

**Priority 4: School oversight (when a school customer appears)**
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

**No new migrations in session 92** — all changes are strategic/directional.

---

## File map (what lives where)

### Game engine (src/game/)
- `shell.jsx` — GameShell wrapper, RoundSplash countdown
- `spotlight.jsx` — Main game: StageGrid, ReviewGrid, shuffle/stop, enrollment. Monster card integration
- `students.js` — Static sample data (fallback when no DB)
- `monsters.jsx` — **9 monster SVGs** + `padWithMonsters()` helper

### Play route (src/app/play/)
- `page.tsx` — Visitor /play route. Redirect-if-enrolled, deck loading. Threshold 9→3 (DECK_MIN)
- `actions.ts` — `enrollStudent`, `saveStudentRound`, `addEntry`, `removeEntry`, `findFirstAvailableRound`

### Student routes (src/app/student/)
- `dashboard/page.tsx` — Student dashboard with phase indicator
- `play/page.tsx` — Student game route with submissions-closed gate
- `results/page.tsx` — Awards ceremony gate (blocks until comments approved)
- `results/ResultsCeremony.tsx` — Animated awards reveal with monster mascots

### Teacher routes (src/app/teacher/)
- `students/page.tsx` — Teacher dashboard (standard mode: direct controls)
- `students/class-header.tsx` — Class header with game/review time split
- `students/actions.ts` — Approve/reject, auto-advance trigger
- `deck/` — Teacher deck management

### Admin route (src/app/admin/) — DORMANT in standard mode
- `page.tsx` — Mode check: standard → landing page; multi → full dashboard
- `admin-client.tsx` — Full admin dashboard (dormant — multi-teacher features)
- `actions.ts` — Admin actions (dormant)

### Shared libs (src/lib/)
- `deck.ts` — Warmup deck loader. DECK_MIN=3. Contains multi-teacher logic (dormant — solo path is what runs)
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

### SQL order (every test cycle)
1. `all-in-one-setup-v8.sql`
2. `populate-seed-voter-sessions.sql` (if testing beyond warmup)
3. Pick a jump-to or fast-path (see walkthrough)

Note: `seed-teachers-v1.sql` was for multi-teacher mode and is no longer needed for standard testing.

### Browser setup
- Main window → myked70 (student)
- InPrivate → getgroovr (teacher/admin) OR anonymous /play

---

## Recommended next session (93)

1. **Audit the solo warmup flow.** Mike plays through `/play` as a new student with getgroovr's teacher account having only 3-5 photos. Verify monsters fill correctly, shuffle-stop works, enrollment completes. Note any rough edges.

2. **Mobile responsiveness check.** Open the student flow on a phone-width browser. Flag anything broken.

3. **Identify what "demo-ready" means.** Walk through the full loop (signup → warmup → enroll → 3 rounds → awards) and list every gap between current state and something Mike could show to a teacher friend.

4. **Begin teacher profile design.** What fields does a teacher profile need? Bio, photo, levels, languages, schedule, teaching style? Sketch the schema additions and the public profile page layout. This is the first piece of the Front Door.

---

## Parked items

- **Multi-teacher warmup code** — dormant behind `app_mode = 'multi'`. Code stays, no development.
- **Teacher avatar/monster personality system** — fun idea, no current home. Could return as a teacher profile flair feature.
- **Teacher awards ceremony** — shelved with multi-teacher competition.
- **Teacherhood ladder** (student winner → teacher candidate) — interesting growth concept, far future.
- **Chunk H fix** (teacher `suggestTopic` hardcodes `status: "approved"`) — irrelevant in standard mode where topics are managed directly.
- **Open enrollment (Chunk OE)** — superseded by Front Door concept.
