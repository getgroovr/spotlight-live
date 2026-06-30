# SESSION 59 HANDOFF — 6/25/2026

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

## KEY CONCEPT: Round Timing / Gaps — NEW (session 59)

**There must be a time gap between rounds.** The flow is NOT "round ends → next round starts immediately." It is:

1. Round N ends (timer expires or teacher closes it)
2. **Gap period** — teacher reviews submissions + comments, students wait
3. Round N+1 starts (teacher starts it, or scheduled time)

After Round 3 (final round):
1. Round 3 ends
2. **"Setting up for the party"** gap — students see a message like "Come back in an hour to see who got the most favorites!"
3. Teacher reviews final submissions + comments
4. Teacher triggers the results/celebration (or it auto-opens after the gap)

**This means:**
- The teacher dashboard needs controls for round gap duration (set at class creation)
- Students see a "between rounds" state: countdown to next round, or "waiting for teacher"
- The results page is LOCKED until the teacher releases it (or the gap timer expires)
- Each round has: start time, end time, review gap, next round start time

This is a design/UX task that touches multiple files. Defer the full implementation but keep it in mind for session 61+.

---

## What got done this session (59)

### Slice 1 archived
- `git commit` with full message covering B47, B50, B51, B53, hydration fix, auth confirm
- `git tag slice-1-complete` pushed to origin
- Clean separation point — `git checkout slice-1-complete` to return here

### Session 58 completion confirmed
- `src/app/auth/confirm/route.ts` already reads `?next` param and defaults to `/student/dashboard`
- `syncCurrentClass()` copies enrollment class_id to profiles on login
- No changes needed — session 58 is fully complete

### Slice 2 schema foundation
| File | Destination | What it does |
|---|---|---|
| `20260625120000_add_games_table.sql` | `supabase/migrations/` | Creates `games` table (id, teacher_id, class_id, name, status, round_count). Adds `game_id` FK to `entries` and `game_sessions` (nullable). Helper function `active_game_id(class_id)`. RLS policies. |
| `upload-seed-photos.ps1` | `sql/` | Uploads 9 real photos to Supabase storage `seed-photos` bucket (public). Maps local filenames with spaces → storage names with underscores. |
| `all-in-one-setup-v4.sql` | `sql/` | Replaces v3. Creates a `games` row. Uses real photo URLs from Supabase storage. Threads `game_id` through all entries and game_sessions. Supabase URL hardcoded for Mike's project. |
| `fast-path-results-v4.sql` | `sql/` | Game-aware. Sets `games.status = 'complete'`. Uses real photos (copies media_url from round 1 entries). |
| `jump-to-round-1-v4.sql` | `sql/` | Game-aware. Sets `games.status = 'active'`. |
| `jump-to-round-2-v4.sql` | `sql/` | Game-aware. |
| `jump-to-round-3-v4.sql` | `sql/` | Game-aware. |
| `venice_cafe.jpg` | `sql/seed-photos/` | Converted from .webp |

### Photos uploaded to Supabase storage
9 photos in `seed-photos` bucket (public):
golden-at-sunset.jpg, black_wolf.jpg, striped_mustang.jpg, venice_cafe.jpg, mountains_in_a_storm.jpg, rounded_entrances.jpg, steam_punk.jpg, pool_by_the_ocean.jpg, maltese.jpg

### Testing walkthrough completed
Mike ran full 3-round manual walkthrough with real photos. All photos display correctly. Multiple bugs found (see below).

---

## Open bugs (UPDATED)

| # | Description | Priority | Status |
|---|---|---|---|
| **B59** | game_sessions needs UNIQUE constraint on (student_id, class_id, round) — duplicate sessions cause inflated vote counts (28 voters instead of 9). Fast-path ON CONFLICT DO NOTHING doesn't work without uniqueness. | **CRITICAL** | New |
| **B57** | Splash page between rounds missing — likely regression from hydration fix (showSplash moved to useEffect in shell.jsx). Round transitions feel abrupt. | **HIGH** | New |
| **B56** | Favorite comment not showing in teacher review queue — only photo submittal shows, comment approval is missing from the pending items list | **HIGH** | New |
| **B58** | Round 3 end goes straight to celebration without gap for teacher to review final comment. Need "setting up for the party — come back soon" holding state. | **HIGH** | New |
| **B55** | After replaying a completed round, student gets stuck on "Upload for Round N" screen. Button should change to "Back to dashboard" when round is already complete. | **MEDIUM** | New |
| **B54** | Completed round section on dashboard should collapse/minimize once student uploads next-round photo. Current round should be prominent, completed rounds tucked away. | **LOW** | New |
| B41 | No photo preview in teacher's review card for picture submittals (confirmed again this session) | MEDIUM | Open |
| B48 | Lock favorites after next-round photo upload — remove editing, full-screen celebration | HIGH | Open |
| B49 | Comment editing rules — non-favorites editable until round close, favorite locks on submit | MEDIUM | Open |
| B11 | Duplicate photos in warm-up spotlight | LOW | Open |
| LATENT | Visitor deck.ts missing `id` projection bug | LOW | Open |

### Closed this slice
| # | Description | Closed |
|---|---|---|
| B47 | Round flash screen redesign | Session 57 |
| B50 | Awards ceremony voting rules | Session 57 |
| B51 | Awards screen cleanup | Session 57 |
| B20 | Flash/intro screen shows every round | Session 57 |
| B53 | Student navigation hub | Session 58 |
| HYDRATION | shell.jsx hydration mismatch | Session 58 |

---

## Ideas list — NEW (track for future sessions)

1. **Admin dashboard** — admin limits how many classes a teacher can create; system oversight
2. **Student → teacher messaging** — button in student profile to message the teacher
3. **Student → admin messaging** — separate button to message the admin/support
4. **Auto-class-creation** — when class hits 9 students, system auto-creates next class (teacher sets desired count)
5. **Teacher sets desired number of classes** — "I want 4 classes" → system creates 4, fills sequentially
6. **Deployment/hosting setup guide** — Vercel + Supabase + custom domain walkthrough
7. **Round gap timing** — configurable gap between rounds for teacher review (see KEY CONCEPT above)
8. **"Party setup" holding page** — after final round, students see countdown to results reveal

---

## NEXT SESSION (60): Polish + Data Layer

### Priority order
1. B59 — game_sessions unique constraint (quick SQL fix)
2. B57 — splash page between rounds (shell.jsx)
3. B56 — favorite comment in teacher review queue
4. B58 — round 3 end flow / party gap placeholder
5. B55 — replay prevention / back to dashboard button
6. Update testing-walkthrough to v10
7. If time: start data layer game_id awareness (session 60 original plan)

### Chunk 1: B59 + B57 (schema fix + splash page)

**Files needed:**
1. This handoff
2. `src/game/shell.jsx` — the splash page lives here; hydration fix may have broken it

**Tasks:**
1. Write a small migration adding UNIQUE constraint on game_sessions(student_id, class_id, round). Or add it to the v4 setup SQL cleanup phase.
2. Review shell.jsx — the `showSplash` state was moved to `useEffect` for the hydration fix. Check if this accidentally prevents the splash from ever showing. The splash should fire once per round (tracked via sessionStorage key per round).

**Deliverables:**
- Migration SQL (one ALTER TABLE)
- Updated `shell.jsx` with splash fix

### Chunk 2: B56 + B58 + B55 (teacher review + round flow)

**Files needed:**
1. `src/app/teacher/students/page.tsx` — the teacher review queue (where pending items show)
2. `src/app/student/play/page.tsx` — the student play flow (round completion, upload prompt)
3. `src/app/student/dashboard/page.tsx` — dashboard state management
4. `src/game/spotlight.jsx` — the game play component (end-of-round behavior)

**Tasks:**
1. B56: Find why favorite comments aren't appearing in the teacher review list. The query probably filters for `favorite_comment_status = 'pending'` but may be scoped wrong or the component doesn't render them.
2. B58: After round 3 completion, instead of going straight to celebration, show a "party setup" holding state. This can be a simple message: "We're tallying the votes! Check back soon to see the winners." Teacher must approve final items before results unlock.
3. B55: When a student navigates to `/student/play` for an already-completed round, detect this and show "Back to dashboard" instead of "Upload for Round N."

**Deliverables:**
- Updated teacher page (B56)
- Updated play page or spotlight component (B58, B55)

### Chunk 3: Testing walkthrough v10

**Files needed:**
1. `testing-walkthrough-v9.sql`

**Tasks:**
1. Update SQL file names (v4 references)
2. Update step descriptions to match current flow
3. Add notes about the round gap concept
4. Update open issues section

**Deliverables:**
- `testing-walkthrough-v10.sql`

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

## SLICE 2 PLAN: Multi-Teacher / Multi-Deck (updated)

### What's done
- ✅ Session 58: Student navigation hub (B53) + hydration fix
- ✅ Session 59: Schema migration (games table + game_id FKs) + real photo seed data
- 🔲 Session 60: Polish (B55-B59) + data layer game_id awareness
- 🔲 Session 61: Teacher game management + multi-class UI
- 🔲 Session 62: Remaining polish (B48, B49, B41, B11, B54)

### Architecture (unchanged from session 57 handoff)

**`games` table (in place):**
```
id            uuid PK
teacher_id    uuid FK → profiles.id
class_id      uuid FK → classes.id
name          text (default 'Game 1')
status        text ('setup' | 'active' | 'complete' | 'archived')
round_count   int (default 3)
created_at    timestamptz
```

**Modified tables (in place):**
- `entries.game_id` uuid FK → games.id (nullable, indexed)
- `game_sessions.game_id` uuid FK → games.id (nullable, indexed)

**Helper function (in place):**
- `active_game_id(class_id)` → returns the non-archived game for a class

### Session 60 data layer tasks (after polish)

**Files needed:**
1. `src/lib/class-deck.ts` — loads the deck for `/student/play`
2. `src/lib/game-results.ts` — loads results for `/student/results`
3. `src/lib/student-archive.ts` — loads dashboard data
4. `src/app/play/actions.ts` — enrollment + round save

**Tasks:**
1. Add `resolveActiveGame(classId)` helper → returns the active `game_id`
2. Update `loadClassDeck()`: filter entries by `game_id`
3. Update `getGameResults()`: filter sessions by `game_id`
4. Update `getStudentArchive()`: filter entries + sessions by `game_id`
5. Update `enrollStudent()`: set `game_id` on new entries
6. Update `saveStudentRound()` / `addEntry()`: set `game_id` on new entries

---

## Deployment overview (for Mike's reference)

**Current stack:**
- Frontend: Next.js (localhost:3000 in dev)
- Backend: Supabase (DB + Auth + Storage)
- Repo: github.com/getgroovr/spotlight-live

**To go live:**
- Vercel (free tier) — connect GitHub repo, auto-deploys on push
- Supabase (free tier) — 500MB DB, 1GB storage, 50K monthly auth events
- Custom domain — ~$12/year from any registrar
- Estimated cost: **$0-25/month** to start

**Path to users:**
1. Deploy to Vercel (~30 min one-time setup)
2. Use in own classroom
3. Show to teacher friends → give them accounts
4. If demand grows → add pricing
