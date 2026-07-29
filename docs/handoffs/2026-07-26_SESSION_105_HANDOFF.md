# Session 105 Handoff
**Date:** 2026-07-26
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

### Priority 1: Multi-Teacher Game — Phase 6 (Reveal Ceremony)

The personalized two-layer reveal: avatar → real teacher.

**What needs to happen:**
- Build `/play/multi/[gameId]/reveal/page.tsx` — server component: compute personal tally per student across all rounds, fetch teacher profiles
- Build `/play/multi/[gameId]/reveal/reveal-client.tsx` — animated reveal: 3rd → 2nd → 1st place teacher. Avatar flip to real profile. Approved favorite comments shown. Honorable mentions for all other teachers. Summary page with all teachers, scores, class links, message buttons.

**Files to request at session start:**
- `src/app/student/results/ResultsCeremony.tsx` — existing awards animation patterns
- `src/game/monsters.jsx` — avatar SVGs for the reveal animation
- `MULTI_TEACHER_GAME_DESIGN.md` — Phase 6 section for full spec

**Design reference:** See Phase 6 in the design document. Key details:
- Points tallied per student per teacher across all rounds (1st=3, 2nd=2, 3rd=1)
- Reveal order: 3rd place → 2nd place → 1st place
- Each reveal: monster avatar shown → flips to real teacher profile (name, photo, bio, teaching style)
- Approved favorite comments shown alongside each teacher
- Honorable mentions for all other teachers
- Summary page with all teachers, scores, class links, "Message" buttons

### Priority 2: Multi-Teacher Game — Phases 7–8

After reveal works:
- **Phase 7** — Lifecycle management (auto-start, auto-archive, teacher substitution, game replay)
- **Phase 8** — Polish + teacher stats (engagement metrics, game history)

### Remaining Cleanup Items

- [ ] Admin page could gain read-only oversight of multi-teacher games (future)

---

## Multi-Teacher Game — Build Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Foundation — DB tables, cleanup old rotation model | ✅ Done (Session 98) |
| 2 | Teacher Lobby — create/join/leave games, upload photos | ✅ Done (Session 98) |
| 3 | Game Detail — round tabs, per-round photo upload, topic editing, readiness tracking | ✅ Done (Session 99) |
| 3.5 | Avatar Assignment — pre-game monster spin, avatar mode, spinner gate | ✅ Done (Session 103) |
| 3.6 | Game Detail Polish — max-width layout, collapsible topics, spin gate for prev round photos, editable settings until 2nd teacher joins, avatar profile link | ✅ Done (Session 104) |
| 4 | Browse Page + Student Play — game cards on `/play`, 3×3 blind photo grid, shuffle-stop, ranked voting (top 3), avatar reveal on each pick, email submit | ✅ Done (Session 105) |
| 5 | Comment Review + Teacher Feedback — teacher inbox for favorite comments, approve/reject, reply, flag student | ✅ Done (Session 105) |
| 6 | Reveal Ceremony — personalized two-layer reveal per student | **Next** |
| 7 | Lifecycle — auto-start, auto-archive, substitution, replay | Not started |
| 8 | Polish — engagement stats, game history, notifications | Not started |

**Database tables created (7 + review columns):**
- ✅ `multi_teacher_games` — the game event (has `avatar_mode` column)
- ✅ `multi_teacher_participants` — teachers in a game
- ✅ `multi_teacher_photos` — photo submissions
- ✅ `multi_game_rounds` — per-round config (topic, timing, status)
- ✅ `monster_avatars` — persistent identity for the 9 monsters (seeded)
- ✅ `multi_game_avatar_assignments` — which teacher got which monster per round
- ✅ `multi_game_students` — students who joined the event (Session 105)
- ✅ `multi_game_votes` — student ranked votes 1st/2nd/3rd (Session 105)
- ✅ `multi_game_comments` — comments with favorite flag, approval workflow, reply threading (Session 105). Has `review_status` ('pending'/'approved'/'rejected'), `reviewed_at`, `reviewed_by` columns (Session 105).

**Tables dropped (Session 104 cleanup):**
- ❌ `teacher_rotation` — dropped, was unreferenced since Session 98

**Columns dropped (Session 104 cleanup):**
- ❌ `entries.selected_solo`, `entries.selected_trio`, `entries.selected_full` — no longer read

**Game lifecycle (current):** `forming` → `ready` → `active` → `complete`
**Game lifecycle (target):** `created` → `open` → `active` → `reveal` → `complete` / `replay`

---

## Architecture Decisions

- **Admin retains oversight** — not interference. Class requests are oversight. Coordination thread is a shared channel.
- **No mode switching** — the dashboard always renders. Teachers self-organize via `/teacher/multi`.
- **Game lifecycle**: Creator starts game when ≥3 participants each have ≥1 round-1 photo.
- **Photo storage**: `teacher-deck` bucket, path `multi/{gameId}/{teacherId}/{timestamp}.ext`
- **Multi-teacher games are separate from regular class games.** Teachers create content; students vote and comment but never upload. Teacher identity hidden behind monster avatars during play, revealed at the end.
- **Avatar assignment (Session 102/103):** Teachers spin a 3×3 monster grid before uploading photos. Single mode = same monster all rounds (second spin confirms). Rotating mode = different monster each round (used monsters greyed out). Avatar mode set by game creator, invisible to participants.
- **Spin gate (Session 104):** Can't spin for round N until teacher has uploaded ≥1 photo for round N-1. Enforced in both UI and server action.
- **Game settings (Session 104):** Creator can edit round duration/review time until a second teacher joins. Locked after that.
- **Student play (Session 105):** Students play unauthenticated (client state), then enter email at end to submit. Matches the existing visitor flow pattern from spotlight.jsx. Votes + comments saved in one shot via `submitMultiGamePlay`. Magic link sent for future return.
- **Comment review (Session 105):** Only favorite comments go through approve/reject. Browse comments are casual and don't need teacher approval. Teacher replies are private (parent_id threading). Flagged students are blocked via `multi_game_students.is_flagged`.
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
- **Monster cards:** 9 SVG monsters, `padWithMonsters()` fills short decks, `MonsterAvatar` for spinner/badges
- **Teacher dashboard:** Direct class creation with level picker, inline topic management, game schedule controls, messaging. TopNav: `Class | Deck | Profile` with "Multi-Mode →" button. Class settings now collapsed behind a toggle (Session 104).
- **Deck page:** Per-class organization, level tabs, per-level photo management, recruiting toggle, warm color scheme
- **Enrollment routing:** `enrollStudent` finds class at right level with room (not hardcoded)
- **Play/browse page:** `/play` shows teacher cards with level buttons AND multi-teacher game event cards (Session 105). Links to `/play/multi/[gameId]` for game play.
- **Multi-teacher student play (Session 105):** `/play/multi/[gameId]` — splash → 3×3 blind photo grid → shuffle-stop through all 9 → pick top 3 favorites (each reveals monster avatar) → email submit. Votes, browse comments, and favorite comments saved in one action.
- **Teacher profiles:** `/teacher/profile` editor, `/teachers/[id]` public profile
- **Messaging:** Teacher ↔ student messages
- **Admin dashboard:** Teachers tab (class requests, coordination thread, teacher profiles with game counts, messages) and Games tab (overview stats, game topics, active classes, archived classes).
- **Multi-teacher lobby:** `/teacher/multi` — create, join, leave games. Upload photos. Start games. "Manage →" links to game detail. Max-width 720px layout.
- **Multi-teacher game detail:** `/teacher/multi/[gameId]` — max-width 720px layout (Session 104), round tabs, avatar spinner gate, per-round photo upload (3 per teacher), avatar badge with expandable profile, collapsible topic editing, readiness tracking, start game controls. **Comment review inbox (Session 105):** collapsible "Student comments" section showing pending/approved/rejected favorite comments, approve/reject buttons, inline reply form, flag student with confirmation.
- **Mobile responsive:** Teacher dashboard, deck page, student dashboard, and game engine all handle narrow screens (~375px).

### What's built but dormant

- `class_requests` table still in DB, used by admin ClassRequestsSection
- `switch-mode-footer.tsx` and `request-actions.ts` still in repo, no longer imported (delete these)

---

## File Map (what lives where)

### Game engine (src/game/)
- `shell.jsx` — GameShell wrapper, RoundSplash countdown. Mobile-responsive card padding.
- `spotlight.jsx` — Main game: StageGrid, ReviewGrid, shuffle/stop, enrollment. Grid columns use `minmax(0, 1fr)`. Monster card integration. Name text uses `overflowWrap: "anywhere"`.
- `monsters.jsx` — 9 monster SVGs + `padWithMonsters()` helper + `MonsterAvatar` (ring, greyed, showName) + `MonsterCard` (body color fill, name)

### Play route (src/app/play/)
- `page.tsx` — Browse page: teacher cards with level buttons, multi-teacher game event cards (Session 105), "Are you a teacher?" CTA
- `[teacherId]/page.tsx` — Per-teacher warmup. Accepts `?level=beginner|intermediate|advanced`.
- `actions.ts` — `enrollStudent` (level-aware class routing), `saveStudentRound`, `addEntry`, `removeEntry`, `findFirstAvailableRound`.
- `multi/actions.ts` — `submitMultiGamePlay` (votes + comments + join in one shot, Session 105)
- `multi/[gameId]/page.tsx` — Multi-teacher game play server component (Session 105). Fetches game, active round, photos, avatar assignments, monsters.
- `multi/[gameId]/play-client.tsx` — Multi-teacher game play client (Session 105). Splash → 3×3 blind photo grid → shuffle-stop → pick top 3 with avatar reveal → email submit.

### Student routes (src/app/student/)
- `dashboard/page.tsx` — Student dashboard with phase indicator. Header wraps on mobile.
- `play/page.tsx` — Student game route with submissions-closed gate
- `results/page.tsx` — Awards ceremony gate. Resolves teacher for continuation CTA.
- `results/ResultsCeremony.tsx` — Animated awards reveal with monster mascots. "Continue with [teacher] →" button when teacher has open classes.

### Teacher routes (src/app/teacher/)
- `students/page.tsx` — Class roster, round management. TopNav: `Class | Deck | Profile`. "Multi-Mode →" button links to `/teacher/multi`. Student grid responsive, class bars wrap on mobile. Class settings collapsed behind toggle (Session 104).
- `students/class-header.tsx` — Class header with "Student rounds", "Round time", "Play time" labels
- `students/request-class.tsx` — Direct class creation with level picker
- `students/actions.ts` — Approve/reject, auto-advance trigger, `createClassDirect`
- `deck/page.tsx` — Per-class photo management organized by level
- `deck/deck-client.tsx` — Level-aware photo upload, recruiting toggle, warmup title/prompt. Class card summary text overflow protection.
- `deck/actions.ts` — `uploadStarter`, `toggleInWarmup`, `toggleRecruiting`, `deleteStarter`, etc.
- `profile/page.tsx` — Teacher profile editor (bio, teaching style, public toggle)
- `multi/page.tsx` — Multi-teacher game lobby server component
- `multi/multi-client.tsx` — Lobby client: My Games (with "Manage →" links), Available Games, Create Game form (collapsible). Max-width 720px layout.
- `multi/actions.ts` — `createMultiGame`, `joinMultiGame`, `leaveMultiGame`, `uploadMultiPhoto`, `deleteMultiPhoto`, `startMultiGame`, `deleteMultiGame`, `updateRoundTopic`, `updateGameSettings`, `spinAvatar`, `approveComment` (Session 105), `rejectComment` (Session 105), `replyToComment` (Session 105), `flagStudent` (Session 105)
- `multi/[gameId]/page.tsx` — Game detail server component. Fetches monsters + avatar assignments for spinner. Fetches favorite comments for review inbox (Session 105). Max-width 720px wrapper.
- `multi/[gameId]/game-detail-client.tsx` — Round tabs, avatar spinner gate, avatar badge with expandable profile, collapsible topic section, per-round photo upload (3 per teacher), readiness tracking, start game controls. **Session 105:** CommentInbox + CommentCard components for teacher comment review (approve/reject/reply/flag).
- `multi/[gameId]/avatar-spinner.tsx` — 3×3 monster grid with shuffle-stop mechanic.

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
10. `20260724120000_monster_avatars.sql` — Monster avatars table (9 seeded), avatar_mode column, avatar assignments table
11. `20260725120000_cleanup_dead_tables_columns.sql` — Drop teacher_rotation table, drop stale entry columns
12. `20260725180000_multi_game_student_play.sql` — Student play tables (students, votes, comments)
13. `20260726120000_comment_review_status.sql` — Comment review workflow columns (review_status, reviewed_at, reviewed_by)

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
| S102-avatars | 102 | Design doc rewrite (avatar system, student play flow, comment review) |
| S103-spinner | 103 | Avatar assignment: migration, spinner component, spinner gate, spinAvatar action, page.tsx queries |
| S104-polish | 104 | Game detail: max-width layout, collapsible topics, spin gate for prev round, editable settings until 2nd teacher, avatar profile link. Class page: settings behind collapsible toggle. Cleanup: drop teacher_rotation table, drop stale entry columns. |
| S105-play | 105 | Phase 4: Browse page event cards, student play page (blind 3×3 grid, shuffle-stop, ranked top-3 voting with avatar reveal, email submit). Phase 5: Comment review inbox (approve/reject/reply/flag), review_status migration, 4 new server actions, page.tsx wired with comments query. |

---

## Parked Items

- **Teacher avatar/monster personality system** — fun idea, could return as teacher profile flair.
- **Teacher awards ceremony** — shelved; may revive for multi-teacher game reveal (Phase 6).
- **Teacherhood ladder** (student winner → teacher candidate) — interesting growth concept, far future.
- **Open enrollment (Chunk OE)** — superseded by Front Door concept.
