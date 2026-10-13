# Session 107 Handoff
**Date:** 2026-07-28
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

### 1. Teaching & Learning Styles Research

Produced a 6-page Word document (`Teaching-Learning-Styles-ESL-Research.docx`) covering learning style theories (VARK, Kolb, Gardner, Felder-Silverman), teaching style frameworks (Grasha-Riechmann), the meshing hypothesis debate, personality correlations (Big Five, MBTI), culture/race and ESL learning styles (Reid 1987, Hofstede's dimensions), ESL methods mapped to learning styles (TPR, CLT, TBL, Grammar-Translation, Direct Method, Suggestopedia), Krashen's hypotheses, Oxford's SILL, and application to Mike's ESL-through-architecture model. Includes full references. Saved to project folder.

### 2. SQL Setup Script v10 — Bugfix

**File:** `sql/all-in-one-setup-v10.sql` (replaces v9)

Fixed Phase 8 crash: `ERROR: 22023: argument 1: key must not be null`

- **`favorites` subquery** — `jsonb_build_object(NULL, true)` crashed when no starter entries existed with `status='live'`. Wrapped in `CASE WHEN EXISTS(...)` guard, falls back to `'{}'::jsonb`.
- **`comments` subquery** — `jsonb_object_agg` returned NULL on zero rows. Wrapped in `COALESCE(..., '{}'::jsonb)`.

### 3. Auth & Signup Fixes

**Signup page restyled** — `src/app/auth/signup/page.tsx`
- Purple gradient replaced with tan/cream palette matching login page (same `C` color constants, Outfit font, card layout, input styling)
- "I'm 18 or older and accept the house rules" → "I confirm I'm 18 or older"
- Post-signup redirect: `/dashboard` (404) → `/` (root handles routing)
- Email confirmation screen also restyled to match

**Email confirmation disabled** in Supabase dashboard (Authentication → Sign In / Providers → Confirm email OFF) for testing.

**User account reset:** Existing `myked70@yahoo.com` was stuck with unconfirmed email. Deleted via cascading DO block (children first: teacher_comments → game_sessions → entries → enrollments → students → profiles → auth.users). Re-registered cleanly.

### 4. Finish Joining Form Fixes

**File:** `src/app/student/dashboard/FinishJoiningForm.tsx`
- "Your name" → "Your full name — only your teacher sees this" (placeholder: "First and last name")
- "Screen name" → "Screen name — what your classmates see" (placeholder: "Your first name or a nickname")
- Self-photo/avatar field (`PhotoField` with label "A photo of yourself — required — this is your avatar in the game") **removed entirely**. Students don't have avatars.

### 5. Student Play Page Messaging

**File:** `src/app/student/play/page.tsx`
- "You're not in a class yet" → "Almost there!" with message: "Your profile is set up — now upload your first photo from your dashboard."
- "Nothing to play yet" → "Upload your first photo"
- "Hang tight!" → "Waiting for the class to start"
- All three states now show a "Go to your dashboard →" button (previously only game-not-started had one)

---

## Bugs Found During Testing (Not Yet Fixed)

### BUG: "Go to the game" → "no-class" for real users

**Root cause:** `loadClassDeck()` in `class-deck.ts` line 84 looks up `profiles.class_id`. For real users (not seed voters), `profiles.class_id` is never set — nobody writes it. `enrollStudent` creates a row in the `enrollments` table but doesn't touch `profiles.class_id`. `saveProfile` reads from `profiles.class_id` (with an enrollments fallback) but never writes it.

**Quick fix (apply immediately):** In `class-deck.ts`, after the `profiles.class_id` check fails, fall back to the enrollments table:

```
// After line 89: const classId = profile?.class_id ?? null;
// Add enrollments fallback before the no-class return:
if (!classId && user.email) {
  // Fall back to enrollments table
  const { data: studentRow } = await admin
    .from("students")
    .select("id")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  if (studentRow) {
    const { data: enrollment } = await admin
      .from("enrollments")
      .select("class_id")
      .eq("student_id", studentRow.id)
      .eq("status", "active")
      .maybeSingle();
    classId = enrollment?.class_id ?? null;
  }
}
```

**Permanent fix:** Part of the enrollment flow redesign below.

### BUG: `saveProfile` still requires self-photo server-side

The `FinishJoiningForm` UI no longer shows the photo field, but `saveProfile` in `actions.ts` lines 644-649 still hard-fails if no photo is uploaded:
```
if (!(photo instanceof File) || photo.size === 0) {
  return { ok: false, error: "Please upload a photo..." };
}
```
**Fix needed:** Remove the photo requirement from `saveProfile` (make it optional/skip if not provided). The photo upload + entry creation should move to a separate action as part of the enrollment flow redesign.

---

## What Comes Next — Enrollment Flow Redesign

### Problem Statement

The current "Finish joining" form asks for too much at once (name, screen name, self-photo, favorite comment, first photo + description) and creates the enrollment at the wrong time. Students who complete their profile but bail before uploading a photo still take up a roster spot. The `profiles.class_id` and `enrollments` table are out of sync. The play page can't find the class for real users.

Mike's directive: "Until they've uploaded a pic, I don't even think they should take up a spot."

### Revised Flow (Mike-approved sequencing)

**Phase 1 — Browse & Discover** (`/play`)
Teacher cards show real details: round count, time commitment, current class size, when it starts. Message at top: "Play a free warmup round to see how it works, then join a class."

**Phase 2 — Warmup** (no account needed)
Before the grid: "This is the warmup round — your teacher picked these photos for you to practice with. Once you join, you'll see photos from your classmates and get feedback from your teacher."
Student plays warmup. At the end, email/signup gate.

**Phase 3 — Account + Profile** (lightweight, no enrollment)
After signup/login: just full name + screen name. Two fields, one button. Warmup session data attached. **No enrollment row created yet.** No photo upload.

**Phase 4 — Upload First Photo** (THIS creates the enrollment)
Form transitions immediately (same page, state change) to photo upload + description + favorite comment. On submit: enrollment row created, entry row created at round 1, `profiles.class_id` set, favorite comment written to game_session. **This is when the student "exists" in the class.**

**Phase 5 — Dashboard**
Student sees their entry (pending approval), warmup history, class info. "Go to the game" works because `profiles.class_id` is now set.

### Code Changes Required

1. **`FinishJoiningForm.tsx`** — Split into `ProfileForm` (name + screen name) and `PhotoUploadForm` (photo + description + favorite comment). Parent component manages step state.

2. **`saveProfile` in `actions.ts`** — Split into two server actions:
   - `saveProfileInfo`: Just saves `students.name` + `students.screen_name`. No photo, no entry, no enrollment.
   - `saveFirstEntry`: Photo upload + entry insert + enrollment creation + set `profiles.class_id` + favorite comment on game_session. Takes over enrollment-creation responsibility from `enrollStudent` for the profile-completion path.

3. **`loadClassDeck` in `class-deck.ts`** — Add enrollments fallback for `class_id` lookup (immediate bugfix, also works post-refactor).

4. **`/play` browse page** — Add class detail fields to teacher cards (round count, time commitment, class size, start date). Requires reading `total_rounds`, `round_duration_hours`, `game_starts_at` from `classes` table in the browse page query.

5. **Dashboard `isComplete` check** (`page_ss_dash.tsx` line 759) — Currently: `!!(student.name && student.screen_name && newest?.favoriteComment)`. Split into two checks:
   - Profile complete: `!!(student.name && student.screen_name)`
   - Enrolled: check for active enrollment / entry existence
   - Dashboard renders the appropriate step form based on which is incomplete.

6. **`saveProfile` photo requirement removal** — Lines 638-649 of `actions.ts` hard-fail without a self-photo. Must be made optional or removed entirely since the avatar field was removed from the form.

### Key Files to Request

When implementing, request these files:
- `src/app/student/dashboard/FinishJoiningForm.tsx` — to split into two components
- `src/app/student/dashboard/page.tsx` — to update the `isComplete` logic and render the two-step form
- `src/app/play/actions.ts` — to split `saveProfile` into `saveProfileInfo` + `saveFirstEntry`
- `src/lib/class-deck.ts` — to add enrollments fallback
- `src/app/play/page.tsx` — to add class details to teacher cards

---

## Multi-Teacher Game Build — COMPLETE ✅

All 8 phases are shipped. The multi-teacher game feature is done.

### Remaining Cleanup Items

- [ ] Admin page could gain read-only oversight of multi-teacher games (future)
- [ ] Delete dormant files: `switch-mode-footer.tsx`, `request-actions.ts` (no longer imported)

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
| 6 | Reveal Ceremony — personalized two-layer reveal per student | ✅ Done |
| 7 | Lifecycle — waiting list, drop out, auto-archive, game completion, replay | ✅ Done (Session 106) |
| 8 | Polish — engagement stats, game history, per-teacher breakdowns | ✅ Done (Session 106) |

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

---

## The App as It Stands Now

### What works today

- **Auth:** Magic link login, password login, role-based routing (student/teacher). Signup page restyled to match login (Session 107).
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
- **Multi-teacher lobby:** `/teacher/multi` — create, join, leave games. Upload photos. Start games. "Manage →" links to game detail. Max-width 720px layout. Game history section for completed games (Session 106). Auto-archive of stale forming games on page load (Session 106).
- **Multi-teacher game detail:** `/teacher/multi/[gameId]` — max-width 720px layout (Session 104), round tabs, avatar spinner gate, per-round photo upload (3 per teacher), avatar badge with expandable profile, collapsible topic editing, readiness tracking, start game controls. Comment review inbox (Session 105). Game stats section with per-teacher vote tallies, medal rankings (Session 106). Complete game, replay, and drop out controls (Session 106). Waiting list display (Session 106).
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
- `signup/page.tsx` — Session 107: restyled to tan/cream palette, removed house rules, 18+ only checkbox, redirect fix (/ not /dashboard).
- `login/page.tsx` — Session 89: tan/cream palette.
- `callback/route.ts` — Auth callback handler.

### Teacher routes (src/app/teacher/)
- `students/page.tsx` — Class roster, round management. TopNav: `Class | Deck | Profile`. "Multi-Mode →" button.
- `students/class-header.tsx` — Class header with "Student rounds", "Round time", "Play time" labels
- `students/request-class.tsx` — Direct class creation with level picker
- `students/actions.ts` — Approve/reject, auto-advance trigger, `createClassDirect`
- `deck/page.tsx` — Per-class photo management organized by level
- `deck/deck-client.tsx` — Level-aware photo upload, recruiting toggle, warmup title/prompt.
- `deck/actions.ts` — `uploadStarter`, `toggleInWarmup`, `toggleRecruiting`, `deleteStarter`, etc.
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
- `class-deck.ts` — In-class deck loader with submissions-closed gate. **BUG: profiles.class_id fallback missing (see Bugs section).**
- `round-timing.ts` — Round computation + phase helpers
- `student-archive.ts` — Student data with phase timing
- `game-results.ts` — Awards/ranking computation
- `multi-game-lifecycle.ts` — `checkAutoArchive`, `promoteWaiter`, `countActiveParticipants`, `buildReplayGame`
- `multi-game-stats.ts` — `getGameStats`
- `supabase-server.ts` — SSR Supabase client
- `supabase-client.ts` — Browser Supabase client
- `message-actions.ts` — Shared message send/read actions

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

---

## Parked Items

- **Teacher avatar/monster personality system** — fun idea, could return as teacher profile flair.
- **Teacher awards ceremony** — shelved; may revive for multi-teacher game reveal (Phase 6).
- **Teacherhood ladder** (student winner → teacher candidate) — interesting growth concept, far future.
- **Open enrollment (Chunk OE)** — superseded by Front Door concept.
- **Teaching & Learning Styles research** — Word doc created Session 107, saved to project folder.
