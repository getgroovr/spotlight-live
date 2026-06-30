# SESSION 61 HANDOFF — 6/25/2026

- **READ THIS HANDOFF before doing anything.** Always.
- **First action:** Review "NEXT SESSION" section for the suggested flow.

---

## Mike's preferences — INCLUDE THIS SECTION VERBATIM IN ALL SUBSEQUENT HANDOFFS

1. **Full-file replacements, NOT patches.** Output the entire new file. Mike does not apply line-by-line edits.
2. **PowerShell and SQL commands only.** Mike's machine is Windows. No grep, bash, sed, curl. Use `Select-String` for grep, etc.
3. **Anything beyond PS/SQL needs explicit direction.** Spell out every step.
4. **Don't start coding without seeing the existing files.** Ask Mike to upload before writing replacements.
5. **Ask before assuming on design questions.** Mike has strong opinions.
6. **Flag what's deferred and why.**
7. **Admit when wrong; correct prior handoffs.**
8. **Concise is good. Over-formatting is not.**
9. **Tighten layouts.** Compact, side-by-side field arrangements.
10. **Label editability clearly.**
11. **Use "See the round" / "Close the round" toggle buttons** on all collapsible round sections.
12. **"Spreadsheet" not "CSV" in user-facing text.**
13. **Verify all NOT NULL columns and FK chains BEFORE writing an INSERT.**
14. **Workflow: request files in chunks Claude can complete independently.** 2–3 chunks per chat before next handoff.
15. **Use full destination paths when referencing files.** Don't make Mike guess which directory a file goes in.
16. **Group all confirmation / direction / testing questions at the END of a task block.** Don't stall with single questions mid-flow — batch them so Mike can answer all at once and provide testing feedback on a larger set of modifications.
17. **Fun matters.** Boxing ring countdown, confetti, balloons — the game should feel like a celebration at every transition.
18. **Lock things down after submission.** Once a student uploads, they're done. No going back to re-pick favorites.
19. **Voting rules must be meaningful.** No single-vote winners. Competition ranking for ties.
20. **Photo architecture needs a real solution.** Folder-per-game, not flat. Solve alongside multi-teacher.
21. **Break big work into file-based chunks.** Each session = specific files + specific tasks. Handoff drives the work.

---

## KEY CONCEPT: Warm-up Round vs Student Rounds — REREAD EVERY CHAT

**The Teacher's Warm-up Round is NOT "Round 1" and NOT "Student Round 0."** It is a fundamentally different thing:

- The teacher fills the warm-up round with content BEFORE the game begins.
- It serves as the **recruiting tool** — the teacher sends the class link, prospective students play through the warm-up to join.
- Students join the class BY playing the warm-up round.
- Warm-up entries have `is_starter = true`. Student entries have `is_starter = false`.
- The warm-up deck (teacher-deck PUBLIC bucket) and student round decks (media PRIVATE bucket) are completely separate — different sources, different ownership, different storage buckets.

**DB constraint (in place):**
```sql
CREATE UNIQUE INDEX entries_one_live_per_student_class_round
ON entries (student_id, class_id, round_number)
WHERE status = 'live' AND is_starter = false;
```

**Naming convention (locked in #40):**
- Student-facing UI: "Teacher's Warm-up Round" + "Student Round 1, 2, 3 …"
- Teacher-facing UI: "Warm-up Round" + "Round 1, 2, 3 …"

---

## KEY CONCEPT: Round Timing / Gaps

**There must be a time gap between rounds.** The flow is NOT "round ends → next round starts immediately." It is:

1. Round N ends (timer expires or teacher closes it)
2. **Review gap** — teacher reviews submissions + comments, students wait
3. Round N+1 starts automatically after the gap

After Round 3 (final round):
1. Round 3 ends
2. **"Setting up for the party"** gap — students see "Come back soon to see who got the most favorites!" (B58 placeholder now in place)
3. Teacher reviews final favorite comments
4. Results unlock once all pending comments are approved (same gate as mid-game rounds, but for comments not pics)

**Review gap is built into round duration (clarified session 60):**
The teacher sets TWO numbers: `round_duration_hours` and `review_time_hours`. The student's effective time = `round_duration - review_time`. Example: 24h round with 1h review → students see "23 hours to complete this round." The review window is the tail end of each round.

- Teacher sets: 24h round duration, 1h review time
- Student sees: "Round ends in 23h" / "Next round starts in 24h"
- Teacher sees: "Student submissions close in 23h, review window opens, next round at 24h"
- The review time is adjustable per class — some teachers need 30 min, others need 2 hours

**This requires:**
- New column: `classes.review_time_hours` (or on `games` — TBD, wherever round settings live)
- Student-facing timers show `round_duration - review_time` as their deadline
- Teacher-facing timers show the full duration + when review opens
- `loadClassDeck` and round-timing helpers need to account for the submission cutoff vs round boundary

**For results / awards round:**
Students can't see each other's favorite comments until the teacher approves them. The results page stays locked until all pending `favorite_comment_status` items from the final round are approved. No separate "release results" button needed — the existing approval flow IS the gate.

This is a design/UX task that touches multiple files. The data layer work in session 61 should be aware of it but the full timer UI is deferred.

---

## KEY CONCEPT: Multi-Class (clarified session 60)

**Multi-class means: one teacher, multiple classes, each with one game.**

- A teacher can have several classes (the class selector in the teacher dashboard already supports this).
- Each class runs ONE game at a time. The `games` table tracks the lifecycle per class.
- Classes are independent — each has its own settings: round count, round duration, start time. One class might have 2-hour rounds, another 24-hour rounds, another weekly rounds.
- The teacher staggers classes so they can manage feedback for one before moving to the next.
- Games end naturally when the last round's timer expires. Archive can happen automatically.
- If a teacher wants to run a second game in the same class later, the old game is archived and a new game is created. (This is the "multi-game" edge case, not the primary flow.)

**What this means for the data layer:**
- Every query must filter by `game_id` (not just `class_id`) so data from a previous game doesn't bleed into the current one.
- The `active_game_id(class_id)` DB helper function already exists for this.
- Writes (entries, game_sessions) must set `game_id` on insert.

**What this means for the teacher UI:**
- The class selector already works. The teacher toggles between classes.
- Each class's header shows the current game's status and settings.
- Game lifecycle: setup → active → complete → archived. Auto-complete when `isGameOver()` is true. Auto-archive is fine too.
- "Start game" should be easy — can happen as soon as all warm-up pics are approved.
- No separate "release results" button. Results unlock when the teacher approves all pending favorite comments from the final round. The existing approval queue IS the gate.
- Future rounds don't open until the teacher approves all pending pics for the current round. Same pattern extends to the awards round but for comments instead of pics.

---

## What got done this session (60)

### Chunk A (prior chat): B59 + B57
- **B59:** `game_sessions` UNIQUE constraint on `(student_id, class_id, round)` — prevents duplicate sessions that inflated vote counts
- **B57:** Splash page between rounds fixed in `shell.jsx` — `showSplash` sessionStorage tracking restored after hydration fix

### Chunk B (this chat): B56 + B58 + B55

| File | Destination | What changed |
|---|---|---|
| `spotlight.jsx` | `src/game/spotlight.jsx` | B58: last-round celebration → "Setting up for the party!" holding state instead of linking to results. B55: "Skip — back to your dashboard" escape link on upload step + graceful handling of "entry already exists" errors during replay. |
| `actions.ts` | `src/app/play/actions.ts` | B56: `saveStudentRound` now extracts the favorite entry's comment and writes it to `favorite_comment` with `favorite_comment_status = 'pending'`. Mirrors the warm-up path in `saveProfile`. Teacher review queue will now show student-round favorites. |

### Chunk C (prior chat): Testing walkthrough v10
- Updated SQL file references to v4
- Updated step descriptions to match current flow
- Added round gap concept notes

---

## Open bugs (UPDATED)

| # | Description | Priority | Status |
|---|---|---|---|
| B41 | No photo preview in teacher's review card for picture submittals | MEDIUM | Open |
| B48 | Lock favorites after next-round photo upload — remove editing, full-screen celebration | HIGH | Open |
| B49 | Comment editing rules — non-favorites editable until round close, favorite locks on submit | MEDIUM | Open |
| B54 | Completed round section on dashboard should collapse/minimize once student uploads next-round photo. Current round should be prominent, completed rounds tucked away. | LOW | Open |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |
| LATENT | Visitor deck.ts missing `id` projection bug | LOW | Open |

### Closed this session (60)
| # | Description | Closed |
|---|---|---|
| B59 | game_sessions UNIQUE constraint (duplicate sessions / inflated votes) | Session 60 |
| B57 | Splash page between rounds missing | Session 60 |
| B56 | Favorite comment not showing in teacher review queue | Session 60 |
| B58 | Round 3 end → party gap placeholder | Session 60 |
| B55 | Replay stuck on upload screen / back to dashboard | Session 60 |

---

## Ideas list

1. **Admin dashboard** — admin limits how many classes a teacher can create; system oversight
2. **Student → teacher messaging** — button in student profile to message the teacher
3. **Student → admin messaging** — separate button to message the admin/support
4. **Auto-class-creation** — when class hits 9 students, system auto-creates next class (teacher sets desired count)
5. **Teacher sets desired number of classes** — "I want 4 classes" → system creates 4, fills sequentially
6. **Deployment/hosting setup guide** — Vercel + Supabase + custom domain walkthrough
7. **Round gap timing UI** — student-facing countdown showing submission deadline vs round boundary; teacher-facing review window indicator. Schema (`review_time_hours`) lands in session 61; UI deferred to session 63.
8. **"Party setup" holding page** — after final round, students see countdown to results reveal (B58 placeholder now in place; full unlock = all final-round favorites approved)
9. **Cosmetic: student-round favorite comment card** — teacher review card shows same text in "Comment on pic" and "Why it's my favorite" for student rounds (different data in warm-up rounds). Could suppress one for student rounds.

---

## NEXT SESSION (61): Data Layer + Teacher Game Lifecycle

Mike will run a full testing walkthrough before starting. Session 60 fixes may surface new issues — reserve chunk 3 for those.

### Priority order
1. Data layer: thread `game_id` through all queries and writes
2. Teacher game lifecycle: start/end controls, automatic completion
3. Walkthrough bugs + testing doc update

---

### Chunk 1: Data layer — game_id awareness

**Files needed:**
1. This handoff
2. `src/lib/class-deck.ts` — loads the deck for `/student/play`
3. `src/lib/game-results.ts` — loads results for `/student/results`
4. `src/lib/student-archive.ts` — loads dashboard data
5. `src/app/play/actions.ts` — enrollment + round save + entry management

**Tasks:**

1. **Small migration: `review_time_hours` + `games.started_at`**
   - Add `classes.review_time_hours` (numeric, nullable, default 1). Or put it on `games` if round settings should be per-game rather than per-class — decide based on what's simplest.
   - Add `games.started_at` (timestamptz, nullable) — set when teacher starts the game. Keeps timing on the game row so a second game in the same class gets its own start time.
   - Update `active_game_id()` if needed.

2. **Add `resolveActiveGame(classId)` helper** (new file `src/lib/game-helpers.ts`). Uses the existing `active_game_id(class_id)` DB function or replicates: `SELECT id FROM games WHERE class_id = $1 AND status != 'archived' LIMIT 1`. Returns the active game's UUID or null.

3. **`loadClassDeck()`** — filter entries by `game_id`:
   - Resolve the active game for the student's class
   - Add `.eq("game_id", gameId)` to the entries query
   - Pass `game_id` to downstream deck-building so only current-game photos appear
   - If no active game → return `reason: "game-not-started"`

4. **`getGameResults()`** — filter sessions by `game_id`:
   - Resolve active (or most recent complete) game for the class
   - Add `.eq("game_id", gameId)` to game_sessions queries
   - **Results gate:** check if any `favorite_comment_status = 'pending'` exists for the final round of this game. If yes, return a "results-not-ready" state instead of the results data.

5. **`getStudentArchive()`** — filter entries + sessions by `game_id`:
   - Own entries filtered by `game_id`
   - Round sessions filtered by `game_id`
   - "Current class" data scoped to the active game

6. **`enrollStudent()`** — set `game_id` on new game_sessions:
   - Resolve active game for the class the student is joining
   - Include `game_id` in the `game_sessions.insert()` call

7. **`saveStudentRound()`** — set `game_id` on new/updated sessions:
   - Resolve active game
   - Include `game_id` in insert; verify `game_id` matches on update

8. **`addEntry()`** — set `game_id` on new entries + **photo folder scoping**:
   - Resolve active game for the student's class
   - Include `game_id` in the `entries.insert()` call
   - **Change storage path** from `media/{class_id}/{user_id}-{timestamp}.ext` to `media/{game_id}/{user_id}-{timestamp}.ext` so photos are scoped per game from day one (pref #20)

**Deliverables:**
- Migration SQL: `review_time_hours` column + `games.started_at` column
- `src/lib/game-helpers.ts` (new — shared `resolveActiveGame`)
- Updated `src/lib/class-deck.ts`
- Updated `src/lib/game-results.ts`
- Updated `src/lib/student-archive.ts`
- Updated `src/app/play/actions.ts`

---

### Chunk 2: Teacher game lifecycle

**Files needed:**
1. This handoff
2. `src/app/teacher/students/page.tsx` — teacher dashboard
3. `src/app/teacher/students/class-header.tsx` — class settings / game controls
4. `src/app/teacher/students/actions.ts` — teacher-side server actions (approve/reject + new game lifecycle actions)

**Tasks:**

1. **Game status display** in ClassHeader:
   - Show current game status: Setup / Active / Complete / Archived
   - Show round progress: "Round 2 of 5 — 14h remaining (students have 13h)" or "Complete — all 5 rounds finished"
   - Show student count for this class

2. **"Start game" button** — transitions `games.status` from `setup` → `active`, sets `games.started_at`:
   - Only visible when status = 'setup'
   - Should be easy to trigger — available as soon as all warm-up pics are approved
   - Warn (don't block) if no students enrolled yet

3. **Auto-complete on page load** — when `isGameOver(timing)` returns true and `games.status` is still `active`:
   - Flip `games.status` to `complete` automatically
   - Show "Game complete" state in the header
   - Auto-archive can happen too (or defer — complete is sufficient for now)

4. **Results gate** — results page remains locked while any `favorite_comment_status = 'pending'` exists for the final round:
   - The teacher's existing approval queue is the unlock mechanism — no separate "release" button
   - The "party gap" placeholder (B58) stays until the teacher clears all pending items
   - Once all final-round favorites are approved → results page becomes accessible

5. **Class selector enhancement** — each option should show game status inline: "Class A (active — round 2)" / "Class B (setup)"

6. **"Start new game" (low priority, future-proof):**
   - Archives current game (`status = 'archived'`)
   - Creates a new game row (`status = 'setup'`)
   - Stub the button, defer the full flow

**Deliverables:**
- Updated `src/app/teacher/students/class-header.tsx`
- Updated `src/app/teacher/students/actions.ts` (new: `startGame`, `completeGame`, `archiveGame`)
- Updated `src/app/teacher/students/page.tsx` (pass game status to header, auto-complete check)

---

### Chunk 3: Walkthrough bugs + testing doc

**Files needed:** Whatever Mike's walkthrough surfaces, plus `testing-walkthrough-v10.sql`.

**Tasks:** Fix issues from Mike's testing pass, update walkthrough doc to v11 if needed.

---

## SQL files for testing

Use v4 files. **Always run all-in-one-setup-v4 fresh before any jump-to or fast-path file.**

| File | What it does | When to use |
|---|---|---|
| `all-in-one-setup-v4.sql` | Full reset + seed with real photos + create game | Always run first |
| `jump-to-round-1-v4.sql` | Approve pending, start game, set game active | Test round 1 |
| `jump-to-round-2-v4.sql` | Simulate round 1, advance | Test round 2 |
| `jump-to-round-3-v4.sql` | Simulate rounds 1-2, advance | Test round 3 |
| `fast-path-results-v4.sql` | Simulate all rounds, end game | Test results (run after FRESH setup only) |

**Supabase project:** `https://ilctdtppstvmpvuvdqvf.supabase.co`
**Seed photos bucket:** `seed-photos` (public)

---

## SLICE 2 PLAN: Multi-Class / Game-Aware Data (updated)

### What's done
- ✅ Session 58: Student navigation hub (B53) + hydration fix
- ✅ Session 59: Schema migration (games table + game_id FKs) + real photo seed data
- ✅ Session 60: Polish (B55-B59) + B56 favorite comment fix
- 🔲 Session 61: Data layer game_id awareness + teacher game lifecycle + photo folder scoping
- 🔲 Session 62: Multi-class polish, remaining bugs (B48, B49, B41, B11, B54)
- 🔲 Session 63: Round gap timing UI (review_time_hours), student-facing countdown timers

### Architecture (unchanged)

**`games` table (in place, session 61 additions noted):**
```
id            uuid PK
teacher_id    uuid FK → profiles.id
class_id      uuid FK → classes.id
name          text (default 'Game 1')
status        text ('setup' | 'active' | 'complete' | 'archived')
round_count   int (default 3)
started_at    timestamptz (NEW session 61 — set when teacher starts game)
created_at    timestamptz
```

**`classes` table addition (session 61):**
```
review_time_hours  numeric (nullable, default 1) — teacher's review window at the end of each round
```
Student effective time = `round_duration_hours - review_time_hours`.

**Modified tables (in place):**
- `entries.game_id` uuid FK → games.id (nullable, indexed)
- `game_sessions.game_id` uuid FK → games.id (nullable, indexed)

**Helper function (in place):**
- `active_game_id(class_id)` → returns the non-archived game for a class

---

## Deployment overview (for Mike's reference)

**Current stack:**
- Frontend: Next.js (localhost:3000 in dev)
- Backend: Supabase (DB + Auth + Storage)
- Repo: github.com/getgroovr/spotlight-live

**To go live:**
- Vercel (free tier) — connect GitHub repo, auto-deploys on push
- Vercel + Supabase (free tier) — 500MB DB, 1GB storage, 50K monthly auth events
- Custom domain — ~$12/year from any registrar
- Estimated cost: **$0-25/month** to start
