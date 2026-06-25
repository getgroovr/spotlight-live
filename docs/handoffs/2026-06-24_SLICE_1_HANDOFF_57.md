# SESSION 57 HANDOFF — 6/24/2026

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
- In `game_sessions`, the warm-up session's `round` value is the enrollment round (1). Student rounds N appear at session position N+1 in chronological order. Code that displays must subtract 1 to get the displayed student round number.

---

## What got done this session

Reviewed all session 57 target files. **All session 57 code tasks are already complete in the uploaded files:**

1. **B50 — Vote ranking logic** (`game-results.ts`): Competition ranking (1-2-2-4) with `MIN_VOTES = 2`. Entries below threshold excluded. Rounds with no qualifying entries get `noWinners = true`.

2. **B50 — Seed data** (`fast-path-results.sql`): Uneven vote distribution. Round 1: gold (4 votes), silver (3), bronze (2). Round 2: gold (4), silver tie (2+2). Round 3: gold tie (3+3), sub-threshold entries with 1 vote. Verification queries included.

3. **B51 — Results page** (`page_-student_results.tsx`): Warm-up round filtered out (line 384: `roundNumber > 0`). No warm-up link on results page.

4. **B51 — Dashboard post-game** (`page_-student_dashboard.tsx`): `isGameOver` → shows "🏆 See your results" button (lines 1000-1011). "Go to the game" button only shown when game is active.

5. **B47 — Round splash** (`shell.jsx`): Boxing ring countdown with cute monster, 5→1 animation, auto-advance after 6.5s, tap to skip. B20 fix: `sessionStorage` tracks seen splashes so they only show once per round.

**What still needs doing:** testing with the seed SQL to verify the ranking renders correctly, and several remaining bugs from the open list.

---

## Hydration error (Image 2 from testing)

The Next.js hydration error at `/student/play` is a real but minor bug. The diff shows `minHeight: "100vh"` appearing on the client but not the server. The `GameShell` component in `shell.jsx` calls `hasSeenRoundSplash()` which reads `sessionStorage` — this returns `false` on the server (no sessionStorage) but potentially `true` on the client. The `useState(shouldShowSplash)` initializer runs differently server vs client.

**Fix:** Initialize `showSplash` to `false` in the server render and set it in a `useEffect`. This is a one-line change in `shell.jsx`. Fix in next session.

---

## Photo display issue — testing artifact, not production bug

The blue "SV# R2" placeholder cards in the Spotlight grid are seed data artifacts. The `fast-path-results.sql` uses `https://placehold.co/400x400/...` URLs which may not load reliably. In a real game, every photo comes from an actual student upload to Supabase storage. **Not a production bug.**

**Recommendation for Slice 2:** Bundle 5-8 Creative Commons test photos with the project. The seed SQL uploads them to Supabase storage using the new per-game folder structure. Every test run looks like a real game.

---

## The /play vs /student/play navigation problem (B53 — NEW)

### Current flow
1. Visitor → `/play` → plays warm-up → enters email → gets magic link
2. Magic link → authenticates user → redirects to... `/play`? or `/student/dashboard`?
   (WANT bug says it lands on `/play` — needs verification in `src/app/play/actions.ts`)
3. First visit to `/student/dashboard` → "Finish joining" form → student completes profile
4. Subsequent visits: student goes to `/student/dashboard` → "Go to the game" → `/student/play`
5. If session expires → dashboard redirects to `/play` (warm-up) → dead end for returning students

### The problem
There's no clear re-entry path. After the initial magic link, if the session dies, the student is stuck. And even when the session is alive, the student has to know to go to `/student/dashboard`. There's no sign-in page, no "enter email to get a new link" flow.

### Mike's solution (endorsed)
**Make `/student/dashboard` the single hub.** Instead of redirecting unauthenticated users to `/play`, show a simple "enter your email" form right on the dashboard page. This form sends a new magic link via `signInWithOtp`. One URL, one entry point, all states handled:

- No session → email form → magic link → re-authenticated → dashboard
- Session + incomplete profile → "Finish joining" form
- Session + profile complete + game active → "Go to the game" button
- Session + game over → "See your results" button

### Implementation
1. Change `src/app/play/actions.ts`: set the `emailRedirectTo` in `signInWithOtp` to `/student/dashboard` (not `/play`).
2. Change `src/app/student/dashboard/page.tsx` line 649: instead of `redirect("/play")`, render a `RequestMagicLinkForm` component.
3. Create `RequestMagicLinkForm` — a small client component: email input + button → calls a server action that runs `signInWithOtp` → shows "check your email."
4. The teacher tells students: "go to `yoursite.com/student/dashboard`" — that's the only URL they need.

---

## Open bugs (UPDATED)

| # | Description | Priority | Status |
|---|---|---|---|
| **B53** | Student navigation hub — dashboard as single entry point, re-auth form, fix magic link redirect | **HIGH** | PARTIALLY DONE (auth/confirm redirect pending) |
| B47 | Round flash screen redesign — countdown + boxing ring + cute character | MEDIUM | ✅ DONE |
| B48 | Lock favorites after next-round photo upload — remove editing, full-screen celebration | HIGH | Open |
| B49 | Comment editing rules — non-favorites editable until round close, favorite locks on submit | MEDIUM | Open |
| B50 | Awards ceremony voting rules — competition ranking, min >1 vote, fix seed data | HIGH | ✅ DONE |
| B51 | Awards screen cleanup — remove warmup link, disable play button post-game | HIGH | ✅ DONE |
| B52 | Photo storage architecture — game-level namespacing, multi-teacher prep | HIGH | Open (SLICE 2) |
| B45 | Results page redesign — most-voted photos, favorite-only comments, anonymous, celebratory | HIGH | ✅ DONE |
| B41 | No photo preview in resubmit card | MEDIUM | Open |
| B20 | Flash/intro screen shows at start of every round | LOW | ✅ DONE (merged into B47) |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |
| LATENT | Visitor deck.ts missing `id` projection bug | LOW | Open |
| HYDRATION | shell.jsx hydration mismatch — sessionStorage read in useState initializer | LOW | ✅ DONE |

---

## ARCHIVE REMINDER

Before starting Slice 2 code changes, archive the current state:

```powershell
git add -A
git commit -m "slice 1 complete: gameplay loop, awards ceremony, round splash, dashboard post-game state"
git tag slice-1-complete -m "Slice 1: Single-teacher gameplay loop complete"
git push origin main
git push origin slice-1-complete
```

This preserves the exact state of Slice 1. Continue working in the same repo. The tag lets you return to this point if needed.

---

## SLICE 2 PLAN: Multi-Teacher / Multi-Deck

### What Slice 2 delivers
- Multiple teachers can each run their own games independently
- A teacher can run multiple games (different classes, different semesters)
- Each game gets its own photo namespace — clean separation, easy archival
- Students join a specific game, not just "the class"
- One URL hub for students: `/student/dashboard` handles all states
- Real test photos bundled with seed data

### Architecture overview

**New table: `games`**
```
id            uuid PK
teacher_id    uuid FK → profiles.id (or auth.users.id)
class_id      uuid FK → classes.id
status        text ('setup' | 'active' | 'complete' | 'archived')
round_count   int (number of student rounds)
round_duration_hours int
created_at    timestamptz
```

**Modified tables:**
- `entries` gets `game_id uuid FK → games.id`
- `game_sessions` gets `game_id uuid FK → games.id`
- New join table: `students_games` (student_id, game_id, joined_at)

**Photo storage:**
- Structure: `/games/{game_id}/photos/{entry_id}.ext`
- Warmup: `/games/{game_id}/warmup/{entry_id}.ext`
- Test photos: `/games/{game_id}/test/{filename}.ext`

**Query changes:**
- All queries that currently assume "one game" need `WHERE game_id = X`
- Dashboard, results, play pages all resolve the student's active game first

### Session plan — broken into file-based chunks

#### Session 58: Student navigation hub (B53) + hydration fix — ✅ DONE THIS SESSION

**Files produced:**

| File (download name) | Destination | What changed |
|---|---|---|
| `shell.jsx` | `src/game/shell.jsx` | Hydration fix: `showSplash` initializes to `false`, sessionStorage check moved to `useEffect`. Server and client HTML now match. |
| `actions.ts` | `src/app/play/actions.ts` | New `requestMagicLink` action for re-auth from dashboard. Also: `enrollStudent` redirect now passes `?next=/student/dashboard` to `/auth/confirm`. |
| `RequestMagicLinkForm.tsx` | `src/app/student/dashboard/RequestMagicLinkForm.tsx` | NEW file. Client component: email input → calls `requestMagicLink` → "check your email" confirmation. Links to `/play` for students who haven't enrolled yet. |
| `page_-student_dashboard.tsx` | `src/app/student/dashboard/page.tsx` | No-session state now renders the sign-in form instead of `redirect("/play")`. Removed `redirect` import. Improved "not-enrolled" error with a button to `/play`. |

**STILL NEEDED — not in these files:**
The `/auth/confirm` route handler needs to read the `next` query param and redirect there after token exchange. Without this change, the `?next=/student/dashboard` param is passed but ignored. Upload `src/app/auth/confirm/route.ts` (or wherever the auth callback lives) in the next session so the redirect chain is complete.

#### Session 59: Schema migration + seed data overhaul

**Goal:** Add the `games` table, FK chain, and rewrite seed SQL.

**Files needed:**
1. Handoff from session 58
2. `supabase/migrations/` (current migration files for reference)
3. `sql/all-in-one-setup-v3.sql`
4. `sql/fast-path-results.sql`
5. 5-8 Creative Commons test photos (Mike to source, or Claude to suggest URLs)

**Tasks:**
1. Write migration: create `games` table, add `game_id` FK to `entries` and `game_sessions`, create `students_games` join table.
2. Rewrite `all-in-one-setup-v3.sql` → v4: creates a game row, seeds entries under that game, uploads real test photos to Supabase storage under `/games/{game_id}/photos/`.
3. Rewrite `fast-path-results.sql`: references the seeded game, photos resolve to real images.
4. Update `jump-to-round-*.sql` files for the new schema.
5. Test: run v4 setup → verify photos display in the Spotlight grid.

#### Session 60: Update data layer for game_id awareness

**Goal:** Every query that touches entries or game_sessions filters by `game_id`.

**Files needed:**
1. Handoff from session 59
2. `src/lib/class-deck.ts` (loads the deck for `/student/play`)
3. `src/lib/game-results.ts` (loads results for `/student/results`)
4. `src/lib/student-archive.ts` (loads dashboard data)
5. `src/app/play/actions.ts` (enrollment + round save)

**Tasks:**
1. Add `resolveActiveGame(classId)` helper → returns the active `game_id` for a class.
2. Update `loadClassDeck()`: filter entries by `game_id`.
3. Update `getGameResults()`: filter sessions by `game_id`.
4. Update `getStudentArchive()`: filter entries + sessions by `game_id`.
5. Update `enrollStudent()`: create `students_games` row, set `game_id` on session.
6. Update `saveStudentRound()` / `addEntry()`: set `game_id` on new entries.

#### Session 61: Teacher game management + multi-class UI

**Goal:** Teacher can create/manage games.

**Files needed:**
1. Handoff from session 60
2. `src/app/teacher/dashboard/page.tsx`
3. `src/app/teacher/deck/page.tsx`
4. Teacher settings components

**Tasks:**
1. "New game" button on teacher dashboard → creates a `games` row.
2. Teacher deck page scoped to the active game.
3. Game status controls: start game, end game, archive game.
4. Game selector if teacher has multiple games (class switcher → game switcher).

#### Session 62: Remaining Slice 1 polish (B48, B49, B41, B11)

**Goal:** Clean up the UX items that don't depend on multi-teacher.

**Files needed:**
1. Handoff from session 61
2. `src/game/spotlight.jsx` (favorite locking, comment editing)
3. `src/app/student/dashboard/page.tsx` (resubmit card photo preview)

**Tasks:**
1. B48: After next-round photo upload, remove favorite editing section. Full-screen celebration.
2. B49: Comment editing rules — non-favorites editable until round close, favorite locked.
3. B41: Photo preview in resubmit card.
4. B11: Duplicate photos in warm-up spotlight.

### Estimated effort
- Sessions 58-59: Foundation (navigation fix + schema) — 2 sessions
- Sessions 60-61: Data layer + teacher UI — 2 sessions
- Session 62: Polish — 1 session
- Total: ~5 sessions for core Slice 2, then iteration

---

## SQL files for testing

Same as session 53A. Use v3 until session 59 produces v4.

| File | What it does | When to use |
|---|---|---|
| `all-in-one-setup-v3.sql` | Full reset + seed everything | Always run first |
| `jump-to-round-1.sql` | Approve pending, start game | Test round 1 |
| `jump-to-round-2.sql` | Simulate round 1, advance | Test round 2 |
| `jump-to-round-3.sql` | Simulate rounds 1-2, advance | Test round 3 |
| `fast-path-results.sql` | Simulate all rounds, end game | Test results (B50 vote distribution) |
