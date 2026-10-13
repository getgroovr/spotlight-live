# Session 102 Handoff
**Date:** 2026-07-24
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

## What Comes Next

### Priority 1: Multi-Teacher Game — Phase 4 (Student Play Experience)

This is the next major build. Students need to be able to discover and play multi-teacher games.

**What needs to happen:**
- Add multi-teacher game cards to the `/play` browse page alongside regular class listings
- Build `/play/multi/[gameId]` — student play page with 3×3 grid, rotating monster avatars, and ranked voting (pick 1st/2nd/3rd)
- Build server actions for student join, vote submission, and comment submission
- Create `multi_game_students` and `multi_game_votes` database tables

**Files to request at session start:**
- `src/app/play/page.tsx` — current browse page (to add game cards)
- `src/game/spotlight.jsx` — photo grid rendering and voting mechanics
- `src/game/shell.js` — game state management patterns
- `src/game/monsters.jsx` — avatar SVGs for the grid
- `src/app/play/[teacherId]/page.tsx` — existing play entry point patterns
- `src/app/play/actions.ts` — existing enrollment/magic-link patterns

**Design reference:** See the Multi-Teacher Game Design document, Phase 4 section. Key details: ranked voting (1st = 3pts, 2nd = 2pts, 3rd = 1pt), avatar rotation per round, no student-to-student interaction.

### Priority 2: Multi-Teacher Game — Phases 5–8

After student play works:
- **Phase 5** — Private comments + teacher feedback (student-teacher one-on-one on photos)
- **Phase 6** — Reveal ceremony (personalized per-student teacher reveal, avatar-to-profile flip)
- **Phase 7** — Lifecycle management (auto-start, auto-archive, teacher substitution, game replay)
- **Phase 8** — Polish + teacher stats (engagement metrics, game history)

### Remaining Cleanup Items

- [ ] **Drop `teacher_rotation` table** — nothing references it anymore
- [ ] **Drop dead files** — `switch-mode-footer.tsx`, `request-actions.ts` (no longer imported)
- [ ] **Drop stale DB columns** — `selected_solo`, `selected_trio`, `selected_full` on entries (no longer read)
- [ ] Admin page could gain read-only oversight of multi-teacher games (future)

---

## Multi-Teacher Game — Build Status

The Multi-Teacher Game Design document describes an 8-phase build. Here's where things stand:

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Foundation — DB tables, cleanup old rotation model | ✅ Done (Session 98) |
| 2 | Teacher Lobby — create/join/leave games, upload photos | ✅ Done (Session 98) |
| 3 | Game Detail — round tabs, per-round photo upload, topic editing, readiness tracking | ✅ Done (Session 99) |
| 4 | Browse Page + Student Play — game cards on `/play`, ranked voting, student join | **Next** |
| 5 | Private Comments — student-teacher private comments on photos | Not started |
| 6 | Reveal Ceremony — personalized teacher reveal per student | Not started |
| 7 | Lifecycle — auto-start, auto-archive, substitution, replay | Not started |
| 8 | Polish — engagement stats, game history, notifications | Not started |

**Database tables created (4 of 8):**
- ✅ `multi_teacher_games` — the game event
- ✅ `multi_teacher_participants` — teachers in a game
- ✅ `multi_teacher_photos` — photo submissions
- ✅ `multi_game_rounds` — per-round config (topic, timing, status)

**Tables still needed (4):**
- `multi_game_round_avatars` — avatar assignments per photo per round
- `multi_game_students` — students who joined the event
- `multi_game_votes` — student ranked votes (1st/2nd/3rd)
- `multi_game_comments` — private student-teacher comments

**Game lifecycle (current):** `forming` → `ready` → `active` → `complete`
**Game lifecycle (target):** `created` → `open` → `active` → `reveal` → `complete` / `replay`

---

## Architecture Decisions

- **Admin retains oversight** — not interference. Class requests are oversight. Coordination thread is a shared channel.
- **No mode switching** — the dashboard always renders. Teachers self-organize via `/teacher/multi`.
- **Game lifecycle**: Creator starts game when ≥3 participants each have ≥1 round-1 photo.
- **Photo storage**: `teacher-deck` bucket, path `multi/{gameId}/{teacherId}/{timestamp}.ext`
- **Multi-teacher games are separate from regular class games.** Teachers create content; students vote and comment but never upload. Teacher identity hidden behind rotating monster avatars during play, revealed at the end.
- **Enrollment routing** (Session 100): `enrollStudent` finds a class at the right level with room, prioritizing the original class the photos came from.
- **Student continuation** (Session 100): Awards ceremony shows "Continue with [teacher name] →" CTA linking to the teacher's public profile when they have open classes.

---

## The App as It Stands Now

### What works today

- **Auth:** Magic link login, role-based routing (student/teacher)
- **Student flow:** Join via `/play/[teacherId]` warmup → enrolled → play rounds → vote/comment/upload → awards ceremony → "Continue with teacher" CTA
- **Teacher flow:** Upload deck photos by level → moderate student submissions → manage rounds
- **Game engine:** 3×3 grid, shuffle-stop reveal, combined screen (vote + upload), round timing. Equal-width columns (`minmax(0, 1fr)`), mobile-responsive.
- **Awards ceremony:** Competition ranking, confetti, gold/silver/bronze, monster mascots, teacher continuation CTA
- **Monster cards:** 9 SVG monsters, `padWithMonsters()` fills short decks
- **Teacher dashboard:** Direct class creation with level picker, inline topic management, game schedule controls, messaging. TopNav: `Class | Deck | Profile` with "Multi-Mode →" button.
- **Deck page:** Per-class organization, level tabs, per-level photo management, recruiting toggle, warm color scheme
- **Enrollment routing:** `enrollStudent` finds class at right level with room (not hardcoded)
- **Play/browse page:** `/play` shows teacher cards with level buttons, links to profiles
- **Teacher profiles:** `/teacher/profile` editor, `/teachers/[id]` public profile
- **Messaging:** Teacher ↔ student messages
- **Admin dashboard:** Teachers tab (class requests, coordination thread, teacher profiles with game counts, messages) and Games tab (overview stats, game topics, active classes, archived classes).
- **Multi-teacher lobby:** `/teacher/multi` — create, join, leave games. Upload photos. Start games. "Manage →" links to game detail.
- **Multi-teacher game detail:** `/teacher/multi/[gameId]` — round tabs, per-round photo upload (3 per teacher), topic editing (creator only), readiness tracking, start game controls.
- **Mobile responsive:** Teacher dashboard, deck page, student dashboard, and game engine all handle narrow screens (~375px).

### What's built but dormant

- `teacher_rotation` table still in DB, unreferenced
- `class_requests` table still in DB, used by admin ClassRequestsSection
- Mode selection columns on entries (`selected_solo`, `selected_trio`, `selected_full`) still in DB, no longer read
- `switch-mode-footer.tsx` and `request-actions.ts` still in repo, no longer imported

---

## File Map (what lives where)

### Game engine (src/game/)
- `shell.jsx` — GameShell wrapper, RoundSplash countdown. Mobile-responsive card padding.
- `spotlight.jsx` — Main game: StageGrid, ReviewGrid, shuffle/stop, enrollment. Grid columns use `minmax(0, 1fr)`. Monster card integration. Name text uses `overflowWrap: "anywhere"`.
- `monsters.jsx` — 9 monster SVGs + `padWithMonsters()` helper

### Play route (src/app/play/)
- `page.tsx` — Browse page: teacher cards with level buttons, "Are you a teacher?" CTA
- `[teacherId]/page.tsx` — Per-teacher warmup. Accepts `?level=beginner|intermediate|advanced`.
- `actions.ts` — `enrollStudent` (level-aware class routing), `saveStudentRound`, `addEntry`, `removeEntry`, `findFirstAvailableRound`.

### Student routes (src/app/student/)
- `dashboard/page.tsx` — Student dashboard with phase indicator. Header wraps on mobile.
- `play/page.tsx` — Student game route with submissions-closed gate
- `results/page.tsx` — Awards ceremony gate. Resolves teacher for continuation CTA.
- `results/ResultsCeremony.tsx` — Animated awards reveal with monster mascots. "Continue with [teacher] →" button when teacher has open classes.

### Teacher routes (src/app/teacher/)
- `students/page.tsx` — Class roster, round management. TopNav: `Class | Deck | Profile`. "Multi-Mode →" button links to `/teacher/multi`. Student grid responsive, class bars wrap on mobile.
- `students/class-header.tsx` — Class header with "Student rounds", "Round time", "Play time" labels
- `students/request-class.tsx` — Direct class creation with level picker
- `students/actions.ts` — Approve/reject, auto-advance trigger, `createClassDirect`
- `deck/page.tsx` — Per-class photo management organized by level
- `deck/deck-client.tsx` — Level-aware photo upload, recruiting toggle, warmup title/prompt. Class card summary text overflow protection.
- `deck/actions.ts` — `uploadStarter`, `toggleInWarmup`, `toggleRecruiting`, `deleteStarter`, etc.
- `profile/page.tsx` — Teacher profile editor (bio, teaching style, public toggle)
- `multi/page.tsx` — Multi-teacher game lobby server component
- `multi/multi-client.tsx` — Lobby client: My Games (with "Manage →" links), Available Games, Create Game form (collapsible). Max-width 720px layout.
- `multi/actions.ts` — `createMultiGame`, `joinMultiGame`, `leaveMultiGame`, `uploadMultiPhoto`, `deleteMultiPhoto`, `startMultiGame`, `deleteMultiGame`, `updateRoundTopic`, `updateGameSettings`
- `multi/[gameId]/page.tsx` — Game detail server component
- `multi/[gameId]/game-detail-client.tsx` — Round tabs, per-round photo upload (3 per teacher), topic editing (creator only), readiness tracking, start game controls

### Public teacher routes
- `teachers/[id]/page.tsx` — Public teacher profile (bio, teaching style, class listings)

### Admin route (src/app/admin/)
- `page.tsx` — Dashboard always renders (no mode gate)
- `admin-client.tsx` — Teachers tab (class requests, coordination thread, teacher profiles with game counts, messages) and Games tab (overview stats, game topics, active/archived classes)
- `actions.ts` — No rotation actions. `postScheduleMessage` messages all teachers.

### Shared libs (src/lib/)
- `deck.ts` — Solo loader only. `loadTeacherDeck(teacherId, level?)`.
- `class-deck.ts` — In-class deck loader with submissions-closed gate
- `round-timing.ts` — Round computation + phase helpers
- `student-archive.ts` — Student data with phase timing
- `game-results.ts` — Awards/ranking computation
- `supabase-server.ts` — SSR Supabase client
- `supabase-client.ts` — Browser Supabase client
- `message-actions.ts` — Shared message send/read actions

---

## Testing Setup

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
1. `all-in-one-setup-v9.sql`
2. `populate-seed-voter-sessions.sql`
3. Pick a jump-to or fast-path

### Browser setup
- Main window → myked70 (student)
- InPrivate → getgroovr (teacher/admin) OR anonymous `/play/[teacherId]`

---

## Migrations (cumulative, in order)

Run these in the Supabase SQL editor:

1. `migration-session67.sql` — Dual-role + settings
2. `20260625140000_b59_game_sessions_unique.sql` — Session unique constraint
3. `20260702130000_teacher_archiving.sql` — Archiving support
4. `20260703000000_auth_user_lookup_rpc.sql` — Auth-lookup RPC
5. `20260717200000_migration_session93_levels.sql` — Level columns + recruiting flags
6. `20260718060000_round_prompts.sql` — Per-round prompts
7. `20260718120000_teacher_profiles.sql` — Profile browse columns
8. `20260719000000_multi_teacher_games.sql` — Multi-teacher game tables (games, participants, photos)
9. `20260720000000_multi_game_rounds.sql` — Per-round config table

---

## Completed Chunks (cumulative)

| Chunk | Session | Description |
|-------|---------|-------------|
| 1 | 81 | Teacher students page |
| 1.5 | 81 | Teacher class request flow |
| 2 | 82 | Admin dashboard overhaul |
| 3 | 81 | Multi-teacher SQL |
| Docs | 82, 85, 90–92 | Development story + technical blueprint |
| C | 83 | Class size request |
| E | 83 | Admin dashboard polish |
| D1 | 84 | Server-side phase enforcement |
| D2-UI | 84–85 | Student-side phase display |
| M1 | 86 | Standard mode teacher dashboard |
| M2 | 86–87 | Mode routing + admin color scheme |
| F | 87–88 | Flexible grid + monster filler cards |
| G | 89 | Admin aesthetic overhaul + standard mode landing |
| H | 89–90 | Topics sync |
| J-admin | 90 | Schedule coordination thread |
| K | 90 | Message archiving on class archive |
| S93-cleanup | 93 | Multi-teacher code removal from teacher dashboard |
| S93-levels | 93 | Level-aware deck system, warm theme |
| S94-deck | 94 | Deck page per-class organization, class creation with level |
| S95-profiles | 95 | Teacher profiles, browse page, public profile pages |
| S96-labels | 96 | Class header relabeling, deck cleanup |
| S98-cleanup | 98 | Wrong multi-teacher model removal (shared photo pot) |
| S98-multi | 98 | Multi-teacher game foundation: migration, lobby, actions |
| S99-detail | 99 | Game detail page, rounds migration, admin tab restructure, TopNav update |
| S100-enroll | 100 | Enrollment routing fix, student continuation CTA, teacher dashboard UI fixes |
| S101-tiles | 101 | Tile sizing bug fix (minmax grid) + mobile responsiveness pass |

---

## Parked Items

- **Teacher avatar/monster personality system** — fun idea, could return as teacher profile flair.
- **Teacher awards ceremony** — shelved; may revive for multi-teacher game reveal (Phase 6).
- **Teacherhood ladder** (student winner → teacher candidate) — interesting growth concept, far future.
- **Open enrollment (Chunk OE)** — superseded by Front Door concept.
