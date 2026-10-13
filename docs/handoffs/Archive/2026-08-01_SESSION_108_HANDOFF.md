# Session 108 Handoff
**Date:** 2026-08-01
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

## What Was Done This Session

### 1. Warmup Messaging Fixes (Items 1–4)

Fixed three screenshots worth of wrong/misleading text on the anonymous teacher warmup at `/play/[teacherId]`:

**`page_play_tid.tsx`** (`src/app/play/[teacherId]/page.tsx`)
- Loads teacher's `display_name` from profiles and passes `gameType="warmup"`, `teacherName`, and `teacherId` as props to GameShell
- Both the level-scoped path and the legacy fallback path covered

**`shell.jsx`** (`src/game/shell.jsx`)
- Accepts and threads `gameType`, `teacherName`, `teacherId` through to the App component

**`spotlight.jsx`** (`src/game/spotlight.jsx`)
- **Splash header:** "ESL CONVERSATION — SPRING" → **"MEET YOUR TEACHER"** when `gameType="warmup"`
- **Splash subtitle:** "3 classmates to meet…" → **"[Teacher] picked 3 photos to share. Take a look and share your thoughts."**
- **Splash button:** "Enter the stage" → **"Start the warmup →"**
- **Back link:** Added **"← Browse teachers"** link below the start button (links to `/play`)
- **Game header ←:** Goes directly to `/play` in warmup mode (no trapped feeling)
- **Done screen CTA:** "Join the class →" → **"See [Teacher]'s profile →"** as an `<a>` tag linking to `/teachers/[teacherId]` — no longer triggers the email enrollment form
- **DoneScreen** accepts `gameType`, `teacherName`, `teacherId` props; enrollment form is unreachable from warmup path (code retained for future non-warmup visitor flow)

### 2. Starter Photo Sharing — Junction Table + Recruiting Levels

**Problem:** Starter photos were bolted to a single class via `entries.class_id`. A teacher with multiple classes couldn't share photos between them. The recruiting warmup was tied to finding a specific recruiting class — fragile when multiple classes exist at the same level.

**Solution:** New `starter_assignments` junction table + `recruiting_levels` array column on entries.

**Migration:** `20260801120000_starter_assignments.sql`
- `starter_assignments` table: `(entry_id, class_id, is_active)` composite PK, CASCADE deletes
- `entries.recruiting_levels text[]` column: array of level strings (e.g. `{'beginner','advanced'}`)
- RLS policies for teacher ownership
- Backfill: existing starters get assignment rows for their current class; starters in recruiting classes get their level added to `recruiting_levels`

**Deck actions** (`src/app/teacher/deck/actions.ts`)
- `toggleClassAssignment(entryId, classId)` — assigns/unassigns a photo to a class. If junction row exists, deletes it; otherwise inserts with `is_active=true`
- `toggleRecruitingLevel(entryId, level)` — adds/removes a level from the `recruiting_levels` array
- `uploadStarter` — now also creates the initial `starter_assignments` row when a photo is uploaded

**Deck client** (`src/app/teacher/deck/deck-client.tsx`)
- `Starter` type gained `recruiting_levels: string[]` and `assignments: {class_id, is_active}[]`
- New `ClassSummary` type: `{id, name, level}` — passed as `allClasses` for assignment controls
- Each `StarterCard` now shows two new control rows:
  - **Recruiting warmup** — three small pills (Beg / Int / Adv) toggling which anonymous warmups this photo appears in. Blue highlight when active.
  - **Also in** — pills for every other class the teacher owns. Green highlight when assigned. One tap to share/unshare.
- Both rows use optimistic UI updates
- "In warmup ✓" relabeled to "Active in class ✓" (the existing `is_active` toggle on entries)

**Deck page** (`src/app/teacher/deck/page.tsx`)
- Entries query now selects `recruiting_levels`
- Loads `starter_assignments` for all starters and maps them by entry_id
- Builds `allClassesSummary` and passes to DeckClient

**Warmup page** (`src/app/play/[teacherId]/page.tsx`)
- Warmup query is now **teacher-level, not class-level**: `entries WHERE student_id = teacherId AND is_starter = true AND recruiting_levels @> [level]`
- No longer depends on finding a recruiting class — if the teacher flags photos for a level's warmup, they show up
- The `?level=` param still works, now controlling which `recruiting_levels` to filter by

**Class deck** (`src/lib/class-deck.ts`)
- Warmup round (round 0) now queries through `starter_assignments`: loads `entry_id`s assigned to the class, then loads entries by id
- Legacy fallback: if no junction rows found, falls back to direct `class_id` query (covers pre-migration data)
- Non-warmup rounds (student submissions) unchanged — those entries have direct `class_id` and aren't shared

### 3. Naming Discussion: "Class" vs "Showcase"

Discussed renaming "standard mode" and "multi mode" to clearer labels. Decision direction:
- **Class** (or "Student Spotlight") — student-led, teacher starts with warmup then students upload/comment
- **Showcase** (or "Teacher Showcase") — teacher-led, teachers upload under monster aliases, students vote/comment

Not yet implemented in UI. The concept: "Class" tab on teacher dashboard = current classes. "Showcase →" button = where "Multi-Mode →" currently sits. Teacher profiles would be the recruitment hub for both modes.

---

## Bugs Found During Testing (Carried from Session 107)

### BUG: `saveProfile` still requires self-photo server-side

The `FinishJoiningForm` UI no longer shows the photo field, but `saveProfile` in `actions.ts` lines 644-649 still hard-fails if no photo is uploaded. **Fix needed:** Remove the photo requirement from `saveProfile`.

---

## What Comes Next — Enrollment Flow Redesign (Carried from Session 107)

### Problem Statement

The current "Finish joining" form asks for too much at once (name, screen name, self-photo, favorite comment, first photo + description) and creates the enrollment at the wrong time. Students who complete their profile but bail before uploading a photo still take up a roster spot. The `profiles.class_id` and `enrollments` table are out of sync. The play page can't find the class for real users.

Mike's directive: "Until they've uploaded a pic, I don't even think they should take up a spot."

### Revised Flow (Mike-approved sequencing)

**Phase 1 — Browse & Discover** (`/play`)
Teacher cards show real details: round count, time commitment, current class size, when it starts. Message at top: "Play a free warmup round to see how it works, then join a class."

**Phase 2 — Warmup** (no account needed)
Before the grid: "This is the warmup round — your teacher picked these photos for you to practice with. Once you join, you'll see photos from your classmates and get feedback from your teacher."
Student plays warmup. At the end → **"See [teacher]'s profile →"** (Session 108 fix). Enrollment happens from the teacher's profile/class listing page.

**Phase 3 — Account + Profile** (lightweight, no enrollment)
After signup/login: just full name + screen name. Two fields, one button. Warmup session data attached. **No enrollment row created yet.** No photo upload.

**Phase 4 — Upload First Photo** (THIS creates the enrollment)
Form transitions immediately (same page, state change) to photo upload + description + favorite comment. On submit: enrollment row created, entry row created at round 1, `profiles.class_id` set, favorite comment written to game_session. **This is when the student "exists" in the class.**

**Phase 5 — Dashboard**
Student sees their entry (pending approval), warmup history, class info. "Go to the game" works because `profiles.class_id` is now set.

### Key Files to Request

- `src/app/student/dashboard/FinishJoiningForm.tsx` — to split into two components
- `src/app/student/dashboard/page.tsx` — to update the `isComplete` logic
- `src/app/play/actions.ts` — to split `saveProfile` into `saveProfileInfo` + `saveFirstEntry`
- `src/app/play/page.tsx` — to add class details to teacher cards

---

## Broader Organizational Work Discussed (Not Yet Built)

### Play Page Routing

The `/play` browse page needs two clear paths:
- **"Go to my class"** — for enrolled students (Class/standard mode)
- **"Browse teachers"** — leads to teacher profiles, and from there to joining a class OR playing Showcase games

### Teacher Dashboard Navigation

- "Multi-Mode →" button on Classes page → rename to "Showcase →"
- One button to enter Showcase from Classes; one button to return to Classes from Showcase
- No stray Showcase links from Deck or Profile tabs
- Teacher profiles move to be the gateway/recruitment hub for both modes

### Shared Deck Concept (Decided Against Merging)

The Showcase (multi-teacher) deck is per-game (`multi_teacher_photos`), while the Class deck is per-teacher (`entries` with `is_starter=true`). Merging would create fragile coupling — the warmup would depend on the teacher having an active Showcase game. Kept separate. A future convenience feature could let teachers copy photos between the two systems.

---

## Multi-Teacher Game Build — COMPLETE ✅

All 8 phases are shipped. The multi-teacher game feature is done.

### Remaining Cleanup Items

- [ ] Admin page could gain read-only oversight of multi-teacher games (future)
- [ ] Delete dormant files: `switch-mode-footer.tsx`, `request-actions.ts` (no longer imported)

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
- **Waiting list (Session 106):** When a game has 3 active participants, additional joins become `waiting` status. When someone drops out, the first waiter is promoted. Replay creates a new game and auto-invites up to 2 waiting teachers.
- **Auto-archive (Session 106):** Games get a 7-day `archive_after` deadline at creation. `checkAutoArchive` runs on lobby page load, archiving stale forming games.
- **Game stats (Session 106):** Vote tallies computed per teacher (1st=3, 2nd=2, 3rd=1 points). Stats section shows medals, pick breakdowns, comment counts. Collapsible on game detail page.
- **Enrollment routing** (Session 100): `enrollStudent` finds a class at the right level with room, prioritizing the original class the photos came from.
- **Student continuation** (Session 100): Awards ceremony shows "Continue with [teacher name] →" CTA linking to the teacher's public profile when they have open classes.
- **Enrollment = photo uploaded** (Session 107 design): Students shouldn't take a roster spot until they upload their first photo. Profile save (name + screen name) is decoupled from enrollment.
- **Starter photo sharing (Session 108):** Photos are assigned to classes via `starter_assignments` junction table. A single photo can appear in multiple classes. Recruiting warmup visibility is controlled independently via `entries.recruiting_levels` array — not tied to any class's `is_recruiting` flag. The two systems (class assignment vs. recruiting warmup) are fully orthogonal.

---

## The App as It Stands Now

### What works today

- **Auth:** Magic link login, password login, role-based routing (student/teacher). Signup page restyled to match login (Session 107).
- **Student flow:** Join via `/play/[teacherId]` warmup → see teacher profile → enrolled → play rounds → vote/comment/upload → awards ceremony → "Continue with teacher" CTA
- **Teacher flow:** Upload deck photos by level → share across classes → set recruiting warmup levels → moderate student submissions → manage rounds
- **Game engine:** 3×3 grid, shuffle-stop reveal, combined screen (vote + upload), round timing. Equal-width columns (`minmax(0, 1fr)`), mobile-responsive. Warmup mode shows teacher-specific messaging ("Meet your teacher", "Start the warmup →", "See [teacher]'s profile →").
- **Awards ceremony:** Competition ranking, confetti, gold/silver/bronze, monster mascots, teacher continuation CTA
- **Monster cards:** 9 SVG monsters, `padWithMonsters()` fills short decks, `MonsterAvatar` for spinner/badges
- **Teacher dashboard:** Direct class creation with level picker, inline topic management, game schedule controls, messaging. TopNav: `Class | Deck | Profile` with "Multi-Mode →" button. Class settings now collapsed behind a toggle (Session 104).
- **Deck page:** Per-class organization, level tabs, per-level photo management, recruiting toggle, recruiting level pills per photo (Beg/Int/Adv), cross-class sharing pills, warm color scheme
- **Enrollment routing:** `enrollStudent` finds class at right level with room (not hardcoded)
- **Play/browse page:** `/play` shows teacher cards with level buttons AND multi-teacher game event cards (Session 105). Links to `/play/multi/[gameId]` for game play.
- **Multi-teacher student play (Session 105):** `/play/multi/[gameId]` — splash → 3×3 blind photo grid → shuffle-stop through all 9 → pick top 3 favorites (each reveals monster avatar) → email submit.
- **Teacher profiles:** `/teacher/profile` editor, `/teachers/[id]` public profile
- **Messaging:** Teacher ↔ student messages
- **Admin dashboard:** Teachers tab (class requests, coordination thread, teacher profiles with game counts, messages) and Games tab (overview stats, game topics, active classes, archived classes).
- **Multi-teacher lobby:** `/teacher/multi` — create, join, leave games. Upload photos. Start games.
- **Multi-teacher game detail:** `/teacher/multi/[gameId]` — round tabs, avatar spinner gate, per-round photo upload, topic editing, readiness tracking, start game controls. Comment review inbox. Game stats. Lifecycle controls.
- **Mobile responsive:** Teacher dashboard, deck page, student dashboard, and game engine all handle narrow screens (~375px).

### What's built but dormant

- `class_requests` table still in DB, used by admin ClassRequestsSection
- `switch-mode-footer.tsx` and `request-actions.ts` still in repo, no longer imported (delete these)

---

## File Map (what lives where)

### Game engine (src/game/)
- `shell.jsx` — GameShell wrapper, RoundSplash countdown. Mobile-responsive card padding. Session 108: threads `gameType`, `teacherName`, `teacherId` to App.
- `spotlight.jsx` — Main game: StageGrid, ReviewGrid, shuffle/stop, enrollment. Session 108: warmup-aware splash/done screen, back link. Grid columns use `minmax(0, 1fr)`. Monster card integration. Name text uses `overflowWrap: "anywhere"`.
- `monsters.jsx` — 9 monster SVGs + `padWithMonsters()` helper + `MonsterAvatar` (ring, greyed, showName) + `MonsterCard` (body color fill, name)

### Play route (src/app/play/)
- `page.tsx` — Browse page: teacher cards with level buttons, multi-teacher game event cards (Session 105), "Are you a teacher?" CTA
- `[teacherId]/page.tsx` — Per-teacher warmup. Session 108: loads teacher name, passes warmup context to GameShell. Warmup query uses `recruiting_levels` (teacher-level, not class-level).
- `actions.ts` — `enrollStudent` (level-aware class routing), `saveProfile` (Session 107: self-photo requirement needs removal), `saveStudentRound`, `addEntry`, `removeEntry`, `findFirstAvailableRound`.
- `multi/actions.ts` — `submitMultiGamePlay` (votes + comments + join in one shot, Session 105)
- `multi/[gameId]/page.tsx` — Multi-teacher game play server component (Session 105).
- `multi/[gameId]/play-client.tsx` — Multi-teacher game play client (Session 105).

### Student routes (src/app/student/)
- `dashboard/page.tsx` — Student dashboard with phase indicator. Header wraps on mobile.
- `dashboard/FinishJoiningForm.tsx` — Session 107: avatar removed, labels fixed. Next step: split into ProfileForm + PhotoUploadForm.
- `play/page.tsx` — Student game route with submissions-closed gate. Session 107: improved holding page messages.
- `results/page.tsx` — Awards ceremony gate. Resolves teacher for continuation CTA.
- `results/ResultsCeremony.tsx` — Animated awards reveal with monster mascots.

### Auth routes (src/app/auth/)
- `signup/page.tsx` — Session 107: restyled to tan/cream palette, 18+ only checkbox, redirect fix.
- `login/page.tsx` — Session 89: tan/cream palette.
- `callback/route.ts` — Auth callback handler.

### Teacher routes (src/app/teacher/)
- `students/page.tsx` — Class roster, round management. TopNav: `Class | Deck | Profile`. "Multi-Mode →" button.
- `students/class-header.tsx` — Class header with "Student rounds", "Round time", "Play time" labels
- `students/request-class.tsx` — Direct class creation with level picker
- `students/actions.ts` — Approve/reject, auto-advance trigger, `createClassDirect`
- `deck/page.tsx` — Per-class photo management organized by level. Session 108: loads assignments + recruiting_levels, passes `allClasses` to client.
- `deck/deck-client.tsx` — Session 108: recruiting level pills (Beg/Int/Adv), cross-class sharing pills, optimistic UI.
- `deck/actions.ts` — Session 108: added `toggleClassAssignment`, `toggleRecruitingLevel`. Updated `uploadStarter` to create junction row.
- `profile/page.tsx` — Teacher profile editor (bio, teaching style, public toggle)
- `multi/page.tsx` — Multi-teacher game lobby server component.
- `multi/multi-client.tsx` — Lobby client.
- `multi/actions.ts` — All multi-game server actions.
- `multi/[gameId]/page.tsx` — Game detail server component.
- `multi/[gameId]/game-detail-client.tsx` — Game detail client.
- `multi/[gameId]/avatar-spinner.tsx` — 3×3 monster grid with shuffle-stop mechanic.

### Public teacher routes
- `teachers/[id]/page.tsx` — Public teacher profile (bio, teaching style, class listings)

### Admin route (src/app/admin/)
- `page.tsx` — Dashboard always renders (no mode gate)
- `admin-client.tsx` — Teachers tab and Games tab.
- `actions.ts` — No rotation actions. `postScheduleMessage` messages all teachers.

### Shared libs (src/lib/)
- `deck.ts` — Solo loader only. `loadTeacherDeck(teacherId, level?)`.
- `class-deck.ts` — In-class deck loader with submissions-closed gate. Session 108: warmup round queries through `starter_assignments` junction table (with legacy fallback). Session 107: enrollments fallback for class_id lookup.
- `round-timing.ts` — Round computation + phase helpers
- `student-archive.ts` — Student data with phase timing
- `game-results.ts` — Awards/ranking computation
- `multi-game-lifecycle.ts` — `checkAutoArchive`, `promoteWaiter`, `countActiveParticipants`, `buildReplayGame`
- `multi-game-stats.ts` — `getGameStats`
- `supabase-server.ts` — SSR Supabase client
- `supabase-client.ts` — Browser Supabase client
- `message-actions.ts` — Shared message send/read actions

---

## Database Tables Added This Session

### `starter_assignments`
Junction table enabling photo sharing across classes.

| Column | Type | Notes |
|--------|------|-------|
| `entry_id` | UUID FK → entries(id) | ON DELETE CASCADE |
| `class_id` | UUID FK → classes(id) | ON DELETE CASCADE |
| `is_active` | BOOLEAN DEFAULT true | Per-class visibility toggle |
| `created_at` | TIMESTAMPTZ | Auto-set |

**PK:** `(entry_id, class_id)`

### `entries.recruiting_levels` (new column)
`text[] NOT NULL DEFAULT '{}'` — Array of level strings controlling which anonymous warmups this photo appears in. Independent of class assignment. Example: `{'beginner','advanced'}`.

---

## Testing Setup

### Accounts
- **Student:** myked70@yahoo.com (role=student, screen_name=Casper2). Session 107: deleted and re-registered cleanly. Email confirmation disabled.
- **Teacher/Admin:** getgroovr@yahoo.com (role=teacher, is_admin=true)
- **Seed teachers:** seed-teacher-1 through 4 @test.local
- **Seed students:** seed-voter-1 through 8 @test.local

### Getting getgroovr's teacher ID (for play route)

```sql
SELECT get_auth_user_id_by_email('getgroovr@yahoo.com');
```

Use the returned UUID to test: `/play/<uuid>?level=beginner`

### SQL order (every test cycle)
1. `all-in-one-setup-v10.sql` (v10 fixes Phase 8 jsonb_build_object crash)
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
13. `20260726120000_comment_review_status.sql` — Comment review workflow columns
14. `20260727120000_multi_game_lifecycle.sql` — Waiting list, auto-archive, replay link
15. `20260801120000_starter_assignments.sql` — Starter photo sharing: junction table + recruiting_levels column + backfill

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
| S103-spinner | 103 | Avatar assignment: migration, spinner component, spinner gate, spinAvatar action |
| S104-polish | 104 | Game detail polish, class page settings toggle, cleanup dead tables/columns |
| S105-play | 105 | Phase 4+5: Browse page event cards, student play page, comment review inbox |
| S106-lifecycle | 106 | Phase 7+8: Waiting list, lifecycle actions, auto-archive, game stats, game history |
| S107-testing | 107 | Testing pass: SQL v10 bugfix, auth/signup restyle, finish-joining form fixes, student play messaging, enrollment flow redesign (designed, not yet built) |
| S108-warmup | 108 | Warmup messaging fixes (teacher context, back nav), starter photo sharing (junction table, recruiting levels, cross-class sharing, class-deck query update) |

---

## Parked Items

- **Teacher avatar/monster personality system** — fun idea, could return as teacher profile flair.
- **Teacher awards ceremony** — shelved; may revive for multi-teacher game reveal (Phase 6).
- **Teacherhood ladder** (student winner → teacher candidate) — interesting growth concept, far future.
- **Open enrollment (Chunk OE)** — superseded by Front Door concept.
- **Teaching & Learning Styles research** — Word doc created Session 107, saved to project folder.
- **"Class" vs "Showcase" rename** — discussed Session 108, not yet implemented. Rename "Multi-Mode →" to "Showcase →", restructure play page routing.
