# Session 98 Handoff
**Date:** 2026-07-19
**Session range covered:** 94–98
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

## ⭐⭐ SESSION 98: WRONG-MODEL CLEANUP + MULTI-TEACHER GAME FOUNDATION

### What happened

Session 98 had two phases: cleaning out the wrong multi-teacher model (the "shared photo pot" approach from earlier sessions), then laying the foundation for the correct multi-teacher game system as described in the Multi-Teacher Game Design document.

**Phase 1 — Wrong-model cleanup (4 files).** The previous multi-teacher model shuffled all teachers' photos into one mixed deck. That model was removed. The correct model: each teacher keeps their own photos, and a multi-teacher game is a separate event where multiple teachers participate together. Files cleaned: `deck.ts`, `actions.ts` (admin), `admin-client.tsx`, `page.tsx` (admin).

**Phase 2 — Multi-teacher game foundation (4 new files + 1 TopNav update).** Created the database migration for the multi-teacher game system (3 tables), the server actions for game CRUD, and the teacher lobby UI at `/teacher/multi`. Added "Multi" link to the teacher TopNav.

### Files delivered

**Cleaned (wrong-model removal):**

| File | Destination | What changed |
|------|-------------|--------------|
| `deck.ts` | `src/lib/deck.ts` | Removed `loadMultiTeacherDeck`, `getActiveRotationTeacherIds`, `getAppMode`. Only `loadTeacherDeck` remains. |
| `actions.ts` | `src/app/admin/actions.ts` | Removed `addToRotation`, `removeFromRotation`, `setRotationStatus`, `moveInRotation`, `updateAppMode`. `postScheduleMessage` now messages ALL teachers (not rotation queue). |
| `admin-client.tsx` | `src/app/admin/admin-client.tsx` | Removed `StandardModeLanding`, rotation queue UI (TeacherSection/TeacherTable), "In rotation" stat. Renamed Recruitment tab → Teachers tab. Class requests extracted into standalone `ClassRequestsSection`. |
| `page_admin.tsx` | `src/app/admin/page.tsx` | Removed rotation query, `rotationMap`, `admin_settings`/`appMode` gate, `StandardModeLanding` import. `TeacherRow.rotation` field removed. Dashboard always renders (no mode check). |

**TopNav update:**

| File | Destination | What changed |
|------|-------------|--------------|
| `page_t-ss.tsx` | `src/app/teacher/students/page.tsx` | Added "Multi" link to TopNav: `Class | Deck | Multi | Profile` |

**New (multi-teacher game system):**

| File | Destination | Purpose |
|------|-------------|---------|
| `20260719000000_multi_teacher_games.sql` | `supabase/migrations/` | Three tables: `multi_teacher_games`, `multi_teacher_participants`, `multi_teacher_photos`. With RLS policies and indexes. |
| `multi-actions.ts` | `src/app/teacher/multi/actions.ts` | Server actions: `createMultiGame`, `joinMultiGame`, `leaveMultiGame`, `uploadMultiPhoto`, `deleteMultiPhoto`, `startMultiGame`, `deleteMultiGame`. |
| `multi-page.tsx` | `src/app/teacher/multi/page.tsx` | Server component: authenticates teacher, fetches games/participants/photos, renders TopNav + `MultiClient`. |
| `multi-client.tsx` | `src/app/teacher/multi/multi-client.tsx` | Client component: My Games (expandable cards with photo upload), Available Games (join), Create Game form (topic, rounds, timing). Matches existing warm-tone style. |

**No changes needed:**

| File | Why |
|------|-----|
| `page_p_t_id.tsx` (`src/app/play/[teacherId]/page.tsx`) | Session 97 already removed multi-teacher branching. Only uses `loadTeacherDeck` + class-scoped loading. |

---

## Multi-Teacher Game Design — Status Assessment

The Multi-Teacher Game Design document describes an 8-phase build sequence with 8 new database tables. Here's where we stand:

### What's been built (Phases 1–2, partial)

**Phase 1 — Foundation (partial):** The wrong-model cleanup is complete (rotation queue UI removed from admin, deck.ts cleaned). The migration `20260719000000_multi_teacher_games.sql` creates 3 of the 8 planned tables:
- `multi_teacher_games` — the game event (maps to design doc's `multi_games`)
- `multi_teacher_participants` — teachers in a game (maps to `multi_game_teachers`)
- `multi_teacher_photos` — photo submissions (maps to `multi_game_photos`)

**Missing from Phase 1:** 5 tables from the design doc are NOT yet created:
- `multi_game_rounds` — per-round configuration (topics, timing, status)
- `multi_game_round_avatars` — avatar assignments per photo per round
- `multi_game_students` — students who joined the event
- `multi_game_votes` — student votes per round (ranked 1st/2nd/3rd)
- `multi_game_comments` — private comments on photos

The `teacher_rotation` table has not been dropped yet — nothing references it, but it's still in the DB.

**Phase 2 — Teacher Lobby (done):** Teachers can visit `/teacher/multi`, create games, join other teachers' games, upload photos, and start games. The current game lifecycle is simplified: `forming → ready → active → complete`. The design doc specifies: `created → open → active → reveal → complete → replay`.

**Current limitations vs. design spec:**
- No per-round structure (topics, timing, deadlines per round)
- No round-based photo submission (photos aren't tied to specific rounds yet)
- No avatar rotation system
- No student-facing play page
- No voting mechanic
- No reveal ceremony
- No waiting list / teacher substitution
- No auto-start or auto-archive

### What comes next (Phases 3–8)

**Phase 3 — Teacher Game Detail (next priority).** Build `/teacher/multi/[gameId]` — the teacher's view of a game they're participating in. Round tabs, per-round photo upload (3 photos per round per teacher), round status timeline. Requires expanding the migration to add `multi_game_rounds`. This is the natural next step since the lobby already exists.

**Phase 4 — Browse Page + Student Entry.** Add multi-teacher game cards to the `/play` browse page alongside regular class listings. Build `/play/multi/[gameId]` — the student play page with 3×3 grid, rotating monster avatars, and ranked voting (pick 1st/2nd/3rd). Requires `multi_game_students` and `multi_game_votes` tables.

**Phase 5 — Private Comments + Teacher Feedback.** Students comment on photos privately. Teachers reply. Teachers can flag students. Teachers can comment on peer teachers' photos. Requires `multi_game_comments` table.

**Phase 6 — Reveal Ceremony.** The personalized reveal: each student sees their own top 3 teachers based on accumulated votes across all rounds. Avatar-to-profile flip animation. Summary page with teacher profiles and class links.

**Phase 7 — Game Lifecycle Management.** Auto-start (when 3 teachers upload all round-1 photos), auto-archive (unfilled games expire), teacher substitution (waiting list fills dropped spots), game replay (next 3 waiting teachers reuse topics/schedule).

**Phase 8 — Polish + Teacher Stats.** Engagement metrics (vote counts, comment counts, top-3 rankings), game history, notifications.

### Recommended next session focus

1. **Expand the migration** — add `multi_game_rounds` table, add `round_id` FK to `multi_teacher_photos`, add round-level columns (topic, opens_at, closes_at, photo_deadline, status).
2. **Build Phase 3** — the game detail page at `/teacher/multi/[gameId]` with round tabs and per-round photo upload.
3. **Test the existing lobby** — verify `/teacher/multi` renders, game creation works, join/leave works, photo upload works.

---

## Deployment order

1. Run migration: `20260719000000_multi_teacher_games.sql`
2. Drop in all 8 replacement/new files
3. The `teacher_rotation` table can be dropped whenever convenient — nothing references it anymore

---

## Architecture decisions

- **Admin retains oversight** — not interference. Class request approval is oversight. Coordination thread is a shared communication channel.
- **No mode switching** — the dashboard always renders. Teachers self-organize via `/teacher/multi`.
- **Game lifecycle**: forming → ready → active → complete. Creator starts game when ≥3 participants each have ≥1 round-1 photo.
- **Photo storage**: `teacher-deck` bucket, path `multi/{gameId}/{teacherId}/{timestamp}.ext`
- **Multi-teacher games are separate from regular class games.** Teachers are the content creators across all rounds. Students vote and comment but never upload. Teacher identity is hidden behind rotating monster avatars during play and revealed at the end.

---

## Git commit messages

The screenshot shows 18 changed files. Here are the commit messages organized by logical grouping. Mike can commit all at once or in groups:

**Option A — Single commit (all 18 files):**

```
Multi-teacher game system: cleanup wrong model + build teacher lobby

- Remove shared-photo-pot model from admin (actions, admin-client, page)
- Clean deck.ts: remove loadMultiTeacherDeck, keep loadTeacherDeck only
- Add multi-teacher game tables (games, participants, photos)
- Add teacher lobby at /teacher/multi (page, client, actions)
- Add "Multi" link to teacher TopNav
- Extract ClassRequestsSection in admin, rename Recruitment→Teachers tab
- Admin dashboard always renders (no mode gate)
```

**Option B — Two commits (cleanup first, then new feature):**

Commit 1:
```
Remove wrong multi-teacher model (shared photo pot)

- deck.ts: remove loadMultiTeacherDeck, getActiveRotationTeacherIds, getAppMode
- admin/actions.ts: remove rotation actions (add/remove/set/move/updateAppMode)
- admin-client.tsx: remove rotation queue UI, StandardModeLanding, "In rotation" stat
- admin/page.tsx: remove rotation query, mode gate; dashboard always renders
```

Commit 2:
```
Add multi-teacher game system — teacher lobby + foundation

- Migration: multi_teacher_games, multi_teacher_participants, multi_teacher_photos
- Server actions: create/join/leave game, upload/delete photo, start/delete game
- Teacher lobby UI at /teacher/multi with create, join, photo upload
- Add "Multi" link to teacher TopNav (Class | Deck | Multi | Profile)
```

---

## Pending items (carried forward)

- [ ] **Phase 3: Game detail page** — `/teacher/multi/[gameId]` with round tabs, per-round photo upload
- [ ] **Expand migration** — add `multi_game_rounds`, `multi_game_round_avatars`, `multi_game_students`, `multi_game_votes`, `multi_game_comments` tables
- [ ] **Drop `teacher_rotation` table** — nothing references it anymore
- [ ] Student continuation flow — "Continue with this teacher" CTA on awards ceremony
- [ ] `enrollStudent` in `src/app/play/actions.ts` still uses hardcoded `class_id` — needs to find class at right level with room
- [ ] Browse page testing — do teacher cards render? Do level buttons link?
- [ ] Teacher profile editor testing — does form save? Does is_public toggle?
- [ ] Public teacher profile testing — does `/teachers/[id]` render?
- [ ] Admin cleanup testing — does simplified admin dashboard render?
- [ ] Class header label testing — "Student rounds", "Round time", "Play time"
- [ ] Deck page testing — is "Your name" gone?
- [ ] Multi-teacher games eventually added to browse/marketplace page (Phase 4)
- [ ] Admin page could gain read-only oversight of multi-teacher games (future)

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
- **Browse page:** `/play` shows teacher cards with level buttons, links to profiles
- **Teacher profiles:** `/teacher/profile` editor, `/teachers/[id]` public profile
- **Messaging:** Teacher ↔ student messages
- **Admin dashboard:** Simplified — Teachers tab, class requests, game topics, overview stats. No rotation queue.
- **Multi-teacher lobby (NEW):** `/teacher/multi` — create, join, leave games. Upload photos. Start games.

### What's built but dormant

- Multi-teacher game tables exist but no student-facing play page yet
- `teacher_rotation` table still in DB, unreferenced
- `class_requests` table still in DB
- Mode selection columns on entries (`selected_solo`, `selected_trio`, `selected_full`) still in DB

### What needs to be built

**Priority 1: Complete multi-teacher game system (Phases 3–8 of design doc)**
See "What comes next" section above for the full breakdown.

**Priority 2: Fix enrollment routing**
`enrollStudent` in `play/actions.ts` needs to find a class at the right level with room (instead of hardcoded `class_id`).

**Priority 3: Student continuation between games**
"Continue with this teacher" CTA on awards/results page. Find or create next class at same/higher level.

**Priority 4: Mobile responsiveness pass**
Teacher dashboard, deck page, student dashboard, game engine.

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
| S94-deck | 94 | Deck page per-class organization, class creation with level |
| S95-profiles | 95 | Teacher profiles, browse page, public profile pages |
| S96-labels | 96 | Class header relabeling, deck "Your name" removal |
| S98-cleanup | 98 | Wrong multi-teacher model removal (shared photo pot) |
| S98-multi | 98 | Multi-teacher game foundation: migration, lobby, actions |

---

## Migrations to run (cumulative, in order)

Run these in the Supabase SQL editor:

1. `migration-session67.sql` — Dual-role + settings
2. `20260625140000_b59_game_sessions_unique.sql` — Session unique constraint
3. `20260702130000_teacher_archiving.sql` — Archiving support
4. `20260703000000_auth_user_lookup_rpc.sql` — Auth-lookup RPC
5. `20260717200000_migration_session93_levels.sql` — Level columns + recruiting flags
6. `20260718060000_round_prompts.sql` — Per-round prompts
7. `20260718120000_teacher_profiles.sql` — Profile browse columns
8. **`20260719000000_multi_teacher_games.sql`** — Multi-teacher game tables (games, participants, photos)

---

## File map (what lives where)

### Game engine (src/game/)
- `shell.jsx` — GameShell wrapper, RoundSplash countdown
- `spotlight.jsx` — Main game: StageGrid, ReviewGrid, shuffle/stop, enrollment. Monster card integration
- `students.js` — Static sample data (fallback when no DB)
- `monsters.jsx` — 9 monster SVGs + `padWithMonsters()` helper

### Play route (src/app/play/)
- `page.tsx` — Browse page: teacher cards with level buttons, "Are you a teacher?" CTA
- `[teacherId]/page.tsx` — Per-teacher warmup. Accepts `?level=beginner|intermediate|advanced`. Loads deck, renders game or fallback.
- `actions.ts` — `enrollStudent`, `saveStudentRound`, `addEntry`, `removeEntry`, `findFirstAvailableRound`. **⚠️ Needs update:** `enrollStudent` still resolves class from favorite entry's `class_id` — should find a class at the right level with room instead.

### Student routes (src/app/student/)
- `dashboard/page.tsx` — Student dashboard with phase indicator
- `play/page.tsx` — Student game route with submissions-closed gate
- `results/page.tsx` — Awards ceremony gate (blocks until comments approved)
- `results/ResultsCeremony.tsx` — Animated awards reveal with monster mascots. **Future:** Add "Continue with this teacher" CTA here.

### Teacher routes (src/app/teacher/)
- `students/page.tsx` — Class roster, round management, TopNav: `Class | Deck | Multi | Profile`
- `students/class-header.tsx` — Class header with "Student rounds", "Round time", "Play time" labels
- `students/request-class.tsx` — Direct class creation with level picker
- `students/actions.ts` — Approve/reject, auto-advance trigger, `createClassDirect`
- `deck/page.tsx` — Per-class photo management organized by level
- `deck/deck-client.tsx` — Level-aware photo upload, recruiting toggle, warmup title/prompt
- `deck/actions.ts` — `uploadStarter`, `toggleInWarmup`, `toggleRecruiting`, `deleteStarter`, etc.
- `profile/page.tsx` — Teacher profile editor (bio, teaching style, public toggle)
- **`multi/page.tsx`** — **SESSION 98 (NEW):** Multi-teacher game lobby server component
- **`multi/multi-client.tsx`** — **SESSION 98 (NEW):** Lobby client: My Games, Available Games, Create Game
- **`multi/actions.ts`** — **SESSION 98 (NEW):** `createMultiGame`, `joinMultiGame`, `leaveMultiGame`, `uploadMultiPhoto`, `deleteMultiPhoto`, `startMultiGame`, `deleteMultiGame`

### Public teacher routes
- `teachers/[id]/page.tsx` — Public teacher profile (bio, teaching style, class listings)

### Admin route (src/app/admin/)
- `page.tsx` — **SESSION 98:** Simplified. Dashboard always renders (no mode gate).
- `admin-client.tsx` — **SESSION 98:** Teachers tab (was Recruitment), ClassRequestsSection, game topics, overview stats. No rotation queue.
- `actions.ts` — **SESSION 98:** Cleaned. No rotation actions. `postScheduleMessage` messages all teachers.

### Shared libs (src/lib/)
- `deck.ts` — **SESSION 98:** Clean solo loader. `loadTeacherDeck(teacherId, level?)`. No rotation queue, no mode columns.
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
1. `all-in-one-setup-v9.sql`
2. `seed-teachers-v1.sql`
3. `populate-seed-voter-sessions.sql`
4. Pick a jump-to or fast-path

### Browser setup
- Main window → myked70 (student)
- InPrivate → getgroovr (teacher/admin) OR anonymous `/play/[teacherId]`

---

## Parked items

- **Teacher avatar/monster personality system** — fun idea, no current home. Could return as a teacher profile flair feature.
- **Teacher awards ceremony** — shelved with old multi-teacher competition model; may be revived for multi-teacher game reveal.
- **Teacherhood ladder** (student winner → teacher candidate) — interesting growth concept, far future.
- **Chunk H fix** (teacher `suggestTopic` hardcodes `status: "approved"`) — irrelevant in standard mode where topics are managed directly.
- **Open enrollment (Chunk OE)** — superseded by Front Door concept.
- **Mode selection columns** (`selected_solo`, `selected_trio`, `selected_full` on entries) — still in DB, no longer read by any code. Can be dropped in a future cleanup migration.
- **`teacher_rotation` table** — still in DB, no longer queried. Can be dropped when convenient.
- **`class_requests` table** — still in DB, used only by admin ClassRequestsSection.
- **`switch-mode-footer.tsx`** — still in repo, no longer imported. Can be deleted.
- **`request-actions.ts`** — contains `requestNewClass` and `saveModePreferences`, no longer imported. Can be deleted.
