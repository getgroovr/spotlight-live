# 2026-06-15 Slice 1 Handoff #41

- **READ THIS HANDOFF before doing anything.** Always.
- **First action:** Review "NEXT CHAT" section for the suggested flow.

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

## WHAT GOT DONE in chat #41

### Task 1 — B8 fix: broken thumbnails on /play page (READY TO DEPLOY)

`src/lib/deck.ts` — switched query from `entries_public` (view) to `entries` (table) with `.eq("is_starter", true)` filter. The view didn't expose `is_starter`, so non-starter entries in public classes leaked into the pool. Their `media_url` paths pointed to the private `media` bucket, but the code called `getPublicUrl` against `teacher-deck` — producing 404 URLs → blank tiles.

### Task 2 — B9 analysis: class-deck.ts (NO FIX NEEDED)

`src/lib/class-deck.ts` already reads from `entries` (not the view), filters `.eq("is_starter", false)`, and signs from the `media` bucket. Correct as-is.

### Task 3 — B7 confirmation (NEEDS DEPLOY TEST)

`src/app/student/dashboard/page.tsx` already has `export const dynamic = "force-dynamic"` (line 69). Combined with the `revalidatePath` fix from #40's `actions.ts`, this should be working. Just needs the reset-student → walk-through → teacher-rejects → student-refreshes test.

### Task 4 — Pending queue warm-up label (READY TO DEPLOY)

`src/app/teacher/students/pending-queue.tsx` — favorite comment cards now show "Warm-up Round" when `roundNumber === 1` (the enrollment/warm-up session), and "Round N−1" for student rounds. Entry cards unchanged (entries.round_number already = student round directly).

### Task 5 — B2: Classmate comments in completed student rounds (READY TO DEPLOY)

Two files:

**`src/lib/student-archive.ts`** — new `roundSessions` field. Fetches ALL game_sessions for the current class (excluding warm-up at round=1). For each completed student round, pulls the entries the student commented on, resolves media URLs with correct bucket handling (is_starter → teacher-deck getPublicUrl; !is_starter → media createSignedUrl), and packs into `RoundSessionData[]`. Favorite entry sorted first.

**`src/app/student/dashboard/page.tsx`** — completed round expanded view now shows "Your comments this round" section below the student's own entry. Each commented-on entry rendered as: thumbnail + description + student's comment. Favorite entry gets a "★ Your favorite" label. Visual style matches the warm-up's "Your other comments" pattern.

New type exported from student-archive.ts:
```ts
export type RoundSessionData = {
  roundNumber: number;        // student round number (1, 2, 3…)
  completedAt: string | null;
  commentedEntries: ArchiveEntry[];
};
```

### Task 6 — Spreadsheet export review (PARTIALLY DONE)

**Student CSV** (`src/app/student/dashboard/csv-button.tsx`): simple client-side builder — Round, Description, Status, Teacher Note. Minimal, works for its purpose.

**Teacher CSV**: file not yet located. Mike needs to run this from the project root in PowerShell (NOT the SQL Editor):

```powershell
Select-String -Path "src\app\teacher\**\*.tsx","src\app\teacher\**\*.ts" -Pattern "csv|download|export|spreadsheet" -Recurse | Select-Object Path, LineNumber, Line
```

**Mike's design direction for teacher spreadsheet reshape:**
- Purpose is **language review** — seeing every student's writing throughout the game.
- One row per comment, NOT one row per round.
- Grouped by student, then by round, with divider rows.
- Structure: student name + email header row → round header row → one row per comment (photo description | student's comment) → own photo description at end of each round → next round → divider → next student.
- Strip favorites, status, teacher notes — just language.
- Seed voters should probably be excluded.

---

## DESIGN DECISIONS MADE in chat #41

- B9 (class-deck.ts) confirmed correct — no changes needed.
- Classmate comments in student rounds: flat list (no separate favorite card), favorite gets small "★ Your favorite" label, no "why it was your favorite" section (per #39 decision).
- Teacher spreadsheet is purely about language output — strip everything else.

---

## TESTING GUIDE & REUSABLE SQL COMMANDS

(Carried forward from #40 — unchanged)

### Start game NOW (for testing)
```sql
UPDATE classes SET game_starts_at = NOW() WHERE name LIKE '%First%';
```

### Un-start game
```sql
UPDATE classes SET game_starts_at = NULL WHERE name LIKE '%First%';
```

### See game_sessions per student per class
```sql
SELECT gs.id, s.screen_name, c.name AS class_name,
       gs.round, gs.completed_at,
       gs.favorite_comment IS NOT NULL AS has_fav_comment,
       gs.favorite_comment_status
FROM game_sessions gs
JOIN students s ON s.id = gs.student_id
JOIN classes c ON c.id = gs.class_id
ORDER BY c.name, s.screen_name, gs.round;
```

### Inspect a student's entries (status + rejection_reason)
```sql
SELECT id, status, rejection_reason, reviewed_at, reviewed_by, round_number
FROM entries
WHERE student_id IN (SELECT id FROM auth.users WHERE email = 'myked70@yahoo.com')
  AND is_starter = false;
```

### Force a favorite-comment status for testing
```sql
UPDATE game_sessions
SET favorite_comment_status = 'rejected',
    favorite_comment_rejection_reason = 'Test rejection reason'
WHERE id = '<session_id>';
```

---

## BUGS — status tracker

| # | Description | Status | Where |
|---|---|---|---|
| B1 | Teacher student detail: all rounds labeled "ROUND 1" | ✅ Fixed in #36, refined in #40 | `[id]/page.tsx` |
| B2 | Student completed rounds: no classmate comments shown | ✅ Fixed in #41 | `student-archive.ts`, `page.tsx` |
| B3 | `game_sessions.round` always 1 / entries.round_number incorrect | 🟡 Fix written in #39, **untested** | `actions.ts`, `spotlight.jsx`, `shell.jsx`, `student/play/page.tsx` |
| B4 | Seed script round numbers in legacy data | 🟡 Cosmetic | Seed data cleanup |
| B5 | Broken thumbnails on teacher student detail page (commented-on student photos) | ✅ Fixed in #40 | `[id]/page.tsx` |
| B6 | Magic-link login after sign-in retains old session | 🔴 Deferred — needs explicit signOut on email mismatch | Magic-link callback / auth flow |
| B7 | Student dashboard doesn't reflect teacher rejection status | 🟡 Fix in place (#40 revalidatePath + force-dynamic confirmed), **needs deploy test** | `actions.ts`, `student/dashboard/page.tsx` |
| B8 | Broken thumbnails on /play page (visitor demo) | ✅ Fixed in #41 | `src/lib/deck.ts` |
| B9 | Broken thumbnails on /student/play (in-class game) | ✅ No fix needed — class-deck.ts already correct | `src/lib/class-deck.ts` |

---

## DB STATE AFTER CHAT #41

Unchanged from #40. No new migrations.

### game_sessions columns:
`id, student_id, class_id, round, comments, favorites, favorite_comment, completed_at, favorite_comment_status, favorite_comment_reviewed_by, favorite_comment_reviewed_at, favorite_comment_rejection_reason`

### Entries table columns:
`id, student_id, class_id, media_url, media_type, description_url, description_text, description_l1, reading_audio_url, status, uploaded_at, reviewed_by, reviewed_at, is_starter, pod_number, round_number, rejection_reason`

**`entries.media_url` is NOT NULL.** Any INSERT must supply it.

### Two-track ID reminder
- `entries.student_id` = `profiles.id` = `auth.users.id`
- Everything else (`enrollments`, `game_sessions`, `teacher_comments`) = `students.id`

---

## TEST DATA STATE

### Classes

| name | total_rounds | round_duration_hours | notes |
|---|---|---|---|
| Spotlight — Mike's First Class | 3 | 0.25 | 8 seed voters + getgroovr/Lovesick data + asdASDsad |
| Spotlight — Mike's Second Class | 3 | 0.5 | getgroovr (Mike) + 5 seed students sharing one media_url |

### Accounts

| email | display name | role | notes |
|---|---|---|---|
| `getgroovr@yahoo.com` | Mike Dorsten / "Mike" | teacher + student in both classes | |
| `myked70@yahoo.com` | reset multiple times — last walked through as "asdASDsad" | student in First Class | |
| `myked70og@gmail.com` | Lovesick | student in First Class | |
| `thomasoconnor@hotmail.com` | — | profile not finished | |

### Seed voters (First Class)
`seed-voter-5@test.local` through `seed-voter-12@test.local`. All entries `live`, `media_type = photo`.

### Seed students (Second Class — after #40 seed)
`seed-s2-1@test.local` through `seed-s2-5@test.local`. All 5 share the same `media_url`.

---

## NEXT CHAT — suggested flow

### 1. Deploy and test #41 files

Deploy these four files:

| file | destination |
|---|---|
| `deck.ts` | `src/lib/deck.ts` |
| `student-archive.ts` | `src/lib/student-archive.ts` |
| `page.tsx` | `src/app/student/dashboard/page.tsx` |
| `pending-queue.tsx` | `src/app/teacher/students/pending-queue.tsx` |

Test sequence:
- **B7:** Reset a test student → walk through warm-up → teacher rejects → student refreshes → should show "NOT APPROVED" (not "AWAITING APPROVAL").
- **B8:** Visit /play → all 9 tiles should have photos (no blanks).
- **B2:** Log in as a student with completed rounds → expand a completed round → "Your comments this round" should appear below their own entry.

### 2. Teacher spreadsheet reshape

Step 1: Find the teacher export file. Run in PowerShell from project root:
```powershell
Select-String -Path "src\app\teacher\**\*.tsx","src\app\teacher\**\*.ts" -Pattern "csv|download|export|spreadsheet" -Recurse | Select-Object Path, LineNumber, Line
```
Step 2: Upload whatever file(s) that command surfaces.
Step 3: Rewrite to one-row-per-comment, grouped by student then round, with divider rows. Language-only focus.

### 3. B6 — Magic-link session-mismatch sign-out (lower priority)

Detect `auth.getUser().email !== magic-link-email` and force `signOut()` before re-auth.

**File needed:** `src/app/auth/callback/route.ts` (or equivalent).

---

## CARRIED-FORWARD ITEMS (lower priority)

- B3: Round-number fix untested (written in #39)
- B4: Seed script round number cleanup (cosmetic)
- T3: Split pending queue into "Students pending admission" + "Pending photo submissions"
- "+ New class" affordance for teachers
- Media-type dropdown (Photos active, Video/Audio greyed)
- `class_teachers` join table for multi-teacher support (**Slice 2 candidate**)
- Game-start email notification
- Active-class lifecycle automation
- Dashboard ordering rework
- Privacy disclosure for comment-writers
- RPC `class_top_three_reveal` v2 round filter
- Catch-up migration file
- Two-track ID cleanup (entries.student_id vs students.id)
- `listUsers` lookup optimization
- Per-seed-student unique photos (bulk upload utility)

---

## WHAT NOT TO DO

- Don't start coding without seeing existing files (pref #4)
- Don't give line-by-line patches — full file replacements (pref #1)
- Don't issue bash/grep/curl commands — PowerShell or SQL (pref #2)
- Don't use "CSV" in user-facing text — use "spreadsheet" (pref #12)
- Don't use arrows for collapsible rounds — use "See/Close the round" buttons (pref #11)
- Don't call the warm-up "Round 1" or treat it as a student round
- Don't write INSERTs without checking schema constraints (pref #13)
- Don't query `profiles` by `email` — `profiles` has no email column. Go through `auth.users`.

---

## FILES PRODUCED in chat #41

| file (download name) | destination | status |
|---|---|---|
| `deck.ts` | `src/lib/deck.ts` | 🟡 Ready to deploy |
| `student-archive.ts` | `src/lib/student-archive.ts` | 🟡 Ready to deploy |
| `page.tsx` | `src/app/student/dashboard/page.tsx` | 🟡 Ready to deploy |
| `pending-queue.tsx` | `src/app/teacher/students/pending-queue.tsx` | 🟡 Ready to deploy |

---

## SUGGESTED COMMIT FOR CHAT #41 WORK

```
feat(student): classmate comments in completed rounds, fix /play blank tiles, warm-up labels (#41)
```

Files: `src/lib/deck.ts`, `src/lib/student-archive.ts`, `src/app/student/dashboard/page.tsx`, `src/app/teacher/students/pending-queue.tsx`

---

## FILES LIKELY NEEDED NEXT CHAT (chat #42)

| file | why |
|---|---|
| Teacher spreadsheet export file (TBD — run Select-String to find it) | Reshape to one-row-per-comment, language-only |
| `src/app/auth/callback/route.ts` (or equivalent) | B6 — sign-out on email mismatch |
