# SESSION 56 HANDOFF — 6/24/2026

## Headline

**Round 1–3 gameplay tested end-to-end. Awards ceremony works but needs voting rules. Multiple UX issues captured. Multi-teacher/multi-deck architecture discussion started — defer to its own slice after UX cleanup.**

## What got done this session

Full round-by-round playthrough completed (rounds 1–3, plus awards). Several missing-image issues observed (expected — placeholder images don't resolve to real files). Awards ceremony rendered but all entries got 1 vote each, making ranking meaningless. Multiple UX polish items and one architectural question (photo storage / multi-teacher) captured below.

## Testing observations + UI feedback

### B47 — Round flash screen redesign (NEW)

**Current behavior:** "Tap anywhere to begin" with round number.

**What Mike wants:**
- Replace "tap anywhere" with an animated countdown: 5, 4, 3, 2, 1
- Visual theme: boxing ring announcer vibe. Round number on a placard held by a cute character (cute monster, puppy, etc. — TBD). Make it feel exciting, like the round is about to start.
- Screen should auto-advance after the countdown finishes (no tap required).
- Only show on first entry to a round, not on resume (existing B20 issue — fix at the same time).

### B48 — Lock favorites after upload (NEW)

**Current behavior:** After uploading a photo for the next round, the "Pick a different favorite" button remains visible at the top of the congratulations screen. Tapping it returns the student to the favorites flow, which shouldn't be allowed once the upload is submitted.

**What Mike wants:**
- Once the next-round photo is uploaded, remove the favorite section entirely from the congratulations screen.
- The congratulations screen should own the full viewport: big confetti, balloons, celebration. No more editing escape hatches.
- The flow is: pick favorite → write favorite comment → upload next-round photo → DONE. After "done," the only option is "Back to dashboard" (or later, a results link).

### B49 — Comment editing rules (NEW)

**Current behavior:** Unknown whether students can currently edit comments. Mike reports they may have lost the ability.

**What Mike wants:**
- **Non-favorite comments:** Editable until the round closes. Students should be able to revise what they wrote about other photos.
- **Favorite comment:** Locks on submit. Once you pick your favorite and write why, that's final.
- Implementation: check `is_favorite` flag on the comment + whether the round is still active. If both true → locked. Otherwise → editable.

### B50 — Awards ceremony voting rules (NEW)

**Current behavior:** Seed data gives every entry exactly 1 favorite vote → everyone ties for 1st → ranking is meaningless.

**What Mike wants:**
- **Competition ranking (1-2-2-4 style):** If two entries tie for 1st, both get gold. Silver is skipped. Next is bronze. If three tie for 2nd, all get silver, bronze is skipped, etc.
- **Minimum vote threshold:** A winner must have more than 1 vote. No single-vote "winners." If nobody has >1 vote in a round, that round has no winners (or show a message like "No clear favorite this round").
- **Fix seed data:** Distribute favorite votes unevenly in the fast-path SQL. Some entries get 3–4 votes, some get 1, some get 0. This makes testing meaningful.
- Number of winner slots should be configurable in game setup (but for now, default to top 3 with the rules above).

### B51 — Awards screen cleanup (NEW)

**Current behavior:** Bottom of awards screen has a button/link to revisit the warm-up round. After returning to dashboard from awards, the "Play the game" button is still active and leads to an error.

**What Mike wants:**
- Remove the warm-up round link from the awards/results screen entirely.
- On the student dashboard, detect game-over state. If the game is complete:
  - Disable or hide the "Go to the game" / "Play the game" button.
  - Replace it with "See your results" linking to the awards/results page.
  - Or show both with "See your results" as primary and dashboard content as secondary.

### B52 — Photo storage architecture (NEW — DISCUSSION / FUTURE SLICE)

**Current behavior:** Photos are stored flat, tied to entries with no game-level namespace. Warmup photos, round photos, and any future game's photos share the same space. Placeholder images don't resolve (expected during testing, but highlights the underlying issue).

**What Mike wants (and what makes architectural sense):**
- Each game gets a folder/namespace: `/games/{game_id}/photos/`
- Entry photos stored under their game: `/games/{game_id}/photos/{entry_id}.ext`
- Warmup photos stored separately: `/games/{game_id}/warmup/`
- When a game ends, the whole folder can be archived or left in place.
- A new game = a new `game_id` = a clean photo namespace.
- This is the same infrastructure that enables multi-teacher: each teacher creates games, each game has its own deck, students join a specific game.

**Recommendation:** Defer this to its own slice (Slice 2: Multi-teacher / Multi-deck). It touches the DB schema (`games` table with `game_id` as FK on entries, students_games join table), the storage layer, the SQL setup files, and the join/invite flow. Doing it properly is a 2–3 session effort. Clean up the UX issues in the current single-teacher model first.

## Open bugs (UPDATED)

| # | Description | Priority | Status |
|---|---|---|---|
| **B47** | Round flash screen redesign — countdown + boxing ring + cute character | MEDIUM | NEW |
| **B48** | Lock favorites after next-round photo upload — remove editing, full-screen celebration | HIGH | NEW |
| **B49** | Comment editing rules — non-favorites editable until round close, favorite locks on submit | MEDIUM | NEW |
| **B50** | Awards ceremony voting rules — competition ranking, min >1 vote, fix seed data | HIGH | NEW |
| **B51** | Awards screen cleanup — remove warmup link, disable play button post-game | HIGH | NEW |
| **B52** | Photo storage architecture — game-level namespacing, multi-teacher prep | HIGH | NEW (FUTURE SLICE) |
| B45 | Results page redesign — most-voted photos, favorite-only comments, anonymous, celebratory | HIGH | Open (partially addressed by B50) |
| B46 | Gameplay flow improvements — favorite prompt text, "almost done," round splash, game-complete messaging | MEDIUM | Open (partially addressed by B48) |
| B41 | No photo preview in resubmit card | MEDIUM | Open |
| B20 | Flash/intro screen shows at start of every round | LOW | Open (merge into B47) |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |
| LATENT | Visitor deck.ts missing `id` projection bug | LOW | Open |
| WANT | Magic link lands on /play, not /student/dashboard | MEDIUM | Confirmed |

## Session plans

### Session 57: Awards & post-game fixes (B50, B51, B45 overlap)

**Files needed:**
1. This handoff
2. `src/lib/game-results.ts`
3. `src/app/student/results/page.tsx`
4. `src/app/student/dashboard/page.tsx`
5. `fast-path-results.sql` (to fix seed vote distribution)

**Tasks:**
1. Rewrite vote-ranking logic in `game-results.ts`: competition ranking (1-2-2-4), minimum >1 vote threshold.
2. Fix `fast-path-results.sql`: distribute votes unevenly (some entries 3–4 votes, some 1, some 0).
3. Remove warm-up round link from the results/awards page.
4. On student dashboard: detect game-over → disable "Play the game" button, show "See your results" instead.
5. Test with fast-path SQL to verify ranking displays correctly.

### Session 58: Congratulations screen & favorite locking (B48, B49)

**Files needed:**
1. Handoff from session 57
2. `src/game/spotlight.jsx` (or wherever the favorite/upload flow lives)
3. `src/game/shell.jsx`
4. `src/app/student/play/page.tsx`

**Tasks:**
1. After next-round photo upload: remove the favorite editing section from the congratulations screen.
2. Full-screen celebration: confetti animation, balloons, big "Nice work!" — no escape hatches.
3. Implement comment editing rules: non-favorite comments editable until round close, favorite comment locked after submit.
4. Verify the flow: pick favorite → comment → upload → celebration (locked) → dashboard.

### Session 59: Round flash screen redesign (B47, B20)

**Files needed:**
1. Handoff from session 58
2. `src/game/spotlight.jsx` (round intro component)
3. Any animation/asset files

**Tasks:**
1. Replace "tap anywhere to begin" with animated countdown (5-4-3-2-1).
2. Design boxing ring announcer visual: round number on placard, cute character (decide on monster vs dog vs other).
3. Auto-advance after countdown finishes.
4. Fix B20: only show the round intro on first entry, not on resume.

### Session 60: Remaining polish + multi-teacher architecture planning

**Files needed:**
1. Handoff from session 59
2. `src/app/student/dashboard/page.tsx` (B41)
3. Schema/ERD for current data model

**Tasks:**
1. B41 — photo preview in resubmit card.
2. B11 — duplicate photos in warm-up spotlight.
3. WANT — magic link redirect.
4. LATENT — visitor deck.ts id projection.
5. Architecture document for Slice 2: Multi-teacher / Multi-deck. Define the `games` table, `game_id` FK chain, photo storage paths, teacher-game ownership, student-game join model. No code yet — just the plan for sessions 61+.

## SQL files for testing

Same as session 53A. The `fast-path-results.sql` needs modification in session 57 to distribute votes unevenly.

| File | What it does | When to use |
|---|---|---|
| `all-in-one-setup-v3.sql` | Full reset + seed everything | Always run first |
| `jump-to-round-1.sql` | Approve pending, start game | Test round 1 |
| `jump-to-round-2.sql` | Simulate round 1, advance | Test round 2 |
| `jump-to-round-3.sql` | Simulate rounds 1-2, advance | Test round 3 |
| `fast-path-results.sql` | Simulate all rounds, end game | Test results (needs vote fix in session 57) |

## Multi-teacher / multi-deck architecture notes (for Slice 2)

**Core concept:** A `game` is the unit of play. One teacher can run multiple games (different classes, different semesters). Multiple teachers each run their own games independently.

**Schema additions:**
- `games` table: `id`, `teacher_id`, `class_id`, `status` (setup/active/complete/archived), `created_at`, `round_duration_hours`, etc.
- `entries` gets `game_id` FK (entries belong to a game)
- `students_games` join table (a student can be in multiple games across teachers)
- Photo storage keyed by `game_id`

**What this unlocks:**
- Clean photo separation per game
- Game archival (mark complete, optionally delete photos)
- Teacher creates new game → fresh deck, fresh rounds, no leftover data
- Multiple teachers on the same Supabase instance
- Student can participate in different teachers' games

**What this changes:**
- Join flow: student joins a specific game (not just "the class")
- Dashboard: shows the student's active game(s)
- SQL setup files: need game creation step
- All queries that currently assume "one game" need `WHERE game_id = X`

**Estimated effort:** 2–3 sessions for schema + core queries + updated setup SQL. Then 1–2 sessions to update UI components that assume single-game.

## User preferences

Carried forward from session 53A, plus:
- **Fun matters even more.** Boxing ring countdown, confetti, balloons — the game should feel like a celebration at every transition.
- **Lock things down after submission.** Once a student uploads, they're done. No going back to re-pick favorites.
- **Voting rules must be meaningful.** No single-vote winners. Competition ranking for ties.
- **Photo architecture needs a real solution.** Folder-per-game, not flat. Solve alongside multi-teacher.
- **Break big work into file-based chunks.** Each session = specific files + specific tasks. Handoff drives the work.
